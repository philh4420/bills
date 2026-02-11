"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { formatGBP } from "@/lib/util/format";

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
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="label">{label}</p>
      <p className="metric-value mt-2">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { getIdToken } = useAuth();
  const [month, setMonth] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard", month],
    queryFn: () =>
      authedRequest<DashboardData>(
        getIdToken,
        `/api/dashboard${month ? `?month=${encodeURIComponent(month)}` : ""}`
      )
  });

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

  return (
    <ProtectedPage title="Dashboard">
      <div className="space-y-4">
        <SectionPanel
          title="Monthly overview"
          subtitle="Live totals based on cards, bills, and formula-variant parity."
          right={
            <div className="flex items-center gap-2">
              <select
                className="input min-w-[140px]"
                value={month || data?.selectedMonth || ""}
                onChange={(event) => setMonth(event.target.value || null)}
              >
                <option value="">Latest</option>
                {(data?.availableMonths || []).map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
              <button type="button" className="button-secondary" onClick={() => refetch()}>
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
                <p className="label">Cashflow shape ({data.snapshot.month})</p>
                <div className="mt-4 h-72">
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
                {data.snapshot.cardSpendTotal === 0 ? (
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    No card payments due for this month.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            !isLoading && <p className="text-sm text-[var(--ink-soft)]">No snapshot data yet. Import workbook first.</p>
          )}
        </SectionPanel>
      </div>
    </ProtectedPage>
  );
}
