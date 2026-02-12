import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { alertSnoozeSchema } from "@/lib/api/schemas";
import { getAlertState, upsertAlertState } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

const DEFAULT_SNOOZE_MINUTES = 24 * 60;

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

    const parsed = alertSnoozeSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid snooze payload", formatZodError(parsed.error));
    }

    const minutes = parsed.data.minutes ?? DEFAULT_SNOOZE_MINUTES;
    const now = new Date();
    const nowIso = toIsoNow();
    const snoozedUntilIso = new Date(now.getTime() + minutes * 60 * 1000).toISOString();
    const existing = await getAlertState(uid, alertId);

    await upsertAlertState(uid, alertId, {
      acknowledgedAt: null,
      snoozedUntil: snoozedUntilIso,
      muted: existing?.muted ?? false,
      mutedAt: existing?.muted ? existing?.mutedAt ?? null : null,
      updatedAt: nowIso
    });

    return jsonOk({ ok: true, id: alertId, snoozedUntil: snoozedUntilIso, minutes });
  });
}
