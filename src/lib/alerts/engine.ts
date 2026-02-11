import { computeUpcomingDueDate, formatDueDateLabel, getDatePartsInTimeZone } from "@/lib/cards/due-date";
import { APP_TIMEZONE } from "@/lib/util/constants";
import { normalizeCurrency } from "@/lib/util/numbers";
import { AlertSettings, CardAccount, MonthSnapshot, SmartAlert } from "@/types";

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
  settings: AlertSettings;
  projectedClosingByCardId?: Record<string, number>;
  paymentByCardIdForCurrentMonth?: Record<string, number>;
  now?: Date;
}): SmartAlert[] {
  const {
    selectedMonth,
    snapshot,
    cards,
    settings,
    projectedClosingByCardId = {},
    paymentByCardIdForCurrentMonth = {},
    now = new Date()
  } = params;

  const alerts: SmartAlert[] = [];

  if (snapshot && snapshot.moneyLeft <= settings.lowMoneyLeftThreshold) {
    alerts.push({
      id: `low-money-left-${selectedMonth}`,
      type: "low-money-left",
      severity: snapshot.moneyLeft < 0 ? "critical" : "warning",
      title: "Money-left forecast below threshold",
      message: `Forecast is £${snapshot.moneyLeft.toFixed(2)} for ${selectedMonth} (threshold £${settings.lowMoneyLeftThreshold.toFixed(2)}).`,
      month: selectedMonth,
      actionUrl: "/dashboard",
      amount: snapshot.moneyLeft
    });
  }

  cards.forEach((card) => {
    if (!card.limit || card.limit <= 0) {
      return;
    }

    const projected = normalizeCurrency(
      Math.max(0, projectedClosingByCardId[card.id] ?? card.usedLimit ?? 0)
    );
    const utilization = normalizeCurrency((projected / card.limit) * 100);
    if (utilization >= settings.utilizationThresholdPercent) {
      alerts.push({
        id: `utilization-${card.id}`,
        type: "card-utilization",
        severity: utilization >= 95 ? "critical" : "warning",
        title: `${card.name} utilization is ${utilization.toFixed(1)}%`,
        message: `Projected balance £${projected.toFixed(2)} of £${card.limit.toFixed(2)} limit (threshold ${settings.utilizationThresholdPercent.toFixed(1)}%).`,
        month: selectedMonth,
        actionUrl: "/cards",
        amount: projected,
        cardId: card.id
      });
    }
  });

  const dueOffsetSet = new Set(settings.dueReminderOffsets);
  const currentMonth = asMonthKey(now);

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

  return alerts.sort((a, b) => {
    const severityDiff = severityRank(b.severity) - severityRank(a.severity);
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return a.title.localeCompare(b.title);
  });
}
