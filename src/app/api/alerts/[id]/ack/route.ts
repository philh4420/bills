import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { getAlertState, upsertAlertState } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";

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

    const now = toIsoNow();
    const existing = await getAlertState(uid, alertId);

    await upsertAlertState(uid, alertId, {
      acknowledgedAt: now,
      snoozedUntil: null,
      muted: existing?.muted ?? false,
      mutedAt: existing?.muted ? existing?.mutedAt ?? null : null,
      updatedAt: now
    });

    return jsonOk({ ok: true, id: alertId, acknowledgedAt: now });
  });
}
