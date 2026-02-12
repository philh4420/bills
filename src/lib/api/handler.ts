import { NextRequest } from "next/server";

import { WriteAuditMutation, WriteCommandContext, WriteUndoRegistration } from "@/lib/audit/context";
import { requireAuth } from "@/lib/auth/server";
import {
  createAuditEventRecord,
  createCommandRecord,
  updateCommandRecord
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError } from "@/lib/util/http";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_AUDIT_TEXT_LENGTH = 4000;

export interface OwnerAuthContext {
  uid: string;
  email: string;
  command?: WriteCommandContext;
}

function truncateText(value: string): string {
  if (value.length <= MAX_AUDIT_TEXT_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_AUDIT_TEXT_LENGTH)}…`;
}

async function readRequestPayloadForAudit(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await request.clone().json();
    } catch {
      return { invalidJson: true };
    }
  }

  if (contentType.includes("multipart/form-data")) {
    return { formData: true };
  }

  if (contentType.includes("text/plain")) {
    try {
      const raw = await request.clone().text();
      return truncateText(raw);
    } catch {
      return { textReadError: true };
    }
  }

  return undefined;
}

export async function withOwnerAuth<T>(
  request: NextRequest,
  fn: (context: OwnerAuthContext) => Promise<T>
) {
  let authContext: { uid: string; email: string };

  try {
    const auth = await requireAuth(request);
    authContext = { uid: auth.uid, email: auth.email };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return jsonError(401, "Unauthorized");
      }
      if (error.message === "FORBIDDEN" || error.message === "FORBIDDEN_OWNER_MISMATCH") {
        return jsonError(403, "Access denied: this app is private to a single owner account.");
      }
      if (error.message === "OWNER_NOT_CONFIGURED") {
        return jsonError(
          500,
          "Owner lock is not configured. Set OWNER_UID or OWNER_GOOGLE_EMAIL."
        );
      }
    }

    return jsonError(500, "Authentication failure", error instanceof Error ? error.message : error);
  }

  const method = request.method.toUpperCase();
  const isWrite = WRITE_METHODS.has(method);
  const path = request.nextUrl.pathname;

  let commandId: string | null = null;
  let undoRegistration: WriteUndoRegistration | null = null;
  let mutation: WriteAuditMutation | null = null;
  let requestPayload: unknown;

  if (isWrite) {
    const now = toIsoNow();
    requestPayload = await readRequestPayloadForAudit(request);
    commandId = await createCommandRecord(authContext.uid, {
      method,
      path,
      actorEmail: authContext.email,
      status: "running",
      reversible: false,
      requestPayload,
      createdAt: now,
      updatedAt: now
    });
  }

  try {
    const response = await fn({
      uid: authContext.uid,
      email: authContext.email,
      command: commandId
        ? {
            id: commandId,
            setUndo: (registration) => {
              undoRegistration = registration;
            },
            setMutation: (nextMutation) => {
              mutation = {
                ...(mutation || {}),
                ...nextMutation
              };
            }
          }
        : undefined
    });

    if (commandId) {
      const statusCode = response instanceof Response ? response.status : 200;
      const succeeded = statusCode >= 200 && statusCode < 400;
      const now = toIsoNow();
      const undo = undoRegistration as WriteUndoRegistration | null;
      const mutationMeta = mutation as WriteAuditMutation | null;

      await updateCommandRecord(authContext.uid, commandId, {
        status: succeeded ? "succeeded" : "failed",
        reversible: succeeded && Boolean(undo),
        undoKind: undo?.kind,
        undoPayload: undo?.payload,
        responseStatus: statusCode,
        entityType: mutationMeta?.entityType,
        entityId: mutationMeta?.entityId,
        month: mutationMeta?.month,
        updatedAt: now
      });

      await createAuditEventRecord(authContext.uid, {
        commandId,
        type: "write",
        method,
        path,
        actorEmail: authContext.email,
        success: succeeded,
        entityType: mutationMeta?.entityType,
        entityId: mutationMeta?.entityId,
        month: mutationMeta?.month,
        before: mutationMeta?.before,
        after: mutationMeta?.after,
        requestPayload,
        responseStatus: statusCode,
        message: mutationMeta?.message,
        createdAt: now
      });

      if (response instanceof Response) {
        response.headers.set("x-command-id", commandId);
      }
    }

    return response;
  } catch (error) {
    if (commandId) {
      const now = toIsoNow();
      const message =
        error instanceof Error ? truncateText(error.message || "Unhandled write error") : "Unhandled write error";
      const mutationMeta = mutation as WriteAuditMutation | null;

      await updateCommandRecord(authContext.uid, commandId, {
        status: "failed",
        errorMessage: message,
        entityType: mutationMeta?.entityType,
        entityId: mutationMeta?.entityId,
        month: mutationMeta?.month,
        updatedAt: now
      }).catch(() => {
        // Keep original error semantics even if audit write fails.
      });

      await createAuditEventRecord(authContext.uid, {
        commandId,
        type: "write",
        method,
        path,
        actorEmail: authContext.email,
        success: false,
        entityType: mutationMeta?.entityType,
        entityId: mutationMeta?.entityId,
        month: mutationMeta?.month,
        before: mutationMeta?.before,
        after: mutationMeta?.after,
        requestPayload,
        message,
        createdAt: now
      }).catch(() => {
        // Keep original error semantics even if audit write fails.
      });
    }

    return jsonError(500, "Request failed", error instanceof Error ? error.message : error);
  }
}
