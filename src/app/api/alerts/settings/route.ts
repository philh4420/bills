import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { alertSettingsPutSchema } from "@/lib/api/schemas";
import { normalizeAlertSettings, parseReminderOffsets } from "@/lib/alerts/settings";
import { getAlertSettings, upsertAlertSettings } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const persisted = await getAlertSettings(uid);
    const reminderOffsets = parseReminderOffsets(process.env.CARD_REMINDER_OFFSETS);
    return jsonOk({ settings: normalizeAlertSettings(persisted, reminderOffsets) });
  });
}

export async function PUT(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const payload = await request.json();
    const parsed = alertSettingsPutSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(400, "Invalid alert settings payload", formatZodError(parsed.error));
    }

    const existing = await getAlertSettings(uid);
    const now = toIsoNow();
    await upsertAlertSettings(uid, {
      lowMoneyLeftThreshold: parsed.data.lowMoneyLeftThreshold,
      utilizationThresholdPercent: parsed.data.utilizationThresholdPercent,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });

    const reminderOffsets = parseReminderOffsets(process.env.CARD_REMINDER_OFFSETS);
    const settings = normalizeAlertSettings(
      {
        ...existing,
        lowMoneyLeftThreshold: parsed.data.lowMoneyLeftThreshold,
        utilizationThresholdPercent: parsed.data.utilizationThresholdPercent,
        updatedAt: now
      },
      reminderOffsets
    );

    return jsonOk({ settings });
  });
}
