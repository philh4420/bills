import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import {
  createAuditEventRecord,
  getCommandRecord,
  updateCommandRecord,
  updateLineItem,
  deleteLineItem
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { LineItem } from "@/types";

type UndoResult =
  | { ok: true; commandId: string }
  | { ok: false; status: number; error: string };

type LineItemCollection = "houseBills" | "incomeItems" | "shoppingItems" | "myBills";

function isLineItemCollection(value: unknown): value is LineItemCollection {
  return (
    value === "houseBills" || value === "incomeItems" || value === "shoppingItems" || value === "myBills"
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseLineItem(value: unknown): LineItem | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }

  if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.amount !== "number") {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    dueDayOfMonth: typeof row.dueDayOfMonth === "number" ? row.dueDayOfMonth : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : toIsoNow(),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : toIsoNow()
  };
}

export async function undoCommandForUser(
  uid: string,
  email: string,
  commandId: string
): Promise<UndoResult> {
  const command = await getCommandRecord(uid, commandId);
  if (!command) {
    return { ok: false, status: 404, error: "Command not found." };
  }

  if (command.status === "undone") {
    return { ok: false, status: 409, error: "Command has already been undone." };
  }

  if (command.status !== "succeeded") {
    return { ok: false, status: 409, error: "Only successful commands can be undone." };
  }

  if (!command.reversible || !command.undoKind || !command.undoPayload) {
    return { ok: false, status: 400, error: "This command does not support undo." };
  }

  const payload = asRecord(command.undoPayload);
  if (!payload) {
    return { ok: false, status: 400, error: "Undo payload is invalid." };
  }

  try {
    if (command.undoKind === "line-item-create") {
      if (!isLineItemCollection(payload.collection) || typeof payload.id !== "string") {
        return { ok: false, status: 400, error: "Undo payload is missing collection or id." };
      }
      await deleteLineItem(uid, payload.collection, payload.id);
      await recomputeAndPersistSnapshots(uid);
    } else if (command.undoKind === "line-item-update" || command.undoKind === "line-item-delete") {
      if (!isLineItemCollection(payload.collection) || typeof payload.id !== "string") {
        return { ok: false, status: 400, error: "Undo payload is missing collection or id." };
      }
      const before = parseLineItem(payload.before);
      if (!before) {
        return { ok: false, status: 400, error: "Undo payload is missing previous item state." };
      }

      await updateLineItem(uid, payload.collection, payload.id, {
        name: before.name,
        amount: before.amount,
        dueDayOfMonth: before.dueDayOfMonth ?? 1,
        createdAt: before.createdAt,
        updatedAt: toIsoNow()
      });
      await recomputeAndPersistSnapshots(uid);
    } else {
      return { ok: false, status: 400, error: `Unsupported undo kind: ${command.undoKind}` };
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Undo execution failed."
    };
  }

  const now = toIsoNow();
  await updateCommandRecord(uid, commandId, {
    status: "undone",
    reversible: false,
    undoneAt: now,
    updatedAt: now
  });

  await createAuditEventRecord(uid, {
    commandId,
    type: "undo",
    method: "POST",
    path: `/api/undo/${commandId}`,
    actorEmail: email,
    success: true,
    entityType: command.entityType,
    entityId: command.entityId,
    month: command.month,
    before: command.undoPayload,
    after: {
      commandStatus: "undone"
    },
    message: `Undid command ${commandId}`,
    createdAt: now
  }).catch(() => {
    // Undo result should still succeed if audit append fails.
  });

  return { ok: true, commandId };
}
