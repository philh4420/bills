"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest, formatApiClientError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { formatGBP, formatMonthKeyUK } from "@/lib/util/format";

interface DashboardMonthData {
  selectedMonth: string;
  availableMonths: string[];
  snapshot: { moneyInBank: number } | null;
  monthClosure: {
    month: string;
    closed: boolean;
    reason?: string;
  } | null;
  reconciliation: {
    month: string;
    expectedBalance: number;
    actualBalance: number;
    variance: number;
    status: "matched" | "variance";
    notes?: string;
  } | null;
}

interface LedgerListData {
  entries: Array<{
    id: string;
    date: string;
    title: string;
    category: string;
    amount: number;
    status: "planned" | "posted" | "paid";
  }>;
}

export default function ReconciliationPage() {
  const { getIdToken } = useAuth();
  const [month, setMonth] = useState<string>("");
  const [statusDraft, setStatusDraft] = useState<Record<string, "planned" | "posted" | "paid">>({});
  const [actualBalance, setActualBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ["reconciliation-dashboard", month],
    queryFn: () =>
      authedRequest<DashboardMonthData>(
        getIdToken,
        `/api/dashboard${month ? `?month=${encodeURIComponent(month)}` : ""}`
      )
  });

  const activeMonth = month || dashboardQuery.data?.selectedMonth || "";
  const ledgerQuery = useQuery({
    queryKey: ["ledger", activeMonth],
    queryFn: () =>
      authedRequest<LedgerListData>(
        getIdToken,
        `/api/ledger${activeMonth ? `?month=${encodeURIComponent(activeMonth)}` : ""}`
      ),
    enabled: Boolean(activeMonth)
  });

  useEffect(() => {
    if (!month && dashboardQuery.data?.selectedMonth) {
      setMonth(dashboardQuery.data.selectedMonth);
    }
  }, [month, dashboardQuery.data?.selectedMonth]);

  useEffect(() => {
    const expected = dashboardQuery.data?.snapshot?.moneyInBank ?? 0;
    const actual = dashboardQuery.data?.reconciliation?.actualBalance ?? expected;
    setActualBalance(String(actual));
    setNotes(dashboardQuery.data?.reconciliation?.notes || "");
    setClosureReason(dashboardQuery.data?.monthClosure?.reason || "");
  }, [
    dashboardQuery.data?.selectedMonth,
    dashboardQuery.data?.snapshot?.moneyInBank,
    dashboardQuery.data?.reconciliation?.actualBalance,
    dashboardQuery.data?.reconciliation?.notes,
    dashboardQuery.data?.monthClosure?.reason
  ]);

  useEffect(() => {
    const entries = ledgerQuery.data?.entries || [];
    setStatusDraft(
      Object.fromEntries(entries.map((entry) => [entry.id, entry.status]))
    );
  }, [ledgerQuery.data?.entries]);

  const totals = useMemo(() => {
    const entries = ledgerQuery.data?.entries || [];
    return entries.reduce(
      (acc, entry) => {
        if (entry.status === "planned") {
          acc.planned += entry.amount;
        } else if (entry.status === "posted") {
          acc.posted += entry.amount;
        } else {
          acc.paid += entry.amount;
        }
        return acc;
      },
      { planned: 0, posted: 0, paid: 0 }
    );
  }, [ledgerQuery.data?.entries]);

  async function saveEntryStatus(id: string) {
    const status = statusDraft[id];
    if (!status) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/ledger/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setMessage("Ledger status updated.");
      await Promise.all([ledgerQuery.refetch(), dashboardQuery.refetch()]);
    } catch (error) {
      setMessage(formatApiClientError(error, "Failed to update ledger status."));
    } finally {
      setBusy(false);
    }
  }

  async function saveReconciliation() {
    if (!activeMonth) {
      return;
    }

    const parsedActual = Number.parseFloat(actualBalance);
    if (!Number.isFinite(parsedActual)) {
      setMessage("Actual balance must be a valid number.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/reconciliations/${activeMonth}`, {
        method: "PUT",
        body: JSON.stringify({
          actualBalance: parsedActual,
          notes: notes.trim() || undefined
        })
      });
      setMessage("Reconciliation saved.");
      await dashboardQuery.refetch();
    } catch (error) {
      setMessage(formatApiClientError(error, "Failed to save reconciliation."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleMonthLock() {
    if (!activeMonth) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/month-closures/${activeMonth}`, {
        method: "PUT",
        body: JSON.stringify({
          closed: !dashboardQuery.data?.monthClosure?.closed,
          reason: closureReason.trim() || undefined
        })
      });
      setMessage(dashboardQuery.data?.monthClosure?.closed ? "Month reopened." : "Month closed.");
      await dashboardQuery.refetch();
    } catch (error) {
      setMessage(formatApiClientError(error, "Failed to update month lock."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedPage title="Reconciliation">
      <div className="space-y-4">
        <SectionPanel
          title="Month controls"
          subtitle="Choose month, reconcile expected vs actual, and lock month edits."
          right={
            <select
              className="input w-full sm:min-w-[160px] sm:w-auto"
              value={activeMonth}
              onChange={(event) => setMonth(event.target.value)}
            >
              {(dashboardQuery.data?.availableMonths || []).map((entry) => (
                <option key={entry} value={entry}>
                  {formatMonthKeyUK(entry)}
                </option>
              ))}
            </select>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="panel p-3">
              <p className="label">Expected balance</p>
              <p className="mt-1 text-sm font-medium text-[var(--ink-main)]">
                {formatGBP(dashboardQuery.data?.snapshot?.moneyInBank || 0)}
              </p>
              <label className="mt-3 block">
                <span className="label">Actual balance</span>
                <input
                  className="input mt-1"
                  type="number"
                  step="0.01"
                  value={actualBalance}
                  onChange={(event) => setActualBalance(event.target.value)}
                />
              </label>
              <label className="mt-3 block">
                <span className="label">Notes</span>
                <textarea
                  className="input mt-1 min-h-[96px]"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <button className="button-primary mt-3" type="button" onClick={() => saveReconciliation()} disabled={busy}>
                Save reconciliation
              </button>
              {dashboardQuery.data?.reconciliation ? (
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  Variance: {formatGBP(dashboardQuery.data.reconciliation.variance)} (
                  {dashboardQuery.data.reconciliation.status})
                </p>
              ) : null}
            </div>

            <div className="panel p-3">
              <p className="label">Month lock</p>
              <p className="mt-1 text-sm text-[var(--ink-main)]">
                {dashboardQuery.data?.monthClosure?.closed ? "Closed" : "Open"}
              </p>
              <label className="mt-3 block">
                <span className="label">Reason</span>
                <input
                  className="input mt-1"
                  value={closureReason}
                  onChange={(event) => setClosureReason(event.target.value)}
                />
              </label>
              <button className="button-secondary mt-3" type="button" onClick={() => toggleMonthLock()} disabled={busy}>
                {dashboardQuery.data?.monthClosure?.closed ? "Reopen month" : "Close month"}
              </button>
            </div>
          </div>
          {message ? <p className="mt-3 text-sm text-[var(--accent-strong)]">{message}</p> : null}
        </SectionPanel>

        <SectionPanel
          title="Ledger entries"
          subtitle="Mark entries as planned, posted, or paid to reflect real movement."
          right={
            <p className="text-sm text-[var(--ink-soft)]">
              Planned {formatGBP(totals.planned)} · Posted {formatGBP(totals.posted)} · Paid {formatGBP(totals.paid)}
            </p>
          }
        >
          {ledgerQuery.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading ledger...</p> : null}
          {ledgerQuery.error ? <p className="text-sm text-red-700">{(ledgerQuery.error as Error).message}</p> : null}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(ledgerQuery.data?.entries || []).map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.date}</td>
                    <td>{entry.title}</td>
                    <td>{entry.category}</td>
                    <td>{formatGBP(entry.amount)}</td>
                    <td>
                      <select
                        className="input"
                        value={statusDraft[entry.id] || entry.status}
                        onChange={(event) =>
                          setStatusDraft((prev) => ({
                            ...prev,
                            [entry.id]: event.target.value as "planned" | "posted" | "paid"
                          }))
                        }
                      >
                        <option value="planned">planned</option>
                        <option value="posted">posted</option>
                        <option value="paid">paid</option>
                      </select>
                    </td>
                    <td>
                      <button className="button-secondary" type="button" onClick={() => saveEntryStatus(entry.id)} disabled={busy}>
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      </div>
    </ProtectedPage>
  );
}
