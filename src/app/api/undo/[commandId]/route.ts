import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { undoCommandForUser } from "@/lib/audit/undo";
import { jsonError, jsonOk } from "@/lib/util/http";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ commandId: string }> }
) {
  return withOwnerAuth(request, async ({ uid, email }) => {
    const { commandId } = await context.params;
    if (!commandId) {
      return jsonError(400, "Missing commandId.");
    }

    const result = await undoCommandForUser(uid, email, commandId);
    if (!result.ok) {
      return jsonError(result.status, result.error);
    }

    return jsonOk({ ok: true, commandId: result.commandId });
  });
}
