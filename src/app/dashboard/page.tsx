"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { formatGBP, formatMonthKeyUK } from "@/lib/util/format";

interface TimelineEvent {
  id: string;
  type: "card-due" | "bill-due" | "adjustment";
  title: string;
  subtitle?: string;
  date: string;
  day: number;
  amount: number;
  category: string;
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
  loanedOutItems: Array<{
    id: string;
    name: string;
    amount: number;
    startMonth: string;
    status: "outstanding" | "paidBack";
    paidBackMonth?: string;
  }>;
  alertSettings: {
    lowMoneyLeftThreshold: number;
    utilizationThresholdPercent: number;
    dueReminderOffsets: number[];
  };
  alerts: Array<{
    id: string;
    type: "low-money-left" | "card-utilization" | "card-due";
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
}

interface CalendarCell {
  day: number | null;
  events: TimelineEvent[];
  outgoings: number;
  incomings: number;
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

function timelineChipClass(type: TimelineEvent["type"]): string {
  if (type === "card-due") {
    return "calendar-event card-due";
  }
  if (type === "adjustment") {
    return "calendar-event adjustment";
  }
  return "calendar-event bill-due";
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
      cells.push({ day: null, events: [], outgoings: 0, incomings: 0 });
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
    cells.push({ day, events: dayEvents, outgoings, incomings });
  }

  const weeks: CalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

export default function DashboardPage() {
  const { getIdToken } = useAuth();
  const [month, setMonth] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({
    lowMoneyLeftThreshold: "0",
    utilizationThresholdPercent: "0"
  });
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

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
      utilizationThresholdPercent: String(data.alertSettings.utilizationThresholdPercent)
    });
  }, [data?.alertSettings]);

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

  const heavyWeeks = useMemo(() => {
    return calendarWeeks
      .map((week, index) => ({
        index,
        totalOutgoings: week.reduce((acc, day) => acc + day.outgoings, 0)
      }))
      .filter((week) => week.totalOutgoings > 0)
      .sort((a, b) => b.totalOutgoings - a.totalOutgoings)
      .slice(0, 2);
  }, [calendarWeeks]);

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

  async function saveAlertSettings() {
    const lowMoneyLeftThreshold = Number.parseFloat(settingsDraft.lowMoneyLeftThreshold);
    const utilizationThresholdPercent = Number.parseFloat(settingsDraft.utilizationThresholdPercent);

    if (!Number.isFinite(lowMoneyLeftThreshold) || lowMoneyLeftThreshold < 0) {
      setSettingsMessage("Low money-left threshold must be a number >= 0.");
      return;
    }
    if (!Number.isFinite(utilizationThresholdPercent) || utilizationThresholdPercent < 0) {
      setSettingsMessage("Utilization threshold must be a number >= 0.");
      return;
    }

    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      await authedRequest(getIdToken, "/api/alerts/settings", {
        method: "PUT",
        body: JSON.stringify({
          lowMoneyLeftThreshold,
          utilizationThresholdPercent
        })
      });
      setSettingsMessage("Alert thresholds saved.");
      await refetch();
    } catch (requestError) {
      setSettingsMessage(requestError instanceof Error ? requestError.message : "Failed to save alert settings.");
    } finally {
      setSavingSettings(false);
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
                <div className="mt-4 h-56 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
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
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-[var(--ink-soft)]">
                  Formula Variant: {data.snapshot.formulaVariantId}
                  {data.snapshot.inferred ? " (inferred month)" : ""}
                </p>
              </div>
            </div>
          ) : (
            !isLoading && <p className="text-sm text-[var(--ink-soft)]">No snapshot data yet. Import workbook first.</p>
          )}
        </SectionPanel>

        <SectionPanel
          title="Smart alerts"
          subtitle="In-app and push alerts for low money-left forecast, high card utilization, and upcoming due dates."
          right={
            <p className="text-sm text-[var(--ink-soft)]">
              Due checks: {(data?.alertSettings?.dueReminderOffsets || []).join("/") || "7/3/1"} days
            </p>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
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
            <button
              type="button"
              className="button-primary w-full xl:w-auto"
              onClick={() => saveAlertSettings()}
              disabled={savingSettings}
            >
              {savingSettings ? "Saving..." : "Save thresholds"}
            </button>
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
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--ink-soft)]">No active alerts for the current thresholds.</p>
          )}
        </SectionPanel>

        <SectionPanel
          title="Monthly timeline"
          subtitle={
            data?.timeline?.month || data?.selectedMonth
              ? `UK calendar view for ${formatMonthKeyUK(
                  data?.timeline?.month || data?.selectedMonth || ""
                )}. Includes income pay dates, card due dates, bills, and adjustments.`
              : "UK calendar view of income pay dates, card due dates, bills, and adjustments."
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
                      Heavy week {week.index + 1}: {formatGBP(week.totalOutgoings)} outgoings
                    </span>
                  ))}
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
                        className={`calendar-day ${cell.day ? "" : "is-empty"}`}
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
                                <div key={event.id} className={timelineChipClass(event.type)}>
                                  <p className="truncate font-medium">{event.title}</p>
                                  {event.amount !== 0 ? <p className="truncate opacity-90">{formatGBP(event.amount)}</p> : null}
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
            </div>
          )}
        </SectionPanel>
      </div>
    </ProtectedPage>
  );
}
