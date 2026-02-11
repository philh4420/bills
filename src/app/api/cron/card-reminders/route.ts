import { NextRequest } from "next/server";

import { buildSmartAlerts } from "@/lib/alerts/engine";
import { normalizeAlertSettings, parseReminderOffsets } from "@/lib/alerts/settings";
import { getDatePartsInTimeZone } from "@/lib/cards/due-date";
import { computeCardMonthProjections, extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import {
  deletePushSubscription,
  getAlertSettings,
  listCardAccounts,
  listMonthSnapshots,
  listMonthlyPayments,
  listPushSubscriptions
} from "@/lib/firestore/repository";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { sendWebPushNotification } from "@/lib/notifications/web-push";
import { APP_TIMEZONE } from "@/lib/util/constants";
import { jsonError, jsonOk } from "@/lib/util/http";

export const runtime = "nodejs";

function hasValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("CRON_SECRET is not configured.");
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function resolveOwnerUid(): Promise<string | null> {
  const ownerUid = process.env.OWNER_UID?.trim();
  if (ownerUid) {
    return ownerUid;
  }

  const ownerEmail = process.env.OWNER_GOOGLE_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    return null;
  }

  const snap = await getFirebaseAdminFirestore()
    .collection("users")
    .where("email", "==", ownerEmail)
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  return snap.docs[0]?.id || null;
}

function createSmartAlertPayload(alerts: ReturnType<typeof buildSmartAlerts>): { title: string; body: string; url: string } {
  const dueAlerts = alerts.filter((alert) => alert.type === "card-due");
  const utilizationAlerts = alerts.filter((alert) => alert.type === "card-utilization");
  const lowMoneyLeftAlert = alerts.find((alert) => alert.type === "low-money-left");

  if (dueAlerts.length === 1 && alerts.length === 1) {
    return {
      title: dueAlerts[0].title,
      body: dueAlerts[0].message,
      url: "/cards"
    };
  }

  const summaryParts: string[] = [];
  if (dueAlerts.length > 0) {
    summaryParts.push(`${dueAlerts.length} due soon`);
  }
  if (utilizationAlerts.length > 0) {
    summaryParts.push(`${utilizationAlerts.length} high utilization`);
  }
  if (lowMoneyLeftAlert) {
    summaryParts.push("money-left low");
  }

  const headline = summaryParts.length > 0 ? summaryParts.join(" • ") : `${alerts.length} financial alerts`;
  const topMessages = alerts.slice(0, 2).map((alert) => alert.title).join(" | ");
  return {
    title: `Bills alerts: ${headline}`,
    body: topMessages || "Review your dashboard alerts.",
    url: lowMoneyLeftAlert ? "/dashboard" : dueAlerts.length > 0 ? "/cards" : "/dashboard"
  };
}

async function runReminderJob(request: NextRequest) {
  try {
    if (!hasValidCronSecret(request)) {
      return jsonError(401, "Unauthorized cron request.");
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return jsonError(500, "Cron secret is missing.", { details });
  }

  const ownerUid = await resolveOwnerUid();
  if (!ownerUid) {
    return jsonError(500, "Owner account is not configured.");
  }

  const [cards, subscriptions, monthlyPayments, snapshots, persistedAlertSettings] = await Promise.all([
    listCardAccounts(ownerUid),
    listPushSubscriptions(ownerUid),
    listMonthlyPayments(ownerUid),
    listMonthSnapshots(ownerUid),
    getAlertSettings(ownerUid)
  ]);

  const reminderOffsets = parseReminderOffsets(process.env.CARD_REMINDER_OFFSETS);
  const settings = normalizeAlertSettings(persistedAlertSettings, reminderOffsets);
  const now = new Date();
  const todayParts = getDatePartsInTimeZone(now, APP_TIMEZONE);
  const currentMonth = `${String(todayParts.year).padStart(4, "0")}-${String(todayParts.month).padStart(2, "0")}`;

  const timelinePayments = extendMonthlyPaymentsToYearEnd(monthlyPayments);
  const currentMonthPayment = timelinePayments.find((entry) => entry.month === currentMonth) || null;
  const currentMonthSnapshot = snapshots.find((entry) => entry.month === currentMonth) || null;
  const currentProjection = computeCardMonthProjections(cards, timelinePayments).find(
    (entry) => entry.month === currentMonth
  );
  const projectedClosingByCardId: Record<string, number> = currentProjection
    ? Object.fromEntries(
        Object.entries(currentProjection.entries).map(([cardId, projection]) => [
          cardId,
          projection.closingBalance
        ])
      )
    : {};

  const alerts = buildSmartAlerts({
    selectedMonth: currentMonth,
    snapshot: currentMonthSnapshot,
    cards,
    settings,
    projectedClosingByCardId,
    paymentByCardIdForCurrentMonth: currentMonthPayment?.byCardId || {},
    now
  });

  if (alerts.length === 0) {
    return jsonOk({
      ok: true,
      sent: 0,
      failed: 0,
      deleted: 0,
      reason: "No smart alerts triggered today.",
      reminderOffsets
    });
  }

  if (subscriptions.length === 0) {
    return jsonOk({
      ok: true,
      sent: 0,
      failed: 0,
      deleted: 0,
      reason: "No push subscriptions saved.",
      reminderOffsets,
      alerts: alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title
      }))
    });
  }

  const payload = createSmartAlertPayload(alerts);
  const nowTag = now.toISOString().slice(0, 10);
  const fullPayload = {
    ...payload,
    tag: `smart-alerts-${nowTag}`,
    url: payload.url,
    alerts: alerts.map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      actionUrl: alert.actionUrl
    }))
  };

  let sent = 0;
  let failed = 0;
  let deleted = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await sendWebPushNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              auth: subscription.auth,
              p256dh: subscription.p256dh
            }
          },
          fullPayload
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : null;

        if (statusCode === 404 || statusCode === 410) {
          await deletePushSubscription(ownerUid, subscription.endpoint);
          deleted += 1;
        }
      }
    })
  );

  return jsonOk({
    ok: true,
    sent,
    failed,
    deleted,
    alerts: alerts.map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title
    })),
    reminderOffsets
  });
}

export async function GET(request: NextRequest) {
  return runReminderJob(request);
}

export async function POST(request: NextRequest) {
  return runReminderJob(request);
}
