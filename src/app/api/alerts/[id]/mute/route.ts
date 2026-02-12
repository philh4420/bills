import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { alertMuteSchema } from "@/lib/api/schemas";
import { upsertAlertState } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    const alertId = id?.trim();
    if (!alertId) {
      return jsonError(400, "Invalid alert id.");
    }

    let payload: unknown = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const parsed = alertMuteSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid mute payload", formatZodError(parsed.error));
    }

    const muted = parsed.data.muted ?? true;
    const now = toIsoNow();

    await upsertAlertState(uid, alertId, {
      muted,
      mutedAt: muted ? now : null,
      updatedAt: now
    });

    return jsonOk({ ok: true, id: alertId, muted });
  });
}
