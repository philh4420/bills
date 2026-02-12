"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts";

import { MeasuredChart } from "@/components/measured-chart";
import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { formatGBP, formatMonthKeyUK } from "@/lib/util/format";

interface PlanningData {
  selectedMonth: string;
  availableMonths: string[];
  planning: {
    savings: {
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
      }>;
    };
    debtPayoff: {
      totalDebt: number;
      monthlyBudget: number;
      byStrategy: {
        snowball: {
          monthsToDebtFree: number | null;
          totalInterest: number;
          payoffOrder: string[];
        };
        avalanche: {
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
  netWorthTimeline: Array<{
    month: string;
    assets: number;
    liabilities: number;
    netWorth: number;
  }>;
}

function statusClass(status: "active" | "paused" | "completed"): string {
  if (status === "completed") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "paused") {
    return "border border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border border-blue-200 bg-blue-50 text-blue-800";
}

export default function NetWorthPage() {
  const { getIdToken } = useAuth();
  const [month, setMonth] = useState<string>("");

  const query = useQuery({
    queryKey: ["planning", month],
    queryFn: () =>
      authedRequest<PlanningData>(
        getIdToken,
        `/api/planning${month ? `?month=${encodeURIComponent(month)}` : ""}`
      )
  });

  useEffect(() => {
    if (!month && query.data?.selectedMonth) {
      setMonth(query.data.selectedMonth);
    }
  }, [month, query.data?.selectedMonth]);

  const chartData = useMemo(
    () =>
      (query.data?.netWorthTimeline || []).map((entry) => ({
        month: formatMonthKeyUK(entry.month),
        value: entry.netWorth
      })),
    [query.data?.netWorthTimeline]
  );

  return (
    <ProtectedPage title="Net Worth">
      <div className="space-y-4">
        <SectionPanel
          title="Net Worth v1"
          subtitle="Bank/cash + recoverable loans - debts, with debt payoff and savings projection context."
          right={
            <select
              className="input w-full sm:min-w-[180px] sm:w-auto"
              value={month || query.data?.selectedMonth || ""}
              onChange={(event) => setMonth(event.target.value)}
            >
              {(query.data?.availableMonths || []).map((entry) => (
                <option key={`net-worth-month-${entry}`} value={entry}>
                  {formatMonthKeyUK(entry)}
                </option>
              ))}
            </select>
          }
        >
          {query.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading...</p> : null}
          {query.error ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}

          {query.data?.planning ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="panel p-4">
                  <p className="label">Assets</p>
                  <p className="metric-value mt-2">{formatGBP(query.data.planning.netWorth.assets)}</p>
                </div>
                <div className="panel p-4">
                  <p className="label">Liabilities</p>
                  <p className="metric-value mt-2">{formatGBP(query.data.planning.netWorth.liabilities)}</p>
                </div>
                <div className="panel p-4">
                  <p className="label">Loaned Out (Recoverable)</p>
                  <p className="metric-value mt-2">{formatGBP(query.data.planning.netWorth.loanedOutRecoverable)}</p>
                </div>
                <div className="panel p-4">
                  <p className="label">Net Worth</p>
                  <p className="metric-value mt-2">{formatGBP(query.data.planning.netWorth.netWorth)}</p>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    MoM: {formatGBP(query.data.planning.netWorth.monthDelta)}
                  </p>
                </div>
              </div>

              <div className="panel p-4">
                <p className="label">Net Worth Timeline</p>
                <MeasuredChart className="mt-4 h-56 w-full min-w-0 sm:h-72" minHeight={220}>
                  {({ width, height }) => (
                    <AreaChart width={width} height={height} data={chartData}>
                      <XAxis dataKey="month" tick={{ fill: "#556273", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#556273", fontSize: 12 }} />
                      <Tooltip formatter={(value) => formatGBP(Number(value ?? 0))} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#0f7d6f"
                        fill="url(#netWorthFill)"
                        strokeWidth={2}
                      />
                      <defs>
                        <linearGradient id="netWorthFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#0f7d6f" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#25428f" stopOpacity={0.12} />
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  )}
                </MeasuredChart>
              </div>
            </div>
          ) : null}
        </SectionPanel>

        <SectionPanel
          title="Debt Payoff Planner"
          subtitle="Compare snowball and avalanche using your real card balances/APR/min rules."
        >
          {query.data?.planning ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="panel p-4">
                <p className="label">Snowball</p>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  Debt-free:{" "}
                  {query.data.planning.debtPayoff.byStrategy.snowball.monthsToDebtFree === null
                    ? "Not reached"
                    : `${query.data.planning.debtPayoff.byStrategy.snowball.monthsToDebtFree} months`}
                </p>
                <p className="text-sm text-[var(--ink-soft)]">
                  Interest: {formatGBP(query.data.planning.debtPayoff.byStrategy.snowball.totalInterest)}
                </p>
                <p className="mt-2 text-xs text-[var(--ink-soft)]">
                  Order: {query.data.planning.debtPayoff.byStrategy.snowball.payoffOrder.join(" -> ") || "N/A"}
                </p>
              </div>
              <div className="panel p-4">
                <p className="label">Avalanche</p>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  Debt-free:{" "}
                  {query.data.planning.debtPayoff.byStrategy.avalanche.monthsToDebtFree === null
                    ? "Not reached"
                    : `${query.data.planning.debtPayoff.byStrategy.avalanche.monthsToDebtFree} months`}
                </p>
                <p className="text-sm text-[var(--ink-soft)]">
                  Interest: {formatGBP(query.data.planning.debtPayoff.byStrategy.avalanche.totalInterest)}
                </p>
                <p className="mt-2 text-xs text-[var(--ink-soft)]">
                  Order: {query.data.planning.debtPayoff.byStrategy.avalanche.payoffOrder.join(" -> ") || "N/A"}
                </p>
              </div>
            </div>
          ) : null}
        </SectionPanel>

        <SectionPanel
          title="Savings Goals Projection"
          subtitle="Monthly contribution targets and projected completion month."
        >
          {query.data?.planning ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="panel p-3">
                  <p className="label">Monthly Target Total</p>
                  <p className="metric-value mt-2">{formatGBP(query.data.planning.savings.monthlyTargetTotal)}</p>
                </div>
                <div className="panel p-3">
                  <p className="label">After Savings</p>
                  <p className="metric-value mt-2">
                    {formatGBP(query.data.planning.savings.projectedMoneyLeftAfterSavings)}
                  </p>
                </div>
                <div className="panel p-3">
                  <p className="label">At-risk Goals</p>
                  <p className="metric-value mt-2">{query.data.planning.savings.atRiskGoalIds.length}</p>
                </div>
              </div>

              <div className="space-y-2">
                {query.data.planning.savings.goals.map((goal) => (
                  <div
                    key={`goal-projection-${goal.id}`}
                    className="rounded-xl border border-[var(--ring)] bg-white/75 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[var(--ink-main)]">{goal.name}</p>
                      <span className={`rounded-full px-2 py-1 text-xs ${statusClass(goal.status)}`}>
                        {goal.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {formatGBP(goal.currentAmount)} / {formatGBP(goal.targetAmount)} · Monthly{" "}
                      {formatGBP(goal.monthlyContribution)}
                    </p>
                    <p className="text-xs text-[var(--ink-soft)]">
                      Completion: {goal.projectedCompletionMonth ? formatMonthKeyUK(goal.projectedCompletionMonth) : "Not reached"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </SectionPanel>

        <SectionPanel title="Analytics (MoM)" subtitle="Month-over-month deltas and drift alerts.">
          {query.data?.planning ? (
            <div className="space-y-3">
              {query.data.planning.analytics.driftAlerts.length > 0 ? (
                <div className="space-y-2">
                  {query.data.planning.analytics.driftAlerts.map((alert) => (
                    <div
                      key={`net-worth-drift-${alert.key}`}
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
                <p className="text-sm text-[var(--ink-soft)]">No drift alerts at current thresholds.</p>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Current</th>
                      <th>Previous</th>
                      <th>Delta</th>
                      <th>Delta %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.planning.analytics.deltas.map((entry) => (
                      <tr key={`delta-${entry.key}`}>
                        <td>{entry.label}</td>
                        <td>{formatGBP(entry.currentValue)}</td>
                        <td>{formatGBP(entry.previousValue)}</td>
                        <td>{formatGBP(entry.delta)}</td>
                        <td>{entry.deltaPercent === null ? "N/A" : `${entry.deltaPercent.toFixed(1)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </SectionPanel>
      </div>
    </ProtectedPage>
  );
}
