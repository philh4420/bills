import { createHash } from "crypto";

import { buildSmartAlerts } from "@/lib/alerts/engine";
import { isWithinQuietHours } from "@/lib/alerts/quiet-hours";
import {
  normalizeAlertSettings,
  parseDeliveryHours,
  parseReminderOffsets
} from "@/lib/alerts/settings";
import { applyAlertStateToAlerts } from "@/lib/alerts/state";
import { getDatePartsInTimeZone } from "@/lib/cards/due-date";
import { buildMonthTimeline } from "@/lib/dashboard/timeline";
import { computeCardMonthProjections, extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import {
  deletePushSubscription,
  getAlertSettings,
  listCardAccounts,
  listLineItems,
  listLoanedOutItems,
  listMonthSnapshots,
  listMonthlyAdjustments,
  listMonthlyIncomePaydays,
  listMonthlyPayments,
  listPushSubscriptions,
  listAlertStates,
  updatePushSubscription,
  upsertAlertSettings
} from "@/lib/firestore/repository";
import {
  isWebPushConfigured,
  sendWebPushNotification
} from "@/lib/notifications/web-push";
import { APP_TIMEZONE } from "@/lib/util/constants";
import { toIsoNow } from "@/lib/util/dates";
import { SmartAlert } from "@/types";

export type SmartAlertDispatchSource = "cron" | "realtime" | "manual";

export interface SmartAlertDispatchResult {
  ok: boolean;
  source: SmartAlertDispatchSource;
  sent: number;
  failed: number;
  deleted: number;
  currentMonth: string;
  reason?: string;
  reminderOffsets: number[];
  deliveryHoursLocal: number[];
  alerts: Array<Pick<SmartAlert, "id" | "type" | "severity" | "title">>;
}

function parsePushErrorStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return null;
  }
  const raw = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isFinite(raw) ? raw : null;
}

function parsePushErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message || "Push send failed");
  }
  return "Push send failed";
}

async function bestEffortUpdatePushDiagnostics(
  uid: string,
  subscriptionId: string,
  payload: Parameters<typeof updatePushSubscription>[2]
): Promise<void> {
  try {
    await updatePushSubscription(uid, subscriptionId, payload);
  } catch {
    // Best effort diagnostics should not fail dispatch flow.
  }
}

function monthKeyFromNow(now: Date): string {
  const parts = getDatePartsInTimeZone(now, APP_TIMEZONE);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}`;
}

function hourInTimeZone(now: Date, timeZone = APP_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const raw = parts.find((entry) => entry.type === "hour")?.value || "0";
  const hour = Number.parseInt(raw, 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return 0;
  }
  return hour;
}

function toSmartAlertPayload(alerts: SmartAlert[]): { title: string; body: string; url: string } {
  const dueAlerts = alerts.filter((alert) => alert.type === "card-due" || alert.type === "bill-due");
  const utilizationAlerts = alerts.filter((alert) => alert.type === "card-utilization");
  const lowMoneyLeftAlert = alerts.find((alert) => alert.type === "low-money-left");

  if (dueAlerts.length === 1 && alerts.length === 1) {
    return {
      title: dueAlerts[0].title,
      body: dueAlerts[0].message,
      url: dueAlerts[0].actionUrl
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
    url: lowMoneyLeftAlert ? "/dashboard" : dueAlerts.length > 0 ? dueAlerts[0].actionUrl : "/dashboard"
  };
}

function fingerprintAlerts(alerts: SmartAlert[], currentMonth: string): string {
  const normalized = alerts
    .map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      amount: alert.amount ?? null
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return createHash("sha256")
    .update(JSON.stringify({ currentMonth, alerts: normalized }))
    .digest("hex");
}

export async function dispatchSmartAlertsForUser(
  uid: string,
  options: { source: SmartAlertDispatchSource; now?: Date; force?: boolean }
): Promise<SmartAlertDispatchResult> {
  const now = options.now || new Date();
  const currentMonth = monthKeyFromNow(now);
  const reminderOffsets = parseReminderOffsets(process.env.CARD_REMINDER_OFFSETS);
  const deliveryHoursFromEnv = parseDeliveryHours(process.env.CARD_REMINDER_DELIVERY_HOURS);

  if (!isWebPushConfigured()) {
    return {
      ok: true,
      source: options.source,
      sent: 0,
      failed: 0,
      deleted: 0,
      currentMonth,
      reason: "Web push is not configured.",
      reminderOffsets,
      deliveryHoursLocal: deliveryHoursFromEnv,
      alerts: []
    };
  }

  const [
    cards,
    subscriptions,
    monthlyPayments,
    snapshots,
    persistedAlertSettings,
    houseBills,
    income,
    shopping,
    myBills,
    adjustments,
    monthlyIncomePaydays,
    loanedOutItems,
    alertStates
  ] = await Promise.all([
    listCardAccounts(uid),
    listPushSubscriptions(uid),
    listMonthlyPayments(uid),
    listMonthSnapshots(uid),
    getAlertSettings(uid),
    listLineItems(uid, "houseBills"),
    listLineItems(uid, "incomeItems"),
    listLineItems(uid, "shoppingItems"),
    listLineItems(uid, "myBills"),
    listMonthlyAdjustments(uid),
    listMonthlyIncomePaydays(uid),
    listLoanedOutItems(uid),
    listAlertStates(uid)
  ]);

  const settings = normalizeAlertSettings(
    persistedAlertSettings,
    reminderOffsets,
    deliveryHoursFromEnv
  );

  if (options.source === "realtime" && !settings.realtimePushEnabled) {
    return {
      ok: true,
      source: options.source,
      sent: 0,
      failed: 0,
      deleted: 0,
      currentMonth,
      reason: "Realtime push is disabled.",
      reminderOffsets: settings.dueReminderOffsets,
      deliveryHoursLocal: settings.deliveryHoursLocal,
      alerts: []
    };
  }

  if (options.source === "cron" && !settings.cronPushEnabled) {
    return {
      ok: true,
      source: options.source,
      sent: 0,
      failed: 0,
      deleted: 0,
      currentMonth,
      reason: "Cron push is disabled.",
      reminderOffsets: settings.dueReminderOffsets,
      deliveryHoursLocal: settings.deliveryHoursLocal,
      alerts: []
    };
  }

  if (options.source === "realtime" || options.source === "cron") {
    const quiet = isWithinQuietHours(settings, now);
    if (quiet.quiet) {
      return {
        ok: true,
        source: options.source,
        sent: 0,
        failed: 0,
        deleted: 0,
        currentMonth,
        reason: `Skipped by quiet hours (${settings.quietHoursStartLocal}:00-${settings.quietHoursEndLocal}:00 ${quiet.timezone}).`,
        reminderOffsets: settings.dueReminderOffsets,
        deliveryHoursLocal: settings.deliveryHoursLocal,
        alerts: []
      };
    }
  }

  if (!options.force && options.source === "cron") {
    const localHour = hourInTimeZone(now, APP_TIMEZONE);
    if (settings.deliveryHoursLocal.length > 0 && !settings.deliveryHoursLocal.includes(localHour)) {
      return {
        ok: true,
        source: options.source,
        sent: 0,
        failed: 0,
        deleted: 0,
        currentMonth,
        reason: `Current hour ${localHour}:00 is not in delivery hours.`,
        reminderOffsets: settings.dueReminderOffsets,
        deliveryHoursLocal: settings.deliveryHoursLocal,
        alerts: []
      };
    }
  }

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

  const incomePaydaysForMonth =
    monthlyIncomePaydays.find((entry) => entry.month === currentMonth)?.byIncomeId || {};
  const timeline = buildMonthTimeline({
    selectedMonth: currentMonth,
    cards,
    monthlyPayments: currentMonthPayment,
    income,
    incomePaydayOverridesByIncomeId: incomePaydaysForMonth,
    houseBills,
    shopping,
    myBills,
    adjustments,
    loanedOutItems
  });

  const alerts = buildSmartAlerts({
    selectedMonth: currentMonth,
    snapshot: currentMonthSnapshot,
    cards,
    timelineEvents: timeline.events,
    settings,
    projectedClosingByCardId,
    paymentByCardIdForCurrentMonth: currentMonthPayment?.byCardId || {},
    now
  });
  const { activeAlerts, suppressedAlerts } = applyAlertStateToAlerts({
    alerts,
    states: alertStates,
    now
  });

  if (alerts.length === 0) {
    return {
      ok: true,
      source: options.source,
      sent: 0,
      failed: 0,
      deleted: 0,
      currentMonth,
      reason: "No smart alerts triggered.",
      reminderOffsets: settings.dueReminderOffsets,
      deliveryHoursLocal: settings.deliveryHoursLocal,
      alerts: []
    };
  }

  if (activeAlerts.length === 0) {
    const suppressedSummary = suppressedAlerts.reduce(
      (acc, item) => {
        acc[item.reason] += 1;
        return acc;
      },
      { acknowledged: 0, snoozed: 0, muted: 0 } as Record<"acknowledged" | "snoozed" | "muted", number>
    );
    const fragments: string[] = [];
    if (suppressedSummary.acknowledged > 0) {
      fragments.push(`${suppressedSummary.acknowledged} acknowledged`);
    }
    if (suppressedSummary.snoozed > 0) {
      fragments.push(`${suppressedSummary.snoozed} snoozed`);
    }
    if (suppressedSummary.muted > 0) {
      fragments.push(`${suppressedSummary.muted} muted`);
    }

    return {
      ok: true,
      source: options.source,
      sent: 0,
      failed: 0,
      deleted: 0,
      currentMonth,
      reason: `All alerts are suppressed by state${fragments.length > 0 ? ` (${fragments.join(", ")})` : ""}.`,
      reminderOffsets: settings.dueReminderOffsets,
      deliveryHoursLocal: settings.deliveryHoursLocal,
      alerts: []
    };
  }

  if (subscriptions.length === 0) {
    return {
      ok: true,
      source: options.source,
      sent: 0,
      failed: 0,
      deleted: 0,
      currentMonth,
      reason: "No push subscriptions saved.",
      reminderOffsets: settings.dueReminderOffsets,
      deliveryHoursLocal: settings.deliveryHoursLocal,
      alerts: activeAlerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title
      }))
    };
  }

  const fingerprint = fingerprintAlerts(activeAlerts, currentMonth);
  if (!options.force && settings.lastPushSentAt) {
    const lastSentAtMs = Date.parse(settings.lastPushSentAt);
    if (Number.isFinite(lastSentAtMs)) {
      const minIntervalMs = settings.cooldownMinutes * 60 * 1000;
      const elapsedMs = now.getTime() - lastSentAtMs;
      if (minIntervalMs > 0 && elapsedMs < minIntervalMs) {
        return {
          ok: true,
          source: options.source,
          sent: 0,
          failed: 0,
          deleted: 0,
          currentMonth,
          reason: "Skipped by cooldown window.",
          reminderOffsets: settings.dueReminderOffsets,
          deliveryHoursLocal: settings.deliveryHoursLocal,
          alerts: activeAlerts.map((alert) => ({
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            title: alert.title
          }))
        };
      }
    }
  }

  if (!options.force && options.source === "realtime" && settings.lastPushFingerprint === fingerprint) {
    return {
      ok: true,
      source: options.source,
      sent: 0,
      failed: 0,
      deleted: 0,
      currentMonth,
      reason: "Skipped duplicate realtime alert set.",
      reminderOffsets: settings.dueReminderOffsets,
      deliveryHoursLocal: settings.deliveryHoursLocal,
      alerts: activeAlerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title
      }))
    };
  }

  const payload = toSmartAlertPayload(activeAlerts);
  const nowTag = now.toISOString().slice(0, 10);
  const fullPayload = {
    ...payload,
    tag: `smart-alerts-${currentMonth}-${nowTag}`,
    url: payload.url,
    badgeCount: activeAlerts.length,
    source: options.source,
    alerts: activeAlerts.map((alert) => ({
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
        const successAt = toIsoNow();
        await bestEffortUpdatePushDiagnostics(uid, subscription.id, {
          lastSuccessAt: successAt,
          lastFailureAt: null,
          lastFailureReason: null,
          endpointHealth: "healthy",
          failureCount: 0,
          updatedAt: successAt
        });
      } catch (error) {
        failed += 1;
        const statusCode = parsePushErrorStatusCode(error);
        const message = parsePushErrorMessage(error);
        const failureAt = toIsoNow();
        const nextFailureCount = (subscription.failureCount ?? 0) + 1;
        const reason =
          `${statusCode ?? "error"} ${message}`.trim().slice(0, 240) || "push send failed";

        if (statusCode === 404 || statusCode === 410) {
          await bestEffortUpdatePushDiagnostics(uid, subscription.id, {
            lastFailureAt: failureAt,
            lastFailureReason: reason,
            endpointHealth: "stale",
            failureCount: nextFailureCount,
            updatedAt: failureAt
          });
          await deletePushSubscription(uid, subscription.endpoint);
          deleted += 1;
          return;
        }

        await bestEffortUpdatePushDiagnostics(uid, subscription.id, {
          lastFailureAt: failureAt,
          lastFailureReason: reason,
          endpointHealth: "degraded",
          failureCount: nextFailureCount,
          updatedAt: failureAt
        });
      }
    })
  );

  if (sent > 0) {
    const nowIso = toIsoNow();
    await upsertAlertSettings(uid, {
      createdAt: persistedAlertSettings?.createdAt ?? nowIso,
      updatedAt: nowIso,
      lastPushSentAt: nowIso,
      lastPushFingerprint: fingerprint
    });
  }

  return {
    ok: true,
    source: options.source,
    sent,
    failed,
    deleted,
    currentMonth,
    reminderOffsets: settings.dueReminderOffsets,
    deliveryHoursLocal: settings.deliveryHoursLocal,
    alerts: activeAlerts.map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title
    }))
  };
}
