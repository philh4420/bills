"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { computeCardMonthProjections } from "@/lib/formulas/engine";
import { formatGBP } from "@/lib/util/format";

interface CardData {
  cards: Array<{ id: string; name: string; limit: number; usedLimit: number; interestRateApr: number }>;
}

interface MonthlyList {
  payments: Array<{
    month: string;
    byCardId: Record<string, number>;
    total: number;
    formulaVariantId: string;
    formulaExpression: string | null;
    inferred: boolean;
  }>;
}

export default function CardsPage() {
  const { getIdToken } = useAuth();
  const [month, setMonth] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [cardDrafts, setCardDrafts] = useState<
    Record<string, { limit: number; usedLimit: number; interestRateApr: number }>
  >({});
  const [paymentDraft, setPaymentDraft] = useState<Record<string, number>>({});
  const [formulaVariantId, setFormulaVariantId] = useState("money-left-standard");

  const cardsQuery = useQuery({
    queryKey: ["cards"],
    queryFn: () => authedRequest<CardData>(getIdToken, "/api/cards")
  });

  const paymentsQuery = useQuery({
    queryKey: ["monthly-payments"],
    queryFn: () => authedRequest<MonthlyList>(getIdToken, "/api/monthly-payments")
  });

  const months = useMemo(
    () => (paymentsQuery.data?.payments || []).map((entry) => entry.month).sort((a, b) => a.localeCompare(b)),
    [paymentsQuery.data]
  );

  useEffect(() => {
    if (!month && months.length > 0) {
      setMonth(months[0]);
    }
  }, [month, months]);

  const activePayment = useMemo(
    () => (paymentsQuery.data?.payments || []).find((entry) => entry.month === month) || null,
    [paymentsQuery.data, month]
  );

  const projectionsByMonth = useMemo(() => {
    if (!cardsQuery.data?.cards || !paymentsQuery.data?.payments) {
      return new Map<string, ReturnType<typeof computeCardMonthProjections>[number]>();
    }

    const projections = computeCardMonthProjections(cardsQuery.data.cards, paymentsQuery.data.payments);
    return new Map(projections.map((projection) => [projection.month, projection]));
  }, [cardsQuery.data, paymentsQuery.data]);

  const activeProjection = month ? projectionsByMonth.get(month) || null : null;

  useEffect(() => {
    if (!cardsQuery.data?.cards) {
      return;
    }

    const next: Record<string, { limit: number; usedLimit: number; interestRateApr: number }> = {};
    cardsQuery.data.cards.forEach((card) => {
      next[card.id] = {
        limit: card.limit,
        usedLimit: card.usedLimit,
        interestRateApr: card.interestRateApr ?? 0
      };
    });
    setCardDrafts(next);
  }, [cardsQuery.data]);

  useEffect(() => {
    if (!activePayment) {
      return;
    }

    setPaymentDraft(activePayment.byCardId);
    setFormulaVariantId(activePayment.formulaVariantId);
  }, [activePayment]);

  async function saveCard(cardId: string) {
    setMessage(null);
    const draft = cardDrafts[cardId];
    if (!draft) {
      return;
    }

    await authedRequest(getIdToken, `/api/cards/${cardId}`, {
      method: "PATCH",
      body: JSON.stringify(draft)
    });

    setMessage(`Saved card ${cardId}`);
    await Promise.all([cardsQuery.refetch(), paymentsQuery.refetch()]);
  }

  async function saveMonthly() {
    if (!month) {
      return;
    }

    setMessage(null);
    await authedRequest(getIdToken, `/api/monthly-payments/${month}`, {
      method: "PUT",
      body: JSON.stringify({
        byCardId: paymentDraft,
        formulaVariantId,
        formulaExpression: null,
        inferred: activePayment?.inferred ?? false
      })
    });

    setMessage(`Saved monthly payments for ${month}`);
    await paymentsQuery.refetch();
  }

  return (
    <ProtectedPage title="Cards & Monthly Payments">
      <div className="space-y-4">
        <SectionPanel
          title="Card limits"
          subtitle="Update limits, used balances, and APR. Interest and projected balances recalculate per selected month."
        >
          {cardsQuery.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading cards...</p> : null}
          {cardsQuery.error ? <p className="text-sm text-red-700">{(cardsQuery.error as Error).message}</p> : null}

          <div className="space-y-3 md:hidden">
            {(cardsQuery.data?.cards || []).map((card) => {
              const draft = cardDrafts[card.id] || {
                limit: card.limit,
                usedLimit: card.usedLimit,
                interestRateApr: card.interestRateApr ?? 0
              };
              const available = draft.limit - draft.usedLimit;
              const projection = activeProjection?.entries[card.id];

              return (
                <div className="panel p-4" key={`mobile-${card.id}`}>
                  <p className="text-sm font-semibold text-[var(--ink-main)]">{card.name}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="label">Limit</p>
                      <input
                        className="input mt-1"
                        type="number"
                        step="0.01"
                        value={draft.limit}
                        onChange={(event) =>
                          setCardDrafts((prev) => ({
                            ...prev,
                            [card.id]: { ...draft, limit: Number(event.target.value) }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <p className="label">Used</p>
                      <input
                        className="input mt-1"
                        type="number"
                        step="0.01"
                        value={draft.usedLimit}
                        onChange={(event) =>
                          setCardDrafts((prev) => ({
                            ...prev,
                            [card.id]: { ...draft, usedLimit: Number(event.target.value) }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <p className="label">APR %</p>
                      <input
                        className="input mt-1"
                        type="number"
                        step="0.01"
                        value={draft.interestRateApr}
                        onChange={(event) =>
                          setCardDrafts((prev) => ({
                            ...prev,
                            [card.id]: { ...draft, interestRateApr: Number(event.target.value) }
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-sm text-[var(--ink-soft)]">
                      <p>Available: {formatGBP(available)}</p>
                      <p>Interest ({month || "month"}): {formatGBP(projection?.interestAdded ?? 0)}</p>
                      <p>Projected used: {formatGBP(projection?.closingBalance ?? draft.usedLimit)}</p>
                    </div>
                  </div>
                  <button className="button-secondary mt-3 w-full" type="button" onClick={() => saveCard(card.id)}>
                    Save {card.name}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="table-wrap hidden md:block">
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Limit</th>
                  <th>Used</th>
                  <th>APR %</th>
                  <th>Available</th>
                  <th>Interest ({month || "month"})</th>
                  <th>Projected Used ({month || "month"})</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(cardsQuery.data?.cards || []).map((card) => {
                  const draft = cardDrafts[card.id] || {
                    limit: card.limit,
                    usedLimit: card.usedLimit,
                    interestRateApr: card.interestRateApr ?? 0
                  };
                  const available = draft.limit - draft.usedLimit;
                  const projection = activeProjection?.entries[card.id];
                  return (
                    <tr key={card.id}>
                      <td>{card.name}</td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          step="0.01"
                          value={draft.limit}
                          onChange={(event) =>
                            setCardDrafts((prev) => ({
                              ...prev,
                              [card.id]: { ...draft, limit: Number(event.target.value) }
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          step="0.01"
                          value={draft.usedLimit}
                          onChange={(event) =>
                            setCardDrafts((prev) => ({
                              ...prev,
                              [card.id]: { ...draft, usedLimit: Number(event.target.value) }
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          step="0.01"
                          value={draft.interestRateApr}
                          onChange={(event) =>
                            setCardDrafts((prev) => ({
                              ...prev,
                              [card.id]: { ...draft, interestRateApr: Number(event.target.value) }
                            }))
                          }
                        />
                      </td>
                      <td>{formatGBP(available)}</td>
                      <td>{formatGBP(projection?.interestAdded ?? 0)}</td>
                      <td>{formatGBP(projection?.closingBalance ?? draft.usedLimit)}</td>
                      <td>
                        <button className="button-secondary" type="button" onClick={() => saveCard(card.id)}>
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionPanel>

        <SectionPanel
          title="Monthly payment plan"
          subtitle="Edit per-card payment amounts for a month and preserve formula variant parity."
          right={
            <select
              className="input w-full sm:min-w-[140px] sm:w-auto"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              {months.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          }
        >
          {activePayment ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {(cardsQuery.data?.cards || []).map((card) => (
                  <div className="panel p-4" key={card.id}>
                    <p className="label">{card.name}</p>
                    <input
                      className="input mt-2"
                      type="number"
                      step="0.01"
                      value={paymentDraft[card.id] ?? 0}
                      onChange={(event) =>
                        setPaymentDraft((prev) => ({
                          ...prev,
                          [card.id]: Number(event.target.value)
                        }))
                      }
                    />
                    <p className="mt-2 text-xs text-[var(--ink-soft)]">
                      Interest: {formatGBP(activeProjection?.entries[card.id]?.interestAdded ?? 0)}
                    </p>
                    <p className="text-xs text-[var(--ink-soft)]">
                      Closing balance: {formatGBP(activeProjection?.entries[card.id]?.closingBalance ?? 0)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
                <label className="label" htmlFor="formulaVariant">
                  Formula variant
                </label>
                <select
                  id="formulaVariant"
                  className="input w-full sm:max-w-xs"
                  value={formulaVariantId}
                  onChange={(event) => setFormulaVariantId(event.target.value)}
                >
                  <option value="money-left-standard">money-left-standard</option>
                  <option value="money-left-may-quirk">money-left-may-quirk</option>
                </select>

                <button className="button-primary w-full sm:w-auto" type="button" onClick={() => saveMonthly()}>
                  Save month
                </button>

                <p className="text-sm text-[var(--ink-soft)] lg:ml-auto">Total: {formatGBP(activePayment.total)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">No monthly payment records available yet.</p>
          )}
        </SectionPanel>

        {message ? <p className="text-sm text-[var(--accent-strong)]">{message}</p> : null}
      </div>
    </ProtectedPage>
  );
}
