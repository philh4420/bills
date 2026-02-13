"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts";

import { MeasuredChart } from "@/components/measured-chart";
import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import {
  DEFAULT_CARD_UTILIZATION_THRESHOLD,
  DEFAULT_LOW_MONEY_LEFT_THRESHOLD
} from "@/lib/alerts/settings";
import { authedRequest, formatApiClientError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { formatGBP, formatMonthKeyUK } from "@/lib/util/format";

interface TimelineEvent {
  id: string;
  type: "card-due" | "bill-due" | "adjustment" | "transfer";
  title: string;
  subtitle?: string;
  date: string;
  day: number;
  amount: number;
  category: string;
  sourceType?:
    | "cardAccount"
    | "houseBill"
    | "shoppingItem"
    | "myBill"
    | "monthlyAdjustment"
    | "incomeItem"
    | "loanedOutItem"
    | "bankTransfer";
  sourceId?: string;
  editableDueDay?: boolean;
  transferAmount?: number;
}

interface DashboardData {
  selectedMonth: string | null;
  availableMonths: string[];
  snapshot: {
    month: string;
    incomeTotal: number;
    houseBillsTotal: number;
    shoppingTotal: number;
    myBillsTotal: number;
    adjustmentsTotal: number;
    cardInterestTotal: number;
    cardBalanceTotal: number;
    cardSpendTotal: number;
    loanedOutOutstandingTotal: number;
    loanedOutPaidBackTotal: number;
    moneyInBank: number;
    moneyLeft: number;
    formulaVariantId: string;
    inferred: boolean;
  } | null;
  cards: Array<{ id: string; name: string; limit: number; usedLimit: number }>;
  monthlyPayments: {
    month: string;
    byCardId: Record<string, number>;
    total: number;
    formulaVariantId: string;
    inferred: boolean;
  } | null;
  bankBalance: { id: string; amount: number } | null;
  bankAccounts?: Array<{
    id: string;
    name: string;
    accountType: "current" | "savings" | "cash";
    balance: number;
    includeInNetWorth: boolean;
  }>;
  bankTransfers?: Array<{
    id: string;
    month: string;
    day: number;
    date: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    note?: string;
  }>;
  bankAccountProjection?: {
    month: string;
    entries: Array<{
      accountId: string;
      name: string;
      accountType: "current" | "savings" | "cash";
      includeInNetWorth: boolean;
      openingBalance: number;
      closingBalance: number;
      netChange: number;
    }>;
    totalOpeningBalance: number;
    totalClosingBalance: number;
    netMovementApplied: number;
  };
  loanedOutItems: Array<{
    id: string;
    name: string;
    amount: number;
    startMonth: string;
    status: "outstanding" | "paidBack";
    paidBackMonth?: string;
  }>;
  ledgerEntries: Array<{
    id: string;
    month: string;
    date: string;
    day: number;
    title: string;
    subtitle?: string;
    category: string;
    amount: number;
    status: "planned" | "posted" | "paid";
  }>;
  monthClosure: {
    id: string;
    month: string;
    closed: boolean;
    reason?: string;
    closedAt?: string;
    closedBy?: string;
  } | null;
  reconciliation: {
    id: string;
    month: string;
    expectedBalance: number;
    actualBalance: number;
    variance: number;
    status: "matched" | "variance";
    notes?: string;
    reconciledAt: string;
  } | null;
  bankFlow: {
    openingBalance: number;
    plannedToDate: number;
    actualToDate: number;
    usingActual: boolean;
  };
  alertSettings: {
    lowMoneyLeftThreshold: number;
    utilizationThresholdPercent: number;
    dueReminderOffsets: number[];
    deliveryHoursLocal: number[];
    cooldownMinutes: number;
    realtimePushEnabled: boolean;
    cronPushEnabled: boolean;
    quietHoursEnabled: boolean;
    quietHoursStartLocal: number;
    quietHoursEndLocal: number;
    quietHoursTimezone: string;
    enabledTypes: {
      lowMoneyLeft: boolean;
      cardUtilization: boolean;
      cardDue: boolean;
      billDue: boolean;
    };
  };
  alerts: Array<{
    id: string;
    type: "low-money-left" | "card-utilization" | "card-due" | "bill-due";
    severity: "info" | "warning" | "critical";
    title: string;
    message: string;
    month: string;
    actionUrl: string;
    amount?: number;
    cardId?: string;
  }>;
  timeline: {
    month: string;
    events: TimelineEvent[];
  };
  subscriptionIntelligence?: {
    month: string;
    ranked: Array<{
      id: string;
      sourceCollection: "houseBills" | "myBills" | "shoppingItems";
      name: string;
      monthlyAmount: number;
      annualAmount: number;
      rank: number;
    }>;
    suggestions: Array<{
      id: string;
      name: string;
      currentMonthly: number;
      suggestedMonthly: number;
      potentialMonthlySavings: number;
      potentialAnnualSavings: number;
      reason: string;
    }>;
  };
  planning?: {
    paydayMode: {
      enabled: boolean;
      anchorDate: string;
      cycleDays: number;
      incomeIds: string[];
      monthPaydaysByIncomeId: Record<string, number[]>;
    };
    savings: {
      selectedMonth: string;
      monthlyTargetTotal: number;
      projectedMoneyLeftAfterSavings: number;
      atRiskGoalIds: string[];
      goals: Array<{
        id: string;
        name: string;
        status: "active" | "paused" | "completed";
        targetAmount: number;
        currentAmount: number;
        monthlyContribution: number;
        startMonth: string;
        targetMonth?: string;
        projectedCompletionMonth?: string | null;
        remainingAmount: number;
        monthContribution: number;
      }>;
    };
    debtPayoff: {
      totalDebt: number;
      monthlyBudget: number;
      byStrategy: {
        snowball: {
          strategy: "snowball" | "avalanche";
          monthsToDebtFree: number | null;
          totalInterest: number;
          payoffOrder: string[];
        };
        avalanche: {
          strategy: "snowball" | "avalanche";
          monthsToDebtFree: number | null;
          totalInterest: number;
          payoffOrder: string[];
        };
      };
    };
    netWorth: {
      month: string;
      assets: number;
      liabilities: number;
      loanedOutRecoverable: number;
      netWorth: number;
      monthDelta: number;
    };
    analytics: {
      month: string;
      previousMonth?: string;
      deltas: Array<{
        key: string;
        label: string;
        currentValue: number;
        previousValue: number;
        delta: number;
        deltaPercent: number | null;
      }>;
      driftAlerts: Array<{
        key: string;
        label: string;
        delta: number;
        deltaPercent: number;
      }>;
    };
  };
}

interface ScenarioResponse {
  selectedMonth: string;
  scenario: {
    month: string;
    note?: string;
    input: {
      month: string;
      extraIncome: number;
      extraExpenses: number;
      extraCardPayments: number;
      accountDeltas: Record<string, number>;
      note?: string;
    };
    base: {
      incomeTotal: number;
      cardSpendTotal: number;
      cardBalanceTotal: number;
      moneyLeft: number;
      moneyInBank: number;
      netWorth: number;
    };
    projected: {
      incomeTotal: number;
      cardSpendTotal: number;
      cardBalanceTotal: number;
      moneyLeft: number;
      moneyInBank: number;
      netWorth: number;
    };
    delta: {
      moneyLeft: number;
      moneyInBank: number;
      cardBalanceTotal: number;
      netWorth: number;
    };
    accountProjection: {
      entries: Array<{
        accountId: string;
        name: string;
        accountType: "current" | "savings" | "cash";
        includeInNetWorth: boolean;
        openingBalance: number;
        closingBalance: number;
        netChange: number;
      }>;
      totalClosingBalance: number;
    };
  };
}

interface CalendarCell {
  day: number | null;
  events: TimelineEvent[];
  outgoings: number;
  incomings: number;
  pressure: number;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="label">{label}</p>
      <p className="metric-value mt-2">{value}</p>
    </div>
  );
}

function severityClass(severity: "info" | "warning" | "critical"): string {
  if (severity === "critical") {
    return "border border-red-200 bg-red-50 text-red-800";
  }
  if (severity === "warning") {
    return "border border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border border-blue-200 bg-blue-50 text-blue-800";
}

function reconciliationStatusClass(status: "matched" | "variance"): string {
  if (status === "matched") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  return "border border-amber-200 bg-amber-50 text-amber-800";
}

function timelineChipClass(type: TimelineEvent["type"]): string {
  if (type === "card-due") {
    return "calendar-event card-due";
  }
  if (type === "transfer") {
    return "calendar-event transfer";
  }
  if (type === "adjustment") {
    return "calendar-event adjustment";
  }
  return "calendar-event bill-due";
}

function dayPressureClass(pressure: number, maxPressure: number): string {
  if (maxPressure <= 0.0001 || pressure <= 0.0001) {
    return "";
  }
  const ratio = pressure / maxPressure;
  if (ratio >= 0.8) {
    return "is-pressure-high";
  }
  if (ratio >= 0.45) {
    return "is-pressure-medium";
  }
  return "is-pressure-low";
}

function eventAmountLabel(event: TimelineEvent): string | null {
  if (event.type === "transfer") {
    const transferAmount = event.transferAmount ?? 0;
    return transferAmount > 0 ? formatGBP(transferAmount) : null;
  }
  if (event.amount === 0) {
    return null;
  }
  return formatGBP(event.amount);
}

function buildCalendar(month: string, events: TimelineEvent[]): CalendarCell[][] {
  const match = month.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) {
    return [];
  }

  const year = Number.parseInt(match[1], 10);
  const monthNumber = Number.parseInt(match[2], 10);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const eventsByDay = new Map<number, TimelineEvent[]>();
  events.forEach((event) => {
    if (event.day < 1 || event.day > daysInMonth) {
      return;
    }
    const existing = eventsByDay.get(event.day) || [];
    existing.push(event);
    eventsByDay.set(event.day, existing);
  });

  const cells: CalendarCell[] = [];
  for (let index = 0; index < totalCells; index += 1) {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) {
      cells.push({ day: null, events: [], outgoings: 0, incomings: 0, pressure: 0 });
      continue;
    }

    const dayEvents = (eventsByDay.get(day) || []).slice().sort((a, b) => {
      const absoluteDiff = Math.abs(b.amount) - Math.abs(a.amount);
      if (absoluteDiff !== 0) {
        return absoluteDiff;
      }
      return a.title.localeCompare(b.title);
    });
    const outgoings = dayEvents.reduce((acc, event) => acc + (event.amount < 0 ? Math.abs(event.amount) : 0), 0);
    const incomings = dayEvents.reduce((acc, event) => acc + (event.amount > 0 ? event.amount : 0), 0);
    cells.push({
      day,
      events: dayEvents,
      outgoings,
      incomings,
      pressure: Math.max(0, outgoings - incomings)
    });
  }

  const weeks: CalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function parseIntegerCsv(raw: string, min: number, max: number, order: "asc" | "desc"): number[] {
  const parsed = raw
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isInteger(entry) && entry >= min && entry <= max);
  const unique = Array.from(new Set(parsed));
  return unique.sort((a, b) => (order === "asc" ? a - b : b - a));
}

export default function DashboardPage() {
  const { getIdToken } = useAuth();
  const [month, setMonth] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({
    lowMoneyLeftThreshold: String(DEFAULT_LOW_MONEY_LEFT_THRESHOLD),
    utilizationThresholdPercent: String(DEFAULT_CARD_UTILIZATION_THRESHOLD),
    dueReminderOffsets: "7,3,1",
    deliveryHoursLocal: "8",
    cooldownMinutes: "60",
    realtimePushEnabled: true,
    cronPushEnabled: true,
    quietHoursEnabled: false,
    quietHoursStartLocal: "22",
    quietHoursEndLocal: "7",
    quietHoursTimezone: "Europe/London",
    lowMoneyLeftEnabled: true,
    cardUtilizationEnabled: true,
    cardDueEnabled: true,
    billDueEnabled: true
  });
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [reconciliationActual, setReconciliationActual] = useState("");
  const [reconciliationNotes, setReconciliationNotes] = useState("");
  const [reconciliationMessage, setReconciliationMessage] = useState<string | null>(null);
  const [closureReason, setClosureReason] = useState("");
  const [savingReconciliation, setSavingReconciliation] = useState(false);
  const [savingClosure, setSavingClosure] = useState(false);
  const [alertActionBusyId, setAlertActionBusyId] = useState<string | null>(null);
  const [draggedTimelineEvent, setDraggedTimelineEvent] = useState<TimelineEvent | null>(null);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [scenarioDraft, setScenarioDraft] = useState({
    extraIncome: "0",
    extraExpenses: "0",
    extraCardPayments: "0",
    note: ""
  });
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponse["scenario"] | null>(null);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [scenarioMessage, setScenarioMessage] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard", month],
    queryFn: () =>
      authedRequest<DashboardData>(
        getIdToken,
        `/api/dashboard${month ? `?month=${encodeURIComponent(month)}` : ""}`
      )
  });

  useEffect(() => {
    if (!data?.alertSettings) {
      return;
    }
    setSettingsDraft({
      lowMoneyLeftThreshold: String(data.alertSettings.lowMoneyLeftThreshold),
      utilizationThresholdPercent: String(data.alertSettings.utilizationThresholdPercent),
      dueReminderOffsets: (data.alertSettings.dueReminderOffsets || []).join(","),
      deliveryHoursLocal: (data.alertSettings.deliveryHoursLocal || []).join(","),
      cooldownMinutes: String(data.alertSettings.cooldownMinutes ?? 60),
      realtimePushEnabled: data.alertSettings.realtimePushEnabled !== false,
      cronPushEnabled: data.alertSettings.cronPushEnabled !== false,
      quietHoursEnabled: data.alertSettings.quietHoursEnabled === true,
      quietHoursStartLocal: String(data.alertSettings.quietHoursStartLocal ?? 22),
      quietHoursEndLocal: String(data.alertSettings.quietHoursEndLocal ?? 7),
      quietHoursTimezone: data.alertSettings.quietHoursTimezone || "Europe/London",
      lowMoneyLeftEnabled: data.alertSettings.enabledTypes?.lowMoneyLeft !== false,
      cardUtilizationEnabled: data.alertSettings.enabledTypes?.cardUtilization !== false,
      cardDueEnabled: data.alertSettings.enabledTypes?.cardDue !== false,
      billDueEnabled: data.alertSettings.enabledTypes?.billDue !== false
    });
  }, [data?.alertSettings]);

  useEffect(() => {
    if (!data) {
      return;
    }
    const fallbackActual = data.snapshot?.moneyInBank ?? 0;
    const actual = data.reconciliation?.actualBalance ?? fallbackActual;
    setReconciliationActual(String(actual));
    setReconciliationNotes(data.reconciliation?.notes || "");
    setClosureReason(data.monthClosure?.reason || "");
    setReconciliationMessage(null);
  }, [data]);

  useEffect(() => {
    setScenarioResult(null);
    setScenarioMessage(null);
  }, [data?.selectedMonth]);

  const chartData = useMemo(() => {
    if (!data?.snapshot) {
      return [];
    }

    return [
      { name: "Income", value: data.snapshot.incomeTotal },
      { name: "Cards", value: -data.snapshot.cardSpendTotal },
      { name: "House", value: -data.snapshot.houseBillsTotal },
      { name: "Shopping", value: -data.snapshot.shoppingTotal },
      { name: "My Bills", value: -data.snapshot.myBillsTotal },
      { name: "Left", value: data.snapshot.moneyLeft }
    ];
  }, [data]);

  const calendarWeeks = useMemo(() => {
    if (!data?.timeline?.month) {
      return [];
    }
    return buildCalendar(data.timeline.month, data.timeline.events || []);
  }, [data?.timeline]);

  const weekPressure = useMemo(() => {
    return calendarWeeks.map((week, index) => {
      const totalOutgoings = week.reduce((acc, day) => acc + day.outgoings, 0);
      const totalIncomings = week.reduce((acc, day) => acc + day.incomings, 0);
      const pressure = Math.max(0, totalOutgoings - totalIncomings);
      return {
        index,
        totalOutgoings,
        totalIncomings,
        pressure
      };
    });
  }, [calendarWeeks]);

  const heavyWeeks = useMemo(() => {
    return weekPressure
      .filter((week) => week.pressure > 0)
      .sort((a, b) => b.pressure - a.pressure)
      .slice(0, 2);
  }, [weekPressure]);

  const maxDayPressure = useMemo(
    () =>
      calendarWeeks
        .flat()
        .reduce((acc, day) => Math.max(acc, day.pressure), 0),
    [calendarWeeks]
  );

  const timelineSummary = useMemo(() => {
    const events = data?.timeline?.events || [];
    const incomingTotal = events.reduce((acc, event) => acc + (event.amount > 0 ? event.amount : 0), 0);
    const outgoingTotal = events.reduce(
      (acc, event) => acc + (event.amount < 0 ? Math.abs(event.amount) : 0),
      0
    );
    return {
      monthLabel: formatMonthKeyUK(data?.timeline?.month || ""),
      incomingTotal,
      outgoingTotal
    };
  }, [data?.timeline]);

  const ledgerSummary = useMemo(() => {
    const entries = data?.ledgerEntries || [];
    const planned = entries.filter((entry) => entry.status === "planned").length;
    const posted = entries.filter((entry) => entry.status === "posted").length;
    const paid = entries.filter((entry) => entry.status === "paid").length;
    return { planned, posted, paid };
  }, [data?.ledgerEntries]);

  async function saveAlertSettings() {
    const lowMoneyLeftThreshold = Number.parseFloat(settingsDraft.lowMoneyLeftThreshold);
    const utilizationThresholdPercent = Number.parseFloat(settingsDraft.utilizationThresholdPercent);
    const cooldownMinutes = Number.parseInt(settingsDraft.cooldownMinutes, 10);
    const quietHoursStartLocal = Number.parseInt(settingsDraft.quietHoursStartLocal, 10);
    const quietHoursEndLocal = Number.parseInt(settingsDraft.quietHoursEndLocal, 10);
    const dueReminderOffsets = parseIntegerCsv(settingsDraft.dueReminderOffsets, 0, 31, "desc");
    const deliveryHoursLocal = parseIntegerCsv(settingsDraft.deliveryHoursLocal, 0, 23, "asc");

    if (!Number.isFinite(lowMoneyLeftThreshold) || lowMoneyLeftThreshold < 0) {
      setSettingsMessage("Low money-left threshold must be a number >= 0.");
      return;
    }
    if (!Number.isFinite(utilizationThresholdPercent) || utilizationThresholdPercent < 0) {
      setSettingsMessage("Utilization threshold must be a number >= 0.");
      return;
    }
    if (!Number.isInteger(cooldownMinutes) || cooldownMinutes < 0 || cooldownMinutes > 1440) {
      setSettingsMessage("Cooldown minutes must be an integer between 0 and 1440.");
      return;
    }
    if (dueReminderOffsets.length === 0) {
      setSettingsMessage("Due reminder days must include at least one value (0-31).");
      return;
    }
    if (deliveryHoursLocal.length === 0) {
      setSettingsMessage("Delivery hours must include at least one value (0-23).");
      return;
    }
    if (!Number.isInteger(quietHoursStartLocal) || quietHoursStartLocal < 0 || quietHoursStartLocal > 23) {
      setSettingsMessage("Quiet hours start must be an hour between 0 and 23.");
      return;
    }
    if (!Number.isInteger(quietHoursEndLocal) || quietHoursEndLocal < 0 || quietHoursEndLocal > 23) {
      setSettingsMessage("Quiet hours end must be an hour between 0 and 23.");
      return;
    }
    if (!settingsDraft.quietHoursTimezone.trim()) {
      setSettingsMessage("Quiet hours timezone is required.");
      return;
    }

    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      const response = await authedRequest<{
        dispatch?: { sent: number; reason?: string };
      }>(getIdToken, "/api/alerts/settings", {
        method: "PUT",
        body: JSON.stringify({
          lowMoneyLeftThreshold,
          utilizationThresholdPercent,
          dueReminderOffsets,
          deliveryHoursLocal,
          cooldownMinutes,
          realtimePushEnabled: settingsDraft.realtimePushEnabled,
          cronPushEnabled: settingsDraft.cronPushEnabled,
          quietHoursEnabled: settingsDraft.quietHoursEnabled,
          quietHoursStartLocal,
          quietHoursEndLocal,
          quietHoursTimezone: settingsDraft.quietHoursTimezone.trim(),
          enabledTypes: {
            lowMoneyLeft: settingsDraft.lowMoneyLeftEnabled,
            cardUtilization: settingsDraft.cardUtilizationEnabled,
            cardDue: settingsDraft.cardDueEnabled,
            billDue: settingsDraft.billDueEnabled
          }
        })
      });
      if ((response.dispatch?.sent || 0) > 0) {
        setSettingsMessage(`Alert settings saved. Sent ${response.dispatch?.sent} live notification(s).`);
      } else if (response.dispatch?.reason) {
        setSettingsMessage(`Alert settings saved. ${response.dispatch.reason}`);
      } else {
        setSettingsMessage("Alert settings saved.");
      }
      await refetch();
    } catch (requestError) {
      setSettingsMessage(formatApiClientError(requestError, "Failed to save alert settings."));
    } finally {
      setSavingSettings(false);
    }
  }

  async function acknowledgeAlert(alertId: string) {
    setAlertActionBusyId(`${alertId}:ack`);
    setSettingsMessage(null);
    try {
      await authedRequest(getIdToken, `/api/alerts/${encodeURIComponent(alertId)}/ack`, {
        method: "POST"
      });
      setSettingsMessage("Alert acknowledged.");
      await refetch();
    } catch (requestError) {
      setSettingsMessage(formatApiClientError(requestError, "Failed to acknowledge alert."));
    } finally {
      setAlertActionBusyId(null);
    }
  }

  async function snoozeAlert(alertId: string, minutes: number) {
    setAlertActionBusyId(`${alertId}:snooze`);
    setSettingsMessage(null);
    try {
      await authedRequest(getIdToken, `/api/alerts/${encodeURIComponent(alertId)}/snooze`, {
        method: "POST",
        body: JSON.stringify({ minutes })
      });
      setSettingsMessage(`Alert snoozed for ${minutes} minute(s).`);
      await refetch();
    } catch (requestError) {
      setSettingsMessage(formatApiClientError(requestError, "Failed to snooze alert."));
    } finally {
      setAlertActionBusyId(null);
    }
  }

  async function muteAlert(alertId: string) {
    setAlertActionBusyId(`${alertId}:mute`);
    setSettingsMessage(null);
    try {
      await authedRequest(getIdToken, `/api/alerts/${encodeURIComponent(alertId)}/mute`, {
        method: "POST",
        body: JSON.stringify({ muted: true })
      });
      setSettingsMessage("Alert muted.");
      await refetch();
    } catch (requestError) {
      setSettingsMessage(formatApiClientError(requestError, "Failed to mute alert."));
    } finally {
      setAlertActionBusyId(null);
    }
  }

  async function saveReconciliation() {
    const selectedMonth = month || data?.selectedMonth || "";
    if (!selectedMonth) {
      setReconciliationMessage("No month selected.");
      return;
    }

    const actualBalance = Number.parseFloat(reconciliationActual);
    if (!Number.isFinite(actualBalance)) {
      setReconciliationMessage("Actual balance must be a valid number.");
      return;
    }

    setSavingReconciliation(true);
    setReconciliationMessage(null);
    try {
      await authedRequest(getIdToken, `/api/reconciliations/${selectedMonth}`, {
        method: "PUT",
        body: JSON.stringify({
          actualBalance,
          notes: reconciliationNotes.trim() || undefined
        })
      });
      setReconciliationMessage("Reconciliation saved.");
      await refetch();
    } catch (requestError) {
      setReconciliationMessage(formatApiClientError(requestError, "Failed to save reconciliation."));
    } finally {
      setSavingReconciliation(false);
    }
  }

  async function toggleMonthClosure() {
    const selectedMonth = month || data?.selectedMonth || "";
    if (!selectedMonth) {
      setReconciliationMessage("No month selected.");
      return;
    }

    const currentlyClosed = Boolean(data?.monthClosure?.closed);
    setSavingClosure(true);
    setReconciliationMessage(null);
    try {
      await authedRequest(getIdToken, `/api/month-closures/${selectedMonth}`, {
        method: "PUT",
        body: JSON.stringify({
          closed: !currentlyClosed,
          reason: closureReason.trim() || undefined
        })
      });
      setReconciliationMessage(currentlyClosed ? "Month reopened." : "Month closed.");
      await refetch();
    } catch (requestError) {
      setReconciliationMessage(formatApiClientError(requestError, "Failed to update month lock."));
    } finally {
      setSavingClosure(false);
    }
  }

  async function runScenario() {
    const selectedMonth = month || data?.selectedMonth || "";
    if (!selectedMonth) {
      setScenarioMessage("No month selected.");
      return;
    }

    const extraIncome = Number.parseFloat(scenarioDraft.extraIncome);
    const extraExpenses = Number.parseFloat(scenarioDraft.extraExpenses);
    const extraCardPayments = Number.parseFloat(scenarioDraft.extraCardPayments);
    if (!Number.isFinite(extraIncome) || !Number.isFinite(extraExpenses) || !Number.isFinite(extraCardPayments)) {
      setScenarioMessage("Scenario values must be valid numbers.");
      return;
    }

    setScenarioBusy(true);
    setScenarioMessage(null);
    try {
      const response = await authedRequest<ScenarioResponse>(getIdToken, "/api/scenario", {
        method: "POST",
        body: JSON.stringify({
          month: selectedMonth,
          extraIncome,
          extraExpenses,
          extraCardPayments,
          note: scenarioDraft.note.trim() || undefined
        })
      });
      setScenarioResult(response.scenario);
      setScenarioMessage("Scenario calculated. Live data not changed.");
    } catch (requestError) {
      setScenarioMessage(formatApiClientError(requestError, "Failed to run scenario."));
    } finally {
      setScenarioBusy(false);
    }
  }

  function clearScenario() {
    setScenarioResult(null);
    setScenarioMessage(null);
    setScenarioDraft({
      extraIncome: "0",
      extraExpenses: "0",
      extraCardPayments: "0",
      note: ""
    });
  }

  async function moveDueDay(event: TimelineEvent, nextDay: number) {
    const selectedMonth = data?.timeline?.month || data?.selectedMonth || "";
    if (!selectedMonth) {
      return;
    }
    if (!event.editableDueDay || !event.sourceType || !event.sourceId) {
      setCalendarMessage("This timeline item cannot be moved.");
      return;
    }
    if (event.day === nextDay) {
      return;
    }
    if (
      !["cardAccount", "houseBill", "shoppingItem", "myBill", "monthlyAdjustment"].includes(
        event.sourceType
      )
    ) {
      setCalendarMessage("This timeline item cannot be moved.");
      return;
    }

    setCalendarMessage(null);
    try {
      await authedRequest(getIdToken, "/api/calendar/due-day", {
        method: "POST",
        body: JSON.stringify({
          month: selectedMonth,
          sourceType: event.sourceType,
          sourceId: event.sourceId,
          dueDayOfMonth: nextDay
        })
      });
      setCalendarMessage(`${event.title} moved to day ${nextDay}.`);
      await refetch();
    } catch (requestError) {
      setCalendarMessage(formatApiClientError(requestError, "Failed to move due day."));
    }
  }

  return (
    <ProtectedPage title="Dashboard">
      <div className="space-y-4">
        <SectionPanel
          title="Monthly overview"
          subtitle="Live totals based on cards, bills, and formula-variant parity."
          right={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <select
                className="input w-full sm:min-w-[140px] sm:w-auto"
                value={month || data?.selectedMonth || ""}
                onChange={(event) => setMonth(event.target.value || null)}
              >
                <option value="">Current month</option>
                {(data?.availableMonths || []).map((entry) => (
                  <option key={entry} value={entry}>
                    {formatMonthKeyUK(entry)}
                  </option>
                ))}
              </select>
              <button type="button" className="button-secondary w-full sm:w-auto" onClick={() => refetch()}>
                Refresh
              </button>
            </div>
          }
        >
          {isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading dashboard...</p> : null}
          {error ? <p className="text-sm text-red-700">{(error as Error).message}</p> : null}

          {data?.snapshot ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Metric label="Income" value={formatGBP(data.snapshot.incomeTotal)} />
                <Metric label="Money In Bank" value={formatGBP(data.snapshot.moneyInBank)} />
                <Metric
                  label="Bank Accounts (Closing)"
                  value={formatGBP(
                    data.bankAccountProjection?.entries?.length
                      ? data.bankAccountProjection.totalClosingBalance
                      : data.snapshot.moneyInBank
                  )}
                />
                <Metric
                  label="Loaned Out (Outstanding)"
                  value={formatGBP(data.snapshot.loanedOutOutstandingTotal)}
                />
                <Metric label="Loaned Out (Paid Back)" value={formatGBP(data.snapshot.loanedOutPaidBackTotal)} />
                <Metric label="Card Spend" value={formatGBP(data.snapshot.cardSpendTotal)} />
                <Metric label="Card Interest" value={formatGBP(data.snapshot.cardInterestTotal)} />
                <Metric label="Card Balance" value={formatGBP(data.snapshot.cardBalanceTotal)} />
                <Metric label="House Bills" value={formatGBP(data.snapshot.houseBillsTotal)} />
                <Metric label="Shopping" value={formatGBP(data.snapshot.shoppingTotal)} />
                <Metric label="My Bills" value={formatGBP(data.snapshot.myBillsTotal)} />
                <Metric label="Adjustments" value={formatGBP(data.snapshot.adjustmentsTotal)} />
                <Metric label="Money Left" value={formatGBP(data.snapshot.moneyLeft)} />
              </div>

              <div className="panel p-4">
                <p className="label">Cashflow shape ({formatMonthKeyUK(data.snapshot.month)})</p>
                <MeasuredChart className="mt-4 h-56 w-full min-w-0 sm:h-72" minHeight={220}>
                  {({ width, height }) => (
                    <AreaChart width={width} height={height} data={chartData}>
                      <XAxis dataKey="name" tick={{ fill: "#556273", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#556273", fontSize: 12 }} />
                      <Tooltip formatter={(value) => formatGBP(Number(value ?? 0))} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#0f7d6f"
                        fill="url(#cashflowFill)"
                        strokeWidth={2}
                      />
                      <defs>
                        <linearGradient id="cashflowFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#0f7d6f" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#25428f" stopOpacity={0.12} />
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  )}
                </MeasuredChart>
                <p className="mt-2 text-xs text-[var(--ink-soft)]">
                  Formula Variant: {data.snapshot.formulaVariantId}
                  {data.snapshot.inferred ? " (inferred month)" : ""}
                </p>
              </div>

              {data.bankAccountProjection?.entries?.length ? (
                <div className="panel p-4">
                  <p className="label">Account Split ({formatMonthKeyUK(data.bankAccountProjection.month)})</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {data.bankAccountProjection.entries.map((entry) => (
                      <div key={`dashboard-account-${entry.accountId}`} className="rounded-xl border border-[var(--ring)] bg-white/75 p-3">
                        <p className="text-sm font-semibold text-[var(--ink-main)]">{entry.name}</p>
                        <p className="mt-1 text-xs text-[var(--ink-soft)] capitalize">{entry.accountType}</p>
                        <p className="mt-2 text-base font-semibold text-[var(--ink-main)]">
                          {formatGBP(entry.closingBalance)}
                        </p>
                        <p className="text-xs text-[var(--ink-soft)]">
                          Change: {formatGBP(entry.netChange)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            !isLoading && <p className="text-sm text-[var(--ink-soft)]">No snapshot data yet. Import workbook first.</p>
          )}
        </SectionPanel>

        <SectionPanel
          title="Planning Core (v1.1)"
          subtitle="Payday mode, savings targets, debt payoff modeling, net worth, and drift analytics (read-only)."
          right={
            <Link className="button-secondary inline-block text-sm" href="/net-worth">
              Open Net Worth
            </Link>
          }
        >
          {data?.planning ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Metric
                  label="Payday Mode"
                  value={data.planning.paydayMode.enabled ? `Every ${data.planning.paydayMode.cycleDays} days` : "Off"}
                />
                <Metric
                  label="Savings Target (Month)"
                  value={formatGBP(data.planning.savings.monthlyTargetTotal)}
                />
                <Metric
                  label="Money Left After Savings"
                  value={formatGBP(data.planning.savings.projectedMoneyLeftAfterSavings)}
                />
                <Metric label="Total Debt" value={formatGBP(data.planning.debtPayoff.totalDebt)} />
                <Metric label="Debt Budget" value={formatGBP(data.planning.debtPayoff.monthlyBudget)} />
                <Metric label="Net Worth" value={formatGBP(data.planning.netWorth.netWorth)} />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="panel p-4">
                  <p className="label">Debt Payoff Comparison</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[var(--ring)] bg-white/70 p-3">
                      <p className="text-sm font-semibold text-[var(--ink-main)]">Snowball</p>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">
                        Debt-free:{" "}
                        {data.planning.debtPayoff.byStrategy.snowball.monthsToDebtFree === null
                          ? "Not reached"
                          : `${data.planning.debtPayoff.byStrategy.snowball.monthsToDebtFree} months`}
                      </p>
                      <p className="text-sm text-[var(--ink-soft)]">
                        Interest: {formatGBP(data.planning.debtPayoff.byStrategy.snowball.totalInterest)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--ring)] bg-white/70 p-3">
                      <p className="text-sm font-semibold text-[var(--ink-main)]">Avalanche</p>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">
                        Debt-free:{" "}
                        {data.planning.debtPayoff.byStrategy.avalanche.monthsToDebtFree === null
                          ? "Not reached"
                          : `${data.planning.debtPayoff.byStrategy.avalanche.monthsToDebtFree} months`}
                      </p>
                      <p className="text-sm text-[var(--ink-soft)]">
                        Interest: {formatGBP(data.planning.debtPayoff.byStrategy.avalanche.totalInterest)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="panel p-4">
                  <p className="label">Category Drift Alerts</p>
                  {data.planning.analytics.driftAlerts.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {data.planning.analytics.driftAlerts.map((alert) => (
                        <div
                          key={`drift-alert-${alert.key}`}
                          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                        >
                          <p className="font-semibold">{alert.label}</p>
                          <p>
                            {formatGBP(alert.delta)} ({alert.deltaPercent > 0 ? "+" : ""}
                            {alert.deltaPercent.toFixed(1)}%)
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--ink-soft)]">
                      No material month-over-month drift above alert thresholds.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">Planning insights will appear after monthly data loads.</p>
          )}
        </SectionPanel>

        <SectionPanel
          title="Scenario Mode (Sandbox)"
          subtitle="Run what-if changes without writing live data. Use this to test extra income, expenses, or debt payments."
          right={
            <button type="button" className="button-secondary" onClick={() => clearScenario()}>
              Clear scenario
            </button>
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="label">Extra income (GBP)</span>
              <input
                className="input mt-1"
                type="number"
                step="0.01"
                value={scenarioDraft.extraIncome}
                onChange={(event) =>
                  setScenarioDraft((prev) => ({
                    ...prev,
                    extraIncome: event.target.value
                  }))
                }
              />
            </label>
            <label className="block">
              <span className="label">Extra expenses (GBP)</span>
              <input
                className="input mt-1"
                type="number"
                step="0.01"
                value={scenarioDraft.extraExpenses}
                onChange={(event) =>
                  setScenarioDraft((prev) => ({
                    ...prev,
                    extraExpenses: event.target.value
                  }))
                }
              />
            </label>
            <label className="block">
              <span className="label">Extra card payments (GBP)</span>
              <input
                className="input mt-1"
                type="number"
                step="0.01"
                value={scenarioDraft.extraCardPayments}
                onChange={(event) =>
                  setScenarioDraft((prev) => ({
                    ...prev,
                    extraCardPayments: event.target.value
                  }))
                }
              />
            </label>
            <label className="block">
              <span className="label">Scenario note</span>
              <input
                className="input mt-1"
                value={scenarioDraft.note}
                onChange={(event) =>
                  setScenarioDraft((prev) => ({
                    ...prev,
                    note: event.target.value
                  }))
                }
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="mt-3">
            <button
              type="button"
              className="button-primary w-full sm:w-auto"
              onClick={() => runScenario()}
              disabled={scenarioBusy}
            >
              {scenarioBusy ? "Running..." : "Run scenario"}
            </button>
          </div>

          {scenarioMessage ? <p className="mt-2 text-sm text-[var(--accent-strong)]">{scenarioMessage}</p> : null}

          {scenarioResult ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Money Left (Projected)" value={formatGBP(scenarioResult.projected.moneyLeft)} />
              <Metric label="Money In Bank (Projected)" value={formatGBP(scenarioResult.projected.moneyInBank)} />
              <Metric label="Card Balance (Projected)" value={formatGBP(scenarioResult.projected.cardBalanceTotal)} />
              <Metric label="Net Worth (Projected)" value={formatGBP(scenarioResult.projected.netWorth)} />
            </div>
          ) : null}
        </SectionPanel>

        <SectionPanel
          title="Subscription Intelligence"
          subtitle="Recurring monthly cost ranking with lower-cost swap ideas."
        >
          {data?.subscriptionIntelligence ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="panel p-3">
                <p className="label">Top recurring costs</p>
                <div className="mt-2 space-y-2">
                  {data.subscriptionIntelligence.ranked.slice(0, 8).map((entry) => (
                    <div key={`sub-rank-${entry.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ring)] bg-white/70 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ink-main)]">
                          {entry.rank}. {entry.name}
                        </p>
                        <p className="text-xs text-[var(--ink-soft)]">{entry.sourceCollection}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[var(--ink-main)]">{formatGBP(entry.monthlyAmount)}</p>
                        <p className="text-xs text-[var(--ink-soft)]">{formatGBP(entry.annualAmount)}/yr</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel p-3">
                <p className="label">Swap suggestions</p>
                {data.subscriptionIntelligence.suggestions.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {data.subscriptionIntelligence.suggestions.map((suggestion) => (
                      <div key={`sub-suggestion-${suggestion.id}`} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                        <p className="font-semibold">{suggestion.name}</p>
                        <p>
                          {formatGBP(suggestion.currentMonthly)} {"->"} {formatGBP(suggestion.suggestedMonthly)} / month
                        </p>
                        <p>Potential annual saving: {formatGBP(suggestion.potentialAnnualSavings)}</p>
                        <p className="text-xs">{suggestion.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">No high-confidence savings suggestions right now.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">Subscription intelligence not available yet.</p>
          )}
        </SectionPanel>

        <SectionPanel
          title="Smart alerts"
          subtitle="In-app and push alerts for low money-left forecast, high card utilization, and upcoming due dates."
          right={
            <div className="space-y-1 text-sm text-[var(--ink-soft)]">
              <p>Due checks: {(data?.alertSettings?.dueReminderOffsets || []).join("/") || "7/3/1"} days</p>
              <p>
                Delivery hours (UK):{" "}
                {(data?.alertSettings?.deliveryHoursLocal || []).map((hour) => `${hour}:00`).join(", ") || "8:00"}
              </p>
              <p>
                Quiet hours:{" "}
                {data?.alertSettings?.quietHoursEnabled
                  ? `${data?.alertSettings?.quietHoursStartLocal}:00-${data?.alertSettings?.quietHoursEndLocal}:00 (${data?.alertSettings?.quietHoursTimezone || "Europe/London"})`
                  : "Off"}
              </p>
            </div>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="label">Low money-left threshold (GBP)</span>
              <input
                className="input mt-1"
                type="number"
                step="0.01"
                value={settingsDraft.lowMoneyLeftThreshold}
                onChange={(event) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    lowMoneyLeftThreshold: event.target.value
                  }))
                }
              />
            </label>
            <label className="block">
              <span className="label">Card utilization threshold (%)</span>
              <input
                className="input mt-1"
                type="number"
                step="0.1"
                value={settingsDraft.utilizationThresholdPercent}
                onChange={(event) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    utilizationThresholdPercent: event.target.value
                  }))
                }
              />
            </label>
            <label className="block">
              <span className="label">Due reminder days (0-31, CSV)</span>
              <input
                className="input mt-1"
                value={settingsDraft.dueReminderOffsets}
                onChange={(event) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    dueReminderOffsets: event.target.value
                  }))
                }
                placeholder="7,3,1"
              />
            </label>
            <label className="block">
              <span className="label">Delivery hours UK (0-23, CSV)</span>
              <input
                className="input mt-1"
                value={settingsDraft.deliveryHoursLocal}
                onChange={(event) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    deliveryHoursLocal: event.target.value
                  }))
                }
                placeholder="8,18"
              />
            </label>
            <label className="block">
              <span className="label">Push cooldown (minutes)</span>
              <input
                className="input mt-1"
                type="number"
                min={0}
                max={1440}
                step={1}
                value={settingsDraft.cooldownMinutes}
                onChange={(event) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    cooldownMinutes: event.target.value
                  }))
                }
              />
            </label>
            <div className="panel p-3">
              <p className="label">Push modes</p>
              <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ink-main)]">
                <input
                  type="checkbox"
                  checked={settingsDraft.realtimePushEnabled}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      realtimePushEnabled: event.target.checked
                    }))
                  }
                />
                Realtime alerts after data changes
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ink-main)]">
                <input
                  type="checkbox"
                  checked={settingsDraft.cronPushEnabled}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      cronPushEnabled: event.target.checked
                    }))
                  }
                />
                Background alerts via Vercel cron
              </label>
            </div>
            <div className="panel p-3">
              <p className="label">Quiet hours</p>
              <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ink-main)]">
                <input
                  type="checkbox"
                  checked={settingsDraft.quietHoursEnabled}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      quietHoursEnabled: event.target.checked
                    }))
                  }
                />
                Suppress realtime + cron push during quiet hours
              </label>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Start hour (0-23)</span>
                  <input
                    className="input mt-1"
                    type="number"
                    min={0}
                    max={23}
                    step={1}
                    value={settingsDraft.quietHoursStartLocal}
                    onChange={(event) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        quietHoursStartLocal: event.target.value
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="label">End hour (0-23)</span>
                  <input
                    className="input mt-1"
                    type="number"
                    min={0}
                    max={23}
                    step={1}
                    value={settingsDraft.quietHoursEndLocal}
                    onChange={(event) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        quietHoursEndLocal: event.target.value
                      }))
                    }
                  />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="label">Timezone</span>
                <input
                  className="input mt-1"
                  value={settingsDraft.quietHoursTimezone}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      quietHoursTimezone: event.target.value
                    }))
                  }
                />
              </label>
            </div>
            <div className="panel p-3">
              <p className="label">Alert types</p>
              <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ink-main)]">
                <input
                  type="checkbox"
                  checked={settingsDraft.lowMoneyLeftEnabled}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      lowMoneyLeftEnabled: event.target.checked
                    }))
                  }
                />
                Low money-left
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ink-main)]">
                <input
                  type="checkbox"
                  checked={settingsDraft.cardUtilizationEnabled}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      cardUtilizationEnabled: event.target.checked
                    }))
                  }
                />
                Card utilization
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ink-main)]">
                <input
                  type="checkbox"
                  checked={settingsDraft.cardDueEnabled}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      cardDueEnabled: event.target.checked
                    }))
                  }
                />
                Card due dates
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ink-main)]">
                <input
                  type="checkbox"
                  checked={settingsDraft.billDueEnabled}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      billDueEnabled: event.target.checked
                    }))
                  }
                />
                Bills and adjustments due dates
              </label>
            </div>
            <div className="flex items-end xl:justify-end">
              <button
                type="button"
                className="button-primary w-full xl:w-auto"
                onClick={() => saveAlertSettings()}
                disabled={savingSettings}
              >
                {savingSettings ? "Saving..." : "Save alert settings"}
              </button>
            </div>
          </div>

          {settingsMessage ? <p className="mt-3 text-sm text-[var(--accent-strong)]">{settingsMessage}</p> : null}

          {(data?.alerts || []).length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {data?.alerts.map((alert) => (
                <div className="panel p-4" key={alert.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--ink-main)]">{alert.title}</p>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${severityClass(alert.severity)}`}>
                    {alert.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">{alert.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={alertActionBusyId === `${alert.id}:ack`}
                    onClick={() => acknowledgeAlert(alert.id)}
                  >
                    {alertActionBusyId === `${alert.id}:ack` ? "..." : "Acknowledge"}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={alertActionBusyId === `${alert.id}:snooze`}
                    onClick={() => snoozeAlert(alert.id, 24 * 60)}
                  >
                    {alertActionBusyId === `${alert.id}:snooze` ? "..." : "Snooze 24h"}
                  </button>
                  <button
                    type="button"
                    className="button-danger"
                    disabled={alertActionBusyId === `${alert.id}:mute`}
                    onClick={() => muteAlert(alert.id)}
                  >
                    {alertActionBusyId === `${alert.id}:mute` ? "..." : "Mute"}
                  </button>
                </div>
              </div>
            ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--ink-soft)]">No active alerts for the current settings.</p>
          )}
        </SectionPanel>

        <SectionPanel
          title="Reconciliation & Month Lock"
          subtitle="Set actual balance, track variance, and lock reconciled months to prevent accidental edits."
          right={
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                data?.monthClosure?.closed
                  ? "border border-red-200 bg-red-50 text-red-800"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {data?.monthClosure?.closed ? "Closed month" : "Open month"}
            </span>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="panel p-3">
              <p className="label">Selected month</p>
              <p className="mt-1 text-sm font-medium text-[var(--ink-main)]">
                {formatMonthKeyUK(month || data?.selectedMonth || "")}
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="label">Opening balance</p>
                  <p className="mt-1 text-sm text-[var(--ink-main)]">{formatGBP(data?.bankFlow?.openingBalance || 0)}</p>
                </div>
                <div>
                  <p className="label">Planned to date</p>
                  <p className="mt-1 text-sm text-[var(--ink-main)]">{formatGBP(data?.bankFlow?.plannedToDate || 0)}</p>
                </div>
                <div>
                  <p className="label">Actual to date</p>
                  <p className="mt-1 text-sm text-[var(--ink-main)]">{formatGBP(data?.bankFlow?.actualToDate || 0)}</p>
                </div>
                <div>
                  <p className="label">Ledger status mix</p>
                  <p className="mt-1 text-sm text-[var(--ink-main)]">
                    Planned {ledgerSummary.planned} · Posted {ledgerSummary.posted} · Paid {ledgerSummary.paid}
                  </p>
                </div>
              </div>

              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                Money-in-bank uses {data?.bankFlow?.usingActual ? "actual posted/paid entries" : "planned events"} for this month.
              </p>

              <label className="mt-3 block">
                <span className="label">Lock reason</span>
                <input
                  className="input mt-1"
                  value={closureReason}
                  onChange={(event) => setClosureReason(event.target.value)}
                  placeholder="Optional reason for lock/reopen"
                />
              </label>

              <button
                type="button"
                className="button-secondary mt-3 w-full sm:w-auto"
                onClick={() => toggleMonthClosure()}
                disabled={savingClosure}
              >
                {savingClosure
                  ? "Saving..."
                  : data?.monthClosure?.closed
                    ? "Reopen month"
                    : "Close month"}
              </button>
            </div>

            <div className="panel p-3">
              <p className="label">Reconciliation</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Expected: {formatGBP(data?.snapshot?.moneyInBank || 0)}
              </p>

              <label className="mt-3 block">
                <span className="label">Actual balance</span>
                <input
                  className="input mt-1"
                  type="number"
                  step="0.01"
                  value={reconciliationActual}
                  onChange={(event) => setReconciliationActual(event.target.value)}
                />
              </label>
              <label className="mt-3 block">
                <span className="label">Notes</span>
                <textarea
                  className="input mt-1 min-h-[96px]"
                  value={reconciliationNotes}
                  onChange={(event) => setReconciliationNotes(event.target.value)}
                  placeholder="Optional reconciliation notes"
                />
              </label>

              {data?.reconciliation ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${reconciliationStatusClass(
                      data.reconciliation.status
                    )}`}
                  >
                    {data.reconciliation.status}
                  </span>
                  <span className="text-sm text-[var(--ink-soft)]">
                    Variance: {formatGBP(data.reconciliation.variance)}
                  </span>
                </div>
              ) : null}

              <button
                type="button"
                className="button-primary mt-3 w-full sm:w-auto"
                onClick={() => saveReconciliation()}
                disabled={savingReconciliation}
              >
                {savingReconciliation ? "Saving..." : "Save reconciliation"}
              </button>
            </div>
          </div>

          {reconciliationMessage ? (
            <p className="mt-3 text-sm text-[var(--accent-strong)]">{reconciliationMessage}</p>
          ) : null}
        </SectionPanel>

        <SectionPanel
          title="Monthly timeline"
          subtitle={
            data?.timeline?.month || data?.selectedMonth
              ? `UK calendar view for ${formatMonthKeyUK(
                  data?.timeline?.month || data?.selectedMonth || ""
                )}. Includes income pay dates, card due dates, bills, transfers, and adjustments. Drag due chips to move due day.`
              : "UK calendar view of income pay dates, card due dates, bills, transfers, and adjustments."
          }
        >
          {calendarWeeks.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">No timeline data available for this month.</p>
          ) : (
            <div className="space-y-3">
              <div className="panel p-3">
                <p className="text-sm font-semibold text-[var(--ink-main)]">{timelineSummary.monthLabel}</p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  Incoming: {formatGBP(timelineSummary.incomingTotal)} | Outgoing:{" "}
                  {formatGBP(timelineSummary.outgoingTotal)}
                </p>
              </div>

              {heavyWeeks.length > 0 ? (
                <div className="calendar-heavy">
                  {heavyWeeks.map((week) => (
                    <span key={`heavy-week-${week.index}`} className="calendar-heavy-chip">
                      Heavy week {week.index + 1}: {formatGBP(week.pressure)} pressure
                    </span>
                  ))}
                </div>
              ) : null}

              {weekPressure.length > 0 ? (
                <div className="calendar-heatmap">
                  {weekPressure.map((week) => {
                    const maxPressure = Math.max(...weekPressure.map((entry) => entry.pressure), 1);
                    const ratio = week.pressure <= 0 ? 0 : Math.min(1, week.pressure / maxPressure);
                    const width = `${Math.round(ratio * 100)}%`;
                    return (
                      <div key={`week-pressure-${week.index}`} className="calendar-heatmap-row">
                        <p className="calendar-heatmap-label">Week {week.index + 1}</p>
                        <div className="calendar-heatmap-track">
                          <div className="calendar-heatmap-fill" style={{ width }} />
                        </div>
                        <p className="calendar-heatmap-value">{formatGBP(week.pressure)}</p>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="calendar-scroll">
                <div className="calendar-canvas">
                  <div className="calendar-weekdays">
                    {WEEKDAY_LABELS.map((label) => (
                      <p key={`weekday-${label}`} className="calendar-weekday">
                        {label}
                      </p>
                    ))}
                  </div>

                  <div className="calendar-grid">
                    {calendarWeeks.flat().map((cell, index) => (
                      <div
                        key={`calendar-cell-${index}`}
                        className={`calendar-day ${cell.day ? dayPressureClass(cell.pressure, maxDayPressure) : "is-empty"}`}
                        onDragOver={(event) => {
                          if (cell.day && draggedTimelineEvent?.editableDueDay) {
                            event.preventDefault();
                          }
                        }}
                        onDrop={async (event) => {
                          event.preventDefault();
                          if (!cell.day || !draggedTimelineEvent) {
                            return;
                          }
                          await moveDueDay(draggedTimelineEvent, cell.day);
                          setDraggedTimelineEvent(null);
                        }}
                      >
                        {cell.day ? (
                          <>
                            <div className="calendar-day-head">
                              <p className="calendar-day-number">{cell.day}</p>
                              {cell.outgoings > 0 ? (
                                <p className="calendar-day-total">{formatGBP(cell.outgoings)}</p>
                              ) : null}
                            </div>
                            <div className="calendar-day-events">
                              {cell.events.slice(0, 3).map((event) => (
                                <div
                                  key={event.id}
                                  className={`${timelineChipClass(event.type)} ${event.editableDueDay ? "is-draggable" : ""}`}
                                  draggable={Boolean(event.editableDueDay)}
                                  onDragStart={() => setDraggedTimelineEvent(event)}
                                  onDragEnd={() => setDraggedTimelineEvent(null)}
                                  title={event.editableDueDay ? "Drag to another day to update due day" : undefined}
                                >
                                  <p className="truncate font-medium">{event.title}</p>
                                  {eventAmountLabel(event) ? (
                                    <p className="truncate opacity-90">{eventAmountLabel(event)}</p>
                                  ) : null}
                                </div>
                              ))}
                              {cell.events.length > 3 ? (
                                <p className="calendar-more">+{cell.events.length - 3} more</p>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {calendarMessage ? <p className="text-sm text-[var(--accent-strong)]">{calendarMessage}</p> : null}
            </div>
          )}
        </SectionPanel>
      </div>
    </ProtectedPage>
  );
}
