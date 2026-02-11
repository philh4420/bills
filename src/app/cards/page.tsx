"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { computeUpcomingDueDate, formatDueDateLabel } from "@/lib/cards/due-date";
import { computeCardMonthProjections } from "@/lib/formulas/engine";
import { formatGBP } from "@/lib/util/format";

interface CardData {
  cards: Array<{
    id: string;
    name: string;
    limit: number;
    usedLimit: number;
    interestRateApr: number;
    dueDayOfMonth?: number | null;
  }>;
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

interface VapidPublicKeyResponse {
  publicKey: string;
}

type DueTone = "neutral" | "ok" | "warn" | "danger";

const DUE_DAY_OPTIONS = Array.from({ length: 31 }, (_, idx) => idx + 1);

function parseDueDayInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return Math.max(1, Math.min(31, parsed));
}

function dueToneClass(tone: DueTone): string {
  if (tone === "danger") {
    return "border border-red-200 bg-red-50 text-red-800";
  }
  if (tone === "warn") {
    return "border border-amber-200 bg-amber-50 text-amber-800";
  }
  if (tone === "ok") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  return "border border-[var(--ring)] bg-white/80 text-[var(--ink-soft)]";
}

function getDueMeta(dueDayOfMonth?: number | null): {
  statusLabel: string;
  detailLabel: string;
  tone: DueTone;
} {
  if (!dueDayOfMonth || dueDayOfMonth < 1) {
    return {
      statusLabel: "Not set",
      detailLabel: "Set a due day to enable reminders.",
      tone: "neutral"
    };
  }

  const due = computeUpcomingDueDate(dueDayOfMonth);
  const dateLabel = formatDueDateLabel(due.isoDate);

  if (due.daysUntil === 0) {
    return {
      statusLabel: "Due today",
      detailLabel: dateLabel,
      tone: "danger"
    };
  }

  if (due.daysUntil === 1) {
    return {
      statusLabel: "Due tomorrow",
      detailLabel: dateLabel,
      tone: "warn"
    };
  }

  if (due.daysUntil <= 7) {
    return {
      statusLabel: `Due in ${due.daysUntil} days`,
      detailLabel: dateLabel,
      tone: "warn"
    };
  }

  return {
    statusLabel: `Due in ${due.daysUntil} days`,
    detailLabel: dateLabel,
    tone: "ok"
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export default function CardsPage() {
  const { getIdToken } = useAuth();
  const [month, setMonth] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [cardDrafts, setCardDrafts] = useState<
    Record<string, { limit: number; usedLimit: number; interestRateApr: number; dueDayOfMonth: number | null }>
  >({});
  const [paymentDraft, setPaymentDraft] = useState<Record<string, number>>({});
  const [formulaVariantId, setFormulaVariantId] = useState("money-left-standard");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<string>("default");

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

    const next: Record<
      string,
      { limit: number; usedLimit: number; interestRateApr: number; dueDayOfMonth: number | null }
    > = {};
    cardsQuery.data.cards.forEach((card) => {
      next[card.id] = {
        limit: card.limit,
        usedLimit: card.usedLimit,
        interestRateApr: card.interestRateApr ?? 0,
        dueDayOfMonth: card.dueDayOfMonth ?? null
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(supported);

    if (!supported) {
      return;
    }

    setNotificationPermission(Notification.permission);

    void (async () => {
      const registration =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      const subscription = await registration.pushManager.getSubscription();
      setPushSubscribed(Boolean(subscription));
    })();
  }, []);

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

    const cardName = cardsQuery.data?.cards.find((entry) => entry.id === cardId)?.name || cardId;
    setMessage(`Saved ${cardName}`);
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

  async function enablePushReminders() {
    if (!pushSupported || typeof window === "undefined") {
      setPushMessage("Push notifications are not supported on this device/browser.");
      return;
    }

    setPushBusy(true);
    setPushMessage(null);

    try {
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      setNotificationPermission(permission);

      if (permission !== "granted") {
        setPushSubscribed(false);
        setPushMessage("Notification permission was not granted.");
        return;
      }

      const registration =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const vapid = await authedRequest<VapidPublicKeyResponse>(
          getIdToken,
          "/api/notifications/vapid-public-key"
        );
        const vapidKey = urlBase64ToUint8Array(vapid.publicKey);
        const applicationServerKey = vapidKey.buffer.slice(
          vapidKey.byteOffset,
          vapidKey.byteOffset + vapidKey.byteLength
        ) as ArrayBuffer;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.auth || !serialized.keys?.p256dh) {
        throw new Error("Push subscription response is missing endpoint/keys.");
      }

      await authedRequest(getIdToken, "/api/notifications/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          subscription: {
            endpoint: serialized.endpoint,
            expirationTime: serialized.expirationTime ?? null,
            keys: {
              auth: serialized.keys.auth,
              p256dh: serialized.keys.p256dh
            }
          },
          userAgent: navigator.userAgent
        })
      });

      setPushSubscribed(true);
      setPushMessage("Push reminders enabled.");
    } catch (error) {
      setPushSubscribed(false);
      setPushMessage(error instanceof Error ? error.message : "Failed to enable push reminders.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePushReminders() {
    if (!pushSupported || typeof window === "undefined") {
      return;
    }

    setPushBusy(true);
    setPushMessage(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;

      if (subscription) {
        await authedRequest(getIdToken, "/api/notifications/subscriptions", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
      }

      setPushSubscribed(false);
      setPushMessage("Push reminders disabled.");
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Failed to disable push reminders.");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <ProtectedPage title="Cards & Monthly Payments">
      <div className="space-y-4">
        <SectionPanel
          title="Card limits"
          subtitle="Update limits, used balances, APR, and due dates. Interest and projected balances recalculate per selected month."
        >
          {cardsQuery.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading cards...</p> : null}
          {cardsQuery.error ? <p className="text-sm text-red-700">{(cardsQuery.error as Error).message}</p> : null}

          <div className="space-y-3 md:hidden">
            {(cardsQuery.data?.cards || []).map((card) => {
              const draft = cardDrafts[card.id] || {
                limit: card.limit,
                usedLimit: card.usedLimit,
                interestRateApr: card.interestRateApr ?? 0,
                dueDayOfMonth: card.dueDayOfMonth ?? null
              };
              const available = draft.limit - draft.usedLimit;
              const projection = activeProjection?.entries[card.id];
              const dueMeta = getDueMeta(draft.dueDayOfMonth);

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
                    <div>
                      <p className="label">Due day (1-31)</p>
                      <select
                        className="input mt-1"
                        value={draft.dueDayOfMonth ? String(draft.dueDayOfMonth) : ""}
                        onChange={(event) =>
                          setCardDrafts((prev) => ({
                            ...prev,
                            [card.id]: {
                              ...draft,
                              dueDayOfMonth: parseDueDayInput(event.target.value)
                            }
                          }))
                        }
                      >
                        <option value="">Not set</option>
                        {DUE_DAY_OPTIONS.map((day) => (
                          <option key={`${card.id}-due-${day}`} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-sm text-[var(--ink-soft)] sm:col-span-2">
                      <p>Available: {formatGBP(available)}</p>
                      <p>Interest ({month || "month"}): {formatGBP(projection?.interestAdded ?? 0)}</p>
                      <p>Projected used: {formatGBP(projection?.closingBalance ?? draft.usedLimit)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${dueToneClass(dueMeta.tone)}`}>
                          {dueMeta.statusLabel}
                        </span>
                        <span className="text-xs text-[var(--ink-soft)]">{dueMeta.detailLabel}</span>
                      </div>
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
                  <th className="min-w-[108px]">Due Day</th>
                  <th className="min-w-[190px]">Next Due</th>
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
                    interestRateApr: card.interestRateApr ?? 0,
                    dueDayOfMonth: card.dueDayOfMonth ?? null
                  };
                  const available = draft.limit - draft.usedLimit;
                  const projection = activeProjection?.entries[card.id];
                  const dueMeta = getDueMeta(draft.dueDayOfMonth);
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
                      <td>
                        <select
                          className="input min-w-[96px]"
                          value={draft.dueDayOfMonth ? String(draft.dueDayOfMonth) : ""}
                          onChange={(event) =>
                            setCardDrafts((prev) => ({
                              ...prev,
                              [card.id]: {
                                ...draft,
                                dueDayOfMonth: parseDueDayInput(event.target.value)
                              }
                            }))
                          }
                        >
                          <option value="">Not set</option>
                          {DUE_DAY_OPTIONS.map((day) => (
                            <option key={`${card.id}-desktop-due-${day}`} value={day}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="space-y-1">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${dueToneClass(dueMeta.tone)}`}
                          >
                            {dueMeta.statusLabel}
                          </span>
                          <p className="text-xs text-[var(--ink-soft)]">{dueMeta.detailLabel}</p>
                        </div>
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
          title="Push reminders"
          subtitle="Enable browser push notifications for card due date reminders. On iOS, install the app to Home Screen first."
        >
          <div className="panel p-4">
            <p className="text-sm text-[var(--ink-soft)]">
              Status:{" "}
              <span className="font-medium text-[var(--ink-main)]">
                {!pushSupported
                  ? "Unsupported on this browser"
                  : pushSubscribed
                    ? "Enabled"
                    : "Not enabled"}
              </span>
            </p>
            <p className="mt-2 text-xs text-[var(--ink-soft)]">
              Permission: <span className="font-medium text-[var(--ink-main)]">{notificationPermission}</span>
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                className="button-primary w-full sm:w-auto"
                type="button"
                onClick={() => enablePushReminders()}
                disabled={pushBusy || !pushSupported}
              >
                {pushBusy ? "Working..." : "Enable push reminders"}
              </button>
              <button
                className="button-secondary w-full sm:w-auto"
                type="button"
                onClick={() => disablePushReminders()}
                disabled={pushBusy || !pushSubscribed}
              >
                Disable push
              </button>
            </div>
            {pushMessage ? <p className="mt-3 text-sm text-[var(--accent-strong)]">{pushMessage}</p> : null}
            <p className="mt-2 text-xs text-[var(--ink-soft)]">
              Reminders are sent daily from Vercel Cron for cards due in 7 days, 1 day, and today.
            </p>
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
