import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import {
  getCommandRecord,
  listAuditEventRecords
} from "@/lib/firestore/repository";
import { monthKeySchema } from "@/lib/api/schemas";
import { jsonError, jsonOk } from "@/lib/util/http";

export const runtime = "nodejs";

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64");
}

function decodeCursor(cursor: string | null): number {
  if (!cursor) {
    return 0;
  }
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf8");
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") || "20", 10);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
    const cursor = decodeCursor(request.nextUrl.searchParams.get("cursor"));
    const entityType = request.nextUrl.searchParams.get("entityType")?.trim() || "";
    const entityId = request.nextUrl.searchParams.get("entityId")?.trim() || "";
    const month = request.nextUrl.searchParams.get("month")?.trim() || "";

    if (month) {
      const parsed = monthKeySchema.safeParse(month);
      if (!parsed.success) {
        return jsonError(400, "Invalid month query. Use YYYY-MM.");
      }
    }

    const allEvents = await listAuditEventRecords(uid);
    const filtered = allEvents.filter((event) => {
      if (entityType && event.entityType !== entityType) {
        return false;
      }
      if (entityId && event.entityId !== entityId) {
        return false;
      }
      if (month && event.month !== month) {
        return false;
      }
      return true;
    });

    const page = filtered.slice(cursor, cursor + limit);
    const nextOffset = cursor + page.length;
    const nextCursor = nextOffset < filtered.length ? encodeCursor(nextOffset) : null;

    const commandIds = Array.from(
      new Set(page.map((event) => event.commandId).filter((value): value is string => Boolean(value)))
    );
    const commandRows = await Promise.all(commandIds.map((id) => getCommandRecord(uid, id)));
    const commandById = new Map(
      commandRows.filter((row): row is NonNullable<typeof row> => Boolean(row)).map((row) => [row.id, row])
    );

    return jsonOk({
      events: page.map((event) => {
        const command = event.commandId ? commandById.get(event.commandId) : null;
        return {
          ...event,
          command: command
            ? {
                id: command.id,
                status: command.status,
                reversible: command.reversible,
                undoKind: command.undoKind || null
              }
            : null
        };
      }),
      pagination: {
        limit,
        cursor: request.nextUrl.searchParams.get("cursor"),
        nextCursor,
        total: filtered.length
      }
    });
  });
}
