import { computeUpcomingDueDate, formatDueDateLabel, getDatePartsInTimeZone } from "@/lib/cards/due-date";
import { APP_TIMEZONE } from "@/lib/util/constants";
import { formatMonthKeyUK } from "@/lib/util/format";
import { normalizeCurrency } from "@/lib/util/numbers";
import { AlertSettings, CardAccount, MonthSnapshot, MonthTimelineEvent, SmartAlert } from "@/types";

function asMonthKey(date: Date): string {
  const parts = getDatePartsInTimeZone(date, APP_TIMEZONE);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}`;
}

function severityRank(value: SmartAlert["severity"]): number {
  if (value === "critical") {
    return 3;
  }
  if (value === "warning") {
    return 2;
  }
  return 1;
}

export function buildSmartAlerts(params: {
  selectedMonth: string;
  snapshot: Pick<MonthSnapshot, "moneyLeft"> | null;
  cards: Array<Pick<CardAccount, "id" | "name" | "limit" | "usedLimit" | "dueDayOfMonth">>;
  timelineEvents?: Array<
    Pick<MonthTimelineEvent, "id" | "type" | "title" | "subtitle" | "date" | "amount" | "category">
  >;
  settings: AlertSettings;
  projectedClosingByCardId?: Record<string, number>;
  paymentByCardIdForCurrentMonth?: Record<string, number>;
  now?: Date;
}): SmartAlert[] {
  const {
    selectedMonth,
    snapshot,
    cards,
    timelineEvents = [],
    settings,
    projectedClosingByCardId = {},
    paymentByCardIdForCurrentMonth = {},
    now = new Date()
  } = params;

  const alerts: SmartAlert[] = [];

  if (
    settings.enabledTypes.lowMoneyLeft &&
    snapshot &&
    snapshot.moneyLeft <= settings.lowMoneyLeftThreshold
  ) {
    alerts.push({
      id: `low-money-left-${selectedMonth}`,
      type: "low-money-left",
      severity: snapshot.moneyLeft < 0 ? "critical" : "warning",
      title: "Money-left forecast below threshold",
      message: `Forecast is £${snapshot.moneyLeft.toFixed(2)} for ${formatMonthKeyUK(selectedMonth)} (threshold £${settings.lowMoneyLeftThreshold.toFixed(2)}).`,
      month: selectedMonth,
      actionUrl: "/dashboard",
      amount: snapshot.moneyLeft
    });
  }

  if (settings.enabledTypes.cardUtilization) {
    cards.forEach((card) => {
      if (!card.limit || card.limit <= 0) {
        return;
      }

      const currentUsed = normalizeCurrency(Math.max(0, card.usedLimit ?? 0));
      const projectedUsed = normalizeCurrency(
        Math.max(0, projectedClosingByCardId[card.id] ?? card.usedLimit ?? 0)
      );
      const currentUtilization = normalizeCurrency((currentUsed / card.limit) * 100);
      const projectedUtilization = normalizeCurrency((projectedUsed / card.limit) * 100);
      const maxUtilization = Math.max(currentUtilization, projectedUtilization);

      if (maxUtilization >= settings.utilizationThresholdPercent) {
        alerts.push({
          id: `utilization-${card.id}`,
          type: "card-utilization",
          severity: maxUtilization >= 95 ? "critical" : "warning",
          title: `${card.name} utilization is ${maxUtilization.toFixed(1)}%`,
          message: `Current £${currentUsed.toFixed(2)} (${currentUtilization.toFixed(1)}%), projected £${projectedUsed.toFixed(2)} (${projectedUtilization.toFixed(1)}%) of £${card.limit.toFixed(2)} limit (threshold ${settings.utilizationThresholdPercent.toFixed(1)}%).`,
          month: selectedMonth,
          actionUrl: "/cards",
          amount: Math.max(currentUsed, projectedUsed),
          cardId: card.id
        });
      }
    });
  }

  const dueOffsetSet = new Set(settings.dueReminderOffsets);
  const currentMonth = asMonthKey(now);
  const todayParts = getDatePartsInTimeZone(now, APP_TIMEZONE);
  const todayOrdinal = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);

  if (settings.enabledTypes.cardDue) {
    cards.forEach((card) => {
      if (!card.dueDayOfMonth || card.dueDayOfMonth < 1) {
        return;
      }

      const due = computeUpcomingDueDate(card.dueDayOfMonth, now, APP_TIMEZONE);
      if (!dueOffsetSet.has(due.daysUntil)) {
        return;
      }

      const paymentAmount = normalizeCurrency(Math.max(0, paymentByCardIdForCurrentMonth[card.id] ?? 0));
      const suffix =
        due.daysUntil === 1 ? "in 1 day" : due.daysUntil === 0 ? "today" : `in ${due.daysUntil} days`;

      alerts.push({
        id: `card-due-${card.id}-${due.isoDate}`,
        type: "card-due",
        severity: due.daysUntil <= 1 ? "critical" : due.daysUntil <= 3 ? "warning" : "info",
        title: `${card.name} payment due ${suffix}`,
        message: `Due on ${formatDueDateLabel(due.isoDate)}${paymentAmount > 0 ? `, planned payment £${paymentAmount.toFixed(2)}` : ""}.`,
        month: currentMonth,
        actionUrl: "/cards",
        amount: paymentAmount,
        cardId: card.id
      });
    });
  }

  if (settings.enabledTypes.billDue) {
    timelineEvents.forEach((event) => {
      if (event.type === "card-due" || event.amount >= 0 || event.category === "income") {
        return;
      }

      const match = event.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        return;
      }

      const dueYear = Number.parseInt(match[1], 10);
      const dueMonth = Number.parseInt(match[2], 10);
      const dueDay = Number.parseInt(match[3], 10);
      if (!Number.isInteger(dueYear) || !Number.isInteger(dueMonth) || !Number.isInteger(dueDay)) {
        return;
      }

      const dueOrdinal = Date.UTC(dueYear, dueMonth - 1, dueDay);
      const daysUntil = Math.round((dueOrdinal - todayOrdinal) / 86400000);

      if (daysUntil < 0 || !dueOffsetSet.has(daysUntil)) {
        return;
      }

      const amount = normalizeCurrency(Math.abs(event.amount));
      const suffix = daysUntil === 0 ? "today" : daysUntil === 1 ? "in 1 day" : `in ${daysUntil} days`;
      alerts.push({
        id: `bill-due-${event.id}`,
        type: "bill-due",
        severity: daysUntil <= 1 ? "critical" : daysUntil <= 3 ? "warning" : "info",
        title: `${event.title} due ${suffix}`,
        message: `Due on ${formatDueDateLabel(event.date)}${amount > 0 ? ` for £${amount.toFixed(2)}` : ""}${event.subtitle ? ` (${event.subtitle})` : ""}.`,
        month: currentMonth,
        actionUrl: "/bills",
        amount
      });
    });
  }

  return alerts.sort((a, b) => {
    const severityDiff = severityRank(b.severity) - severityRank(a.severity);
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return a.title.localeCompare(b.title);
  });
}
