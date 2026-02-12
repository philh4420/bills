import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { alertSettingsPutSchema } from "@/lib/api/schemas";
import {
  normalizeAlertSettings,
  parseDeliveryHours,
  parseReminderOffsets
} from "@/lib/alerts/settings";
import { getAlertSettings, upsertAlertSettings } from "@/lib/firestore/repository";
import { dispatchSmartAlertsForUser } from "@/lib/notifications/smart-alerts";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const persisted = await getAlertSettings(uid);
    const reminderOffsets = parseReminderOffsets(process.env.CARD_REMINDER_OFFSETS);
    const deliveryHours = parseDeliveryHours(process.env.CARD_REMINDER_DELIVERY_HOURS);
    return jsonOk({ settings: normalizeAlertSettings(persisted, reminderOffsets, deliveryHours) });
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
    const reminderOffsets = parseReminderOffsets(process.env.CARD_REMINDER_OFFSETS);
    const deliveryHours = parseDeliveryHours(process.env.CARD_REMINDER_DELIVERY_HOURS);
    const now = toIsoNow();
    const merged = normalizeAlertSettings(
      {
        ...existing,
        lowMoneyLeftThreshold: parsed.data.lowMoneyLeftThreshold,
        utilizationThresholdPercent: parsed.data.utilizationThresholdPercent,
        dueReminderOffsets: parsed.data.dueReminderOffsets ?? existing?.dueReminderOffsets,
        deliveryHoursLocal: parsed.data.deliveryHoursLocal ?? existing?.deliveryHoursLocal,
        cooldownMinutes: parsed.data.cooldownMinutes ?? existing?.cooldownMinutes,
        realtimePushEnabled: parsed.data.realtimePushEnabled ?? existing?.realtimePushEnabled,
        cronPushEnabled: parsed.data.cronPushEnabled ?? existing?.cronPushEnabled,
        enabledTypes: parsed.data.enabledTypes ?? existing?.enabledTypes,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      },
      reminderOffsets,
      deliveryHours
    );

    await upsertAlertSettings(uid, merged);
    const settings = normalizeAlertSettings(merged, reminderOffsets, deliveryHours);
    const dispatch = await dispatchSmartAlertsForUser(uid, {
      source: "manual",
      now: new Date()
    });

    return jsonOk({ settings, dispatch });
  });
}
