"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MobileEditDrawer } from "@/components/mobile-edit-drawer";
import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest, formatApiClientError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { computeUpcomingDueDate, formatDueDateLabel } from "@/lib/cards/due-date";
import { computeCardMonthProjections } from "@/lib/formulas/engine";
import { monthKeyInTimeZone } from "@/lib/util/dates";
import { formatGBP, formatMonthKeyUK } from "@/lib/util/format";

interface CardData {
  cards: Array<{
    id: string;
    name: string;
    limit: number;
    usedLimit: number;
    interestRateApr: number;
    dueDayOfMonth?: number | null;
    statementDay?: number | null;
    minimumPaymentRule?: {
      type: "fixed" | "percent";
      value: number;
    } | null;
    interestFreeDays?: number | null;
    lateFeeRule?: {
      type: "fixed";
      value: number;
    } | null;
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

interface PushTestResponse {
  ok: boolean;
  targeted?: number;
  sent: number;
  failed: number;
  deleted: number;
  details?: Array<{ endpoint: string; statusCode: number | null; message: string }>;
}

interface PushDiagnosticsResponse {
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    stale: number;
    autoCleaned: number;
  };
  subscriptions: Array<{
    id: string;
    endpoint: string;
    endpointSuffix: string;
    endpointHealth: "healthy" | "degraded" | "stale";
    failureCount: number;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
    updatedAt: string;
    userAgent: string | null;
  }>;
}

interface PushRepairResponse {
  ok: boolean;
  targeted: number;
  repaired: number;
  removedStale: number;
  message?: string;
}

interface SmartAlertDispatchResponse {
  ok: boolean;
  sent: number;
  failed: number;
  deleted: number;
  reason?: string;
}

type CardRecord = CardData["cards"][number];
type MinimumPaymentRule = NonNullable<CardRecord["minimumPaymentRule"]>;
type LateFeeRule = NonNullable<CardRecord["lateFeeRule"]>;
type CardDraft = {
  limit: number;
  usedLimit: number;
  interestRateApr: number;
  dueDayOfMonth: number | null;
  statementDay: number | null;
  minimumPaymentRule: MinimumPaymentRule | null;
  interestFreeDays: number | null;
  lateFeeRule: LateFeeRule | null;
};

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

function parseOptionalIntegerInput(value: string, min: number, max: number): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  return Math.max(min, Math.min(max, parsed));
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

function formatMinimumPaymentRule(rule: MinimumPaymentRule | null): string {
  if (!rule) {
    return "Not set";
  }
  if (rule.type === "percent") {
    return `${rule.value.toFixed(2)}%`;
  }
  return formatGBP(rule.value);
}

function diagnosticsHealthChipClass(health: "healthy" | "degraded" | "stale"): string {
  if (health === "degraded") {
    return "border border-amber-200 bg-amber-50 text-amber-800";
  }
  if (health === "stale") {
    return "border border-red-200 bg-red-50 text-red-700";
  }
  return "border border-emerald-200 bg-emerald-50 text-emerald-800";
}

function formatDiagnosticTimestamp(value: string | null): string {
  if (!value) {
    return "Never";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Never";
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
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

function isLikelyAppleMobileDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform || "";
  return /iphone|ipad|ipod/.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return mediaStandalone || iosStandalone;
}

export default function CardsPage() {
  const { getIdToken } = useAuth();
  const getIdTokenRef = useRef(getIdToken);
  const [month, setMonth] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [cardDrafts, setCardDrafts] = useState<Record<string, CardDraft>>({});
  const [paymentDraft, setPaymentDraft] = useState<Record<string, number>>({});
  const [formulaVariantId, setFormulaVariantId] = useState("money-left-standard");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [serverSubscriptionCount, setServerSubscriptionCount] = useState(0);
  const [pushDiagnostics, setPushDiagnostics] = useState<PushDiagnosticsResponse["subscriptions"]>([]);
  const [pushDiagnosticsSummary, setPushDiagnosticsSummary] = useState<PushDiagnosticsResponse["summary"]>({
    total: 0,
    healthy: 0,
    degraded: 0,
    stale: 0,
    autoCleaned: 0
  });
  const [currentPushEndpoint, setCurrentPushEndpoint] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<string>("default");
  const [isInstalledApp, setIsInstalledApp] = useState(false);
  const [isAppleMobileDevice, setIsAppleMobileDevice] = useState(false);
  const [mobileCardEditId, setMobileCardEditId] = useState<string | null>(null);

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
      const currentMonth = monthKeyInTimeZone();
      setMonth(months.includes(currentMonth) ? currentMonth : months[0]);
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
  const selectedMonthLabel = month ? formatMonthKeyUK(month) : "selected month";

  useEffect(() => {
    if (!cardsQuery.data?.cards) {
      return;
    }

    const next: Record<string, CardDraft> = {};
    cardsQuery.data.cards.forEach((card) => {
      next[card.id] = {
        limit: card.limit,
        usedLimit: card.usedLimit,
        interestRateApr: card.interestRateApr ?? 0,
        dueDayOfMonth: card.dueDayOfMonth ?? null,
        statementDay: card.statementDay ?? null,
        minimumPaymentRule: card.minimumPaymentRule ?? null,
        interestFreeDays: card.interestFreeDays ?? null,
        lateFeeRule: card.lateFeeRule ?? null
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
    getIdTokenRef.current = getIdToken;
  }, [getIdToken]);

  const refreshPushDiagnostics = useCallback(async (getToken: () => Promise<string | null>) => {
    try {
      const diagnostics = await authedRequest<PushDiagnosticsResponse>(
        getToken,
        "/api/notifications/diagnostics"
      );
      setPushDiagnostics(diagnostics.subscriptions);
      setPushDiagnosticsSummary(diagnostics.summary);
      setServerSubscriptionCount(diagnostics.summary.total);
    } catch {
      setPushDiagnostics([]);
      setPushDiagnosticsSummary({
        total: 0,
        healthy: 0,
        degraded: 0,
        stale: 0,
        autoCleaned: 0
      });
      setServerSubscriptionCount(0);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setIsAppleMobileDevice(isLikelyAppleMobileDevice());
    setIsInstalledApp(isStandaloneDisplayMode());

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const updateStandalone = () => {
      setIsInstalledApp(isStandaloneDisplayMode());
    };

    updateStandalone();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateStandalone);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(updateStandalone);
    }

    window.addEventListener("focus", updateStandalone);
    document.addEventListener("visibilitychange", updateStandalone);

    const cleanup = () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", updateStandalone);
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(updateStandalone);
      }

      window.removeEventListener("focus", updateStandalone);
      document.removeEventListener("visibilitychange", updateStandalone);
    };

    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(supported);

    if (!supported) {
      void refreshPushDiagnostics(getIdTokenRef.current);
      return cleanup;
    }

    setNotificationPermission(Notification.permission);

    void (async () => {
      const registration =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      const subscription = await registration.pushManager.getSubscription();
      setPushSubscribed(Boolean(subscription));
      setCurrentPushEndpoint(subscription?.endpoint ?? null);
      await refreshPushDiagnostics(getIdTokenRef.current);
    })();

    return cleanup;
  }, [refreshPushDiagnostics]);

  async function refreshPushStateFromDeviceAndServer() {
    if (typeof window === "undefined") {
      return;
    }

    if (pushSupported) {
      const registration =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      const subscription = await registration.pushManager.getSubscription();
      setPushSubscribed(Boolean(subscription));
      setCurrentPushEndpoint(subscription?.endpoint ?? null);
    }

    await refreshPushDiagnostics(getIdToken);
  }

  async function saveCard(cardId: string) {
    setMessage(null);
    const draft = cardDrafts[cardId];
    if (!draft) {
      return;
    }

    if (
      !Number.isFinite(draft.limit) ||
      !Number.isFinite(draft.usedLimit) ||
      !Number.isFinite(draft.interestRateApr)
    ) {
      setMessage("Card values must be valid numbers.");
      return;
    }

    const minimumPaymentRule =
      draft.minimumPaymentRule &&
      Number.isFinite(draft.minimumPaymentRule.value) &&
      draft.minimumPaymentRule.value > 0
        ? {
            type: draft.minimumPaymentRule.type,
            value: draft.minimumPaymentRule.value
          }
        : null;

    const lateFeeRule =
      draft.lateFeeRule && Number.isFinite(draft.lateFeeRule.value) && draft.lateFeeRule.value >= 0
        ? {
            type: "fixed" as const,
            value: draft.lateFeeRule.value
          }
        : null;

    try {
      await authedRequest(getIdToken, `/api/cards/${cardId}`, {
        method: "PATCH",
        body: JSON.stringify({
          limit: draft.limit,
          usedLimit: draft.usedLimit,
          interestRateApr: draft.interestRateApr,
          dueDayOfMonth: draft.dueDayOfMonth ?? null,
          statementDay: draft.statementDay ?? null,
          minimumPaymentRule,
          interestFreeDays: draft.interestFreeDays ?? null,
          lateFeeRule
        })
      });

      const cardName = cardsQuery.data?.cards.find((entry) => entry.id === cardId)?.name || cardId;
      setMessage(`Saved ${cardName}`);
      await Promise.all([cardsQuery.refetch(), paymentsQuery.refetch()]);
    } catch (error) {
      setMessage(formatApiClientError(error, "Failed to save card"));
    }
  }

  async function saveMonthly() {
    if (!month) {
      return;
    }

    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/monthly-payments/${month}`, {
        method: "PUT",
        body: JSON.stringify({
          byCardId: paymentDraft,
          formulaVariantId,
          formulaExpression: null,
          inferred: activePayment?.inferred ?? false
        })
      });

      setMessage(`Saved monthly payments for ${selectedMonthLabel}`);
      await paymentsQuery.refetch();
    } catch (error) {
      setMessage(formatApiClientError(error, "Failed to save monthly payments"));
    }
  }

  async function enablePushReminders() {
    if (!pushSupported || typeof window === "undefined") {
      setPushMessage("Push notifications are not supported on this device/browser.");
      return;
    }

    if (isAppleMobileDevice && !isInstalledApp) {
      setPushMessage(
        "Install to Home Screen first, open the installed app, then enable push reminders."
      );
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

      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        const endpoint = existingSubscription.endpoint;
        try {
          await existingSubscription.unsubscribe();
        } catch {
          // Continue and try to replace the subscription anyway.
        }
        try {
          await authedRequest(getIdToken, "/api/notifications/subscriptions", {
            method: "DELETE",
            body: JSON.stringify({ endpoint })
          });
        } catch {
          // Stale endpoint cleanup should not block re-subscribe.
        }
      }

      const vapid = await authedRequest<VapidPublicKeyResponse>(
        getIdToken,
        "/api/notifications/vapid-public-key"
      );
      const vapidKey = urlBase64ToUint8Array(vapid.publicKey);
      const applicationServerKey = vapidKey.buffer.slice(
        vapidKey.byteOffset,
        vapidKey.byteOffset + vapidKey.byteLength
      ) as ArrayBuffer;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

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
      await refreshPushStateFromDeviceAndServer();
    } catch (error) {
      setPushSubscribed(false);
      setPushMessage(formatApiClientError(error, "Failed to enable push reminders."));
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
      await refreshPushStateFromDeviceAndServer();
    } catch (error) {
      setPushMessage(formatApiClientError(error, "Failed to disable push reminders."));
    } finally {
      setPushBusy(false);
    }
  }

  async function repairPushSubscription() {
    setPushBusy(true);
    setPushMessage(null);

    try {
      let endpoint: string | null = currentPushEndpoint;
      if (pushSupported && typeof window !== "undefined") {
        const registration =
          (await navigator.serviceWorker.getRegistration()) ||
          (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
        const subscription = await registration.pushManager.getSubscription();
        endpoint = subscription?.endpoint ?? endpoint;
      }

      const result = await authedRequest<PushRepairResponse>(
        getIdToken,
        "/api/notifications/subscriptions/repair",
        {
          method: "POST",
          body: JSON.stringify(endpoint ? { endpoint } : {})
        }
      );

      await refreshPushStateFromDeviceAndServer();
      if (result.message) {
        setPushMessage(result.message);
        return;
      }

      setPushMessage(
        `Repair complete: repaired ${result.repaired}${result.removedStale > 0 ? `, removed stale ${result.removedStale}` : ""}.`
      );
    } catch (error) {
      setPushMessage(formatApiClientError(error, "Failed to repair push subscription."));
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPushNotification() {
    if (!pushSubscribed) {
      setPushMessage("Enable push reminders first.");
      return;
    }

    setPushBusy(true);
    setPushMessage(null);

    try {
      const registration =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;

      if (!endpoint) {
        setPushSubscribed(false);
        setCurrentPushEndpoint(null);
        setPushMessage("No active subscription found on this device. Enable push reminders again.");
        return;
      }

      const result = await authedRequest<PushTestResponse>(getIdToken, "/api/notifications/test", {
        method: "POST",
        body: JSON.stringify({ endpoint })
      });
      if (result.sent > 0 && result.failed === 0) {
        setPushMessage(`Test notification sent to this device (${result.sent}/${result.targeted ?? 1}).`);
        return;
      }

      if (result.sent > 0 && result.failed > 0) {
        setPushMessage(
          `Partial success: sent ${result.sent}, failed ${result.failed}, cleaned ${result.deleted}.`
        );
        return;
      }

      if (result.failed > 0) {
        const first = result.details?.[0];
        const reason = first ? ` ${first.statusCode ?? "?"} ${first.message}` : "";
        setPushMessage(
          `Push failed for this subscription.${reason} Try Disable push, then Enable push again, then re-test.`
        );
        return;
      }

      setPushMessage("No active push subscription found for this account.");
    } catch (error) {
      setPushMessage(formatApiClientError(error, "Failed to send test notification."));
    } finally {
      setPushBusy(false);
    }
  }

  async function sendLocalNotificationPreview() {
    if (!pushSupported || typeof window === "undefined") {
      setPushMessage("Notifications are not supported on this device/browser.");
      return;
    }

    if (Notification.permission !== "granted") {
      setPushMessage("Notification permission is not granted yet.");
      return;
    }

    setPushBusy(true);
    setPushMessage(null);

    try {
      const registration =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await registration.showNotification("Bills App local notification test", {
        body: "If this appears, OS permission is fine and push delivery is the remaining step.",
        tag: `local-test-${Date.now()}`,
        icon: "/icons/192",
        badge: "/icons/192",
        data: { url: "/cards" }
      });
      setPushMessage("Local notification triggered.");
    } catch (error) {
      setPushMessage(formatApiClientError(error, "Failed to trigger local notification."));
    } finally {
      setPushBusy(false);
    }
  }

  async function runSmartAlertCheck() {
    setPushBusy(true);
    setPushMessage(null);

    try {
      const result = await authedRequest<SmartAlertDispatchResponse>(getIdToken, "/api/notifications/dispatch", {
        method: "POST",
        body: JSON.stringify({ force: false })
      });

      if (result.sent > 0) {
        setPushMessage(
          `Smart alert check sent ${result.sent} notification(s)${result.failed > 0 ? `, ${result.failed} failed` : ""}.`
        );
        return;
      }

      if (result.reason) {
        setPushMessage(`Smart alert check: ${result.reason}`);
      } else {
        setPushMessage("Smart alert check completed with no sends.");
      }
    } catch (error) {
      setPushMessage(formatApiClientError(error, "Smart alert check failed."));
    } finally {
      setPushBusy(false);
    }
  }

  function getCardDraft(card: CardRecord) {
    return (
      cardDrafts[card.id] || {
        limit: card.limit,
        usedLimit: card.usedLimit,
        interestRateApr: card.interestRateApr ?? 0,
        dueDayOfMonth: card.dueDayOfMonth ?? null,
        statementDay: card.statementDay ?? null,
        minimumPaymentRule: card.minimumPaymentRule ?? null,
        interestFreeDays: card.interestFreeDays ?? null,
        lateFeeRule: card.lateFeeRule ?? null
      }
    );
  }

  const cards = cardsQuery.data?.cards || [];
  const mobileCard = mobileCardEditId ? cards.find((entry) => entry.id === mobileCardEditId) || null : null;
  const mobileCardDraft = mobileCard ? getCardDraft(mobileCard) : null;
  const mobileCardDueMeta = mobileCardDraft ? getDueMeta(mobileCardDraft.dueDayOfMonth) : null;

  return (
    <ProtectedPage title="Cards & Monthly Payments">
      <div className="space-y-4">
        <SectionPanel
          title="Card limits"
          subtitle="Update limits, used balances, APR, due dates, and statement rules. Interest and projected balances recalculate per selected month."
        >
          {cardsQuery.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading cards...</p> : null}
          {cardsQuery.error ? <p className="text-sm text-red-700">{(cardsQuery.error as Error).message}</p> : null}

          <div className="space-y-3 xl:hidden">
            {cards.map((card) => {
              const draft = getCardDraft(card);
              const available = draft.limit - draft.usedLimit;
              const projection = activeProjection?.entries[card.id];
              const dueMeta = getDueMeta(draft.dueDayOfMonth);

              return (
                <div className="mobile-edit-card" key={`mobile-${card.id}`}>
                  <div className="mobile-edit-card-head">
                    <div className="min-w-0">
                      <p className="mobile-edit-card-title">{card.name}</p>
                      <p className="mobile-edit-card-subtitle">
                        {dueMeta.statusLabel} · {dueMeta.detailLabel}
                      </p>
                    </div>
                    <button className="button-secondary shrink-0" type="button" onClick={() => setMobileCardEditId(card.id)}>
                      Edit
                    </button>
                  </div>
                  <div className="mobile-edit-keyvals">
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Limit</span>
                      <span className="mobile-edit-keyval-value">{formatGBP(draft.limit)}</span>
                    </div>
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Used</span>
                      <span className="mobile-edit-keyval-value">{formatGBP(draft.usedLimit)}</span>
                    </div>
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">APR</span>
                      <span className="mobile-edit-keyval-value">{draft.interestRateApr.toFixed(2)}%</span>
                    </div>
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Statement day</span>
                      <span className="mobile-edit-keyval-value">{draft.statementDay || "Not set"}</span>
                    </div>
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Min payment</span>
                      <span className="mobile-edit-keyval-value">{formatMinimumPaymentRule(draft.minimumPaymentRule)}</span>
                    </div>
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Available</span>
                      <span className="mobile-edit-keyval-value">{formatGBP(available)}</span>
                    </div>
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Interest ({selectedMonthLabel})</span>
                      <span className="mobile-edit-keyval-value">{formatGBP(projection?.interestAdded ?? 0)}</span>
                    </div>
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Late fee ({selectedMonthLabel})</span>
                      <span className="mobile-edit-keyval-value">{formatGBP(projection?.lateFeeAdded ?? 0)}</span>
                    </div>
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Projected used ({selectedMonthLabel})</span>
                      <span className="mobile-edit-keyval-value">
                        {formatGBP(projection?.closingBalance ?? draft.usedLimit)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            <MobileEditDrawer
              open={Boolean(mobileCard && mobileCardDraft)}
              title={mobileCard ? `Edit ${mobileCard.name}` : "Edit card"}
              subtitle={`Update card details for ${selectedMonthLabel}.`}
              onClose={() => setMobileCardEditId(null)}
              footer={
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => setMobileCardEditId(null)}>
                    Cancel
                  </button>
                  <button
                    className="button-primary w-full sm:w-auto"
                    type="button"
                    onClick={async () => {
                      if (!mobileCard) {
                        return;
                      }
                      await saveCard(mobileCard.id);
                      setMobileCardEditId(null);
                    }}
                  >
                    Save card
                  </button>
                </div>
              }
            >
              {mobileCard && mobileCardDraft ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="label">Limit</p>
                    <input
                      className="input mt-1"
                      type="number"
                      step="0.01"
                      value={mobileCardDraft.limit}
                      onChange={(event) =>
                        setCardDrafts((prev) => ({
                          ...prev,
                          [mobileCard.id]: { ...mobileCardDraft, limit: Number(event.target.value) }
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
                      value={mobileCardDraft.usedLimit}
                      onChange={(event) =>
                        setCardDrafts((prev) => ({
                          ...prev,
                          [mobileCard.id]: { ...mobileCardDraft, usedLimit: Number(event.target.value) }
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
                      value={mobileCardDraft.interestRateApr}
                      onChange={(event) =>
                        setCardDrafts((prev) => ({
                          ...prev,
                          [mobileCard.id]: { ...mobileCardDraft, interestRateApr: Number(event.target.value) }
                        }))
                      }
                    />
                  </div>
                  <div>
                    <p className="label">Due day (1-31)</p>
                    <select
                      className="input mt-1"
                      value={mobileCardDraft.dueDayOfMonth ? String(mobileCardDraft.dueDayOfMonth) : ""}
                      onChange={(event) =>
                        setCardDrafts((prev) => ({
                          ...prev,
                          [mobileCard.id]: {
                            ...mobileCardDraft,
                            dueDayOfMonth: parseDueDayInput(event.target.value)
                          }
                        }))
                      }
                    >
                      <option value="">Not set</option>
                      {DUE_DAY_OPTIONS.map((day) => (
                        <option key={`${mobileCard.id}-drawer-due-${day}`} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="label">Statement day (1-31)</p>
                    <select
                      className="input mt-1"
                      value={mobileCardDraft.statementDay ? String(mobileCardDraft.statementDay) : ""}
                      onChange={(event) =>
                        setCardDrafts((prev) => ({
                          ...prev,
                          [mobileCard.id]: {
                            ...mobileCardDraft,
                            statementDay: parseDueDayInput(event.target.value)
                          }
                        }))
                      }
                    >
                      <option value="">Not set</option>
                      {DUE_DAY_OPTIONS.map((day) => (
                        <option key={`${mobileCard.id}-drawer-statement-${day}`} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="label">Interest-free days</p>
                    <input
                      className="input mt-1"
                      type="number"
                      min={0}
                      max={120}
                      value={mobileCardDraft.interestFreeDays ?? ""}
                      onChange={(event) =>
                        setCardDrafts((prev) => ({
                          ...prev,
                          [mobileCard.id]: {
                            ...mobileCardDraft,
                            interestFreeDays: parseOptionalIntegerInput(event.target.value, 0, 120)
                          }
                        }))
                      }
                    />
                  </div>
                  <div>
                    <p className="label">Minimum payment type</p>
                    <select
                      className="input mt-1"
                      value={mobileCardDraft.minimumPaymentRule?.type || ""}
                      onChange={(event) =>
                        setCardDrafts((prev) => ({
                          ...prev,
                          [mobileCard.id]: {
                            ...mobileCardDraft,
                            minimumPaymentRule: event.target.value
                              ? {
                                  type: event.target.value as MinimumPaymentRule["type"],
                                  value: mobileCardDraft.minimumPaymentRule?.value ?? 1
                                }
                              : null
                          }
                        }))
                      }
                    >
                      <option value="">Not set</option>
                      <option value="fixed">Fixed amount</option>
                      <option value="percent">Percent of statement</option>
                    </select>
                  </div>
                  <div>
                    <p className="label">
                      Minimum payment value
                      {mobileCardDraft.minimumPaymentRule?.type === "percent" ? " (%)" : " (GBP)"}
                    </p>
                    <input
                      className="input mt-1"
                      type="number"
                      step="0.01"
                      min={0}
                      disabled={!mobileCardDraft.minimumPaymentRule}
                      value={mobileCardDraft.minimumPaymentRule?.value ?? ""}
                      onChange={(event) =>
                        setCardDrafts((prev) => ({
                          ...prev,
                          [mobileCard.id]: {
                            ...mobileCardDraft,
                            minimumPaymentRule: mobileCardDraft.minimumPaymentRule
                              ? {
                                  ...mobileCardDraft.minimumPaymentRule,
                                  value: Number(event.target.value)
                                }
                              : null
                          }
                        }))
                      }
                    />
                  </div>
                  <div>
                    <p className="label">Late fee (GBP)</p>
                    <input
                      className="input mt-1"
                      type="number"
                      min={0}
                      step="0.01"
                      value={mobileCardDraft.lateFeeRule?.value ?? ""}
                      onChange={(event) =>
                        setCardDrafts((prev) => ({
                          ...prev,
                          [mobileCard.id]: {
                            ...mobileCardDraft,
                            lateFeeRule: event.target.value.trim()
                              ? {
                                  type: "fixed",
                                  value: Number(event.target.value)
                                }
                              : null
                          }
                        }))
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${dueToneClass(
                          mobileCardDueMeta?.tone || "neutral"
                        )}`}
                      >
                        {mobileCardDueMeta?.statusLabel || "Not set"}
                      </span>
                      <span className="text-xs text-[var(--ink-soft)]">{mobileCardDueMeta?.detailLabel || ""}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </MobileEditDrawer>
          </div>

          <div className="table-wrap hidden xl:block">
            <table className="w-full table-fixed">
              <colgroup>
                <col style={{ width: "13%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Limit</th>
                  <th>Used</th>
                  <th>APR %</th>
                  <th>Due Day</th>
                  <th>Next Due</th>
                  <th>Available</th>
                  <th>Interest ({selectedMonthLabel})</th>
                  <th>Projected Used ({selectedMonthLabel})</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => {
                  const draft = getCardDraft(card);
                  const available = draft.limit - draft.usedLimit;
                  const projection = activeProjection?.entries[card.id];
                  const dueMeta = getDueMeta(draft.dueDayOfMonth);
                  return (
                    <tr key={card.id}>
                      <td>{card.name}</td>
                      <td>
                        <input
                          className="input w-full"
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
                          className="input w-full"
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
                          className="input w-full"
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
                          className="input w-full"
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
                      <td className="whitespace-nowrap">{formatGBP(available)}</td>
                      <td className="whitespace-nowrap">{formatGBP(projection?.interestAdded ?? 0)}</td>
                      <td className="whitespace-nowrap">{formatGBP(projection?.closingBalance ?? draft.usedLimit)}</td>
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

          <p className="label hidden xl:block">Statement cycle rules</p>
          <div className="table-wrap hidden xl:block">
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Statement Day</th>
                  <th>Interest-Free Days</th>
                  <th>Minimum Payment Rule</th>
                  <th>Late Fee (GBP)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => {
                  const draft = getCardDraft(card);
                  return (
                    <tr key={`statement-${card.id}`}>
                      <td>{card.name}</td>
                      <td>
                        <select
                          className="input w-full"
                          value={draft.statementDay ? String(draft.statementDay) : ""}
                          onChange={(event) =>
                            setCardDrafts((prev) => ({
                              ...prev,
                              [card.id]: {
                                ...draft,
                                statementDay: parseDueDayInput(event.target.value)
                              }
                            }))
                          }
                        >
                          <option value="">Not set</option>
                          {DUE_DAY_OPTIONS.map((day) => (
                            <option key={`statement-day-${card.id}-${day}`} value={day}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="input w-full"
                          type="number"
                          min={0}
                          max={120}
                          value={draft.interestFreeDays ?? ""}
                          onChange={(event) =>
                            setCardDrafts((prev) => ({
                              ...prev,
                              [card.id]: {
                                ...draft,
                                interestFreeDays: parseOptionalIntegerInput(event.target.value, 0, 120)
                              }
                            }))
                          }
                        />
                      </td>
                      <td>
                        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_110px]">
                          <select
                            className="input w-full"
                            value={draft.minimumPaymentRule?.type || ""}
                            onChange={(event) =>
                              setCardDrafts((prev) => ({
                                ...prev,
                                [card.id]: {
                                  ...draft,
                                  minimumPaymentRule: event.target.value
                                    ? {
                                        type: event.target.value as MinimumPaymentRule["type"],
                                        value: draft.minimumPaymentRule?.value ?? 1
                                      }
                                    : null
                                }
                              }))
                            }
                          >
                            <option value="">Not set</option>
                            <option value="fixed">Fixed</option>
                            <option value="percent">Percent</option>
                          </select>
                          <input
                            className="input w-full"
                            type="number"
                            step="0.01"
                            min={0}
                            disabled={!draft.minimumPaymentRule}
                            value={draft.minimumPaymentRule?.value ?? ""}
                            onChange={(event) =>
                              setCardDrafts((prev) => ({
                                ...prev,
                                [card.id]: {
                                  ...draft,
                                  minimumPaymentRule: draft.minimumPaymentRule
                                    ? {
                                        ...draft.minimumPaymentRule,
                                        value: Number(event.target.value)
                                      }
                                    : null
                                }
                              }))
                            }
                          />
                        </div>
                      </td>
                      <td>
                        <input
                          className="input w-full"
                          type="number"
                          min={0}
                          step="0.01"
                          value={draft.lateFeeRule?.value ?? ""}
                          onChange={(event) =>
                            setCardDrafts((prev) => ({
                              ...prev,
                              [card.id]: {
                                ...draft,
                                lateFeeRule: event.target.value.trim()
                                  ? {
                                      type: "fixed",
                                      value: Number(event.target.value)
                                    }
                                  : null
                              }
                            }))
                          }
                        />
                      </td>
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
            <p className="text-xs text-[var(--ink-soft)]">
              Installed app mode:{" "}
              <span className="font-medium text-[var(--ink-main)]">{isInstalledApp ? "Yes" : "No"}</span>
            </p>
            <p className="text-xs text-[var(--ink-soft)]">
              Saved subscriptions:{" "}
              <span className="font-medium text-[var(--ink-main)]">{serverSubscriptionCount}</span>
            </p>
            <p className="text-xs text-[var(--ink-soft)]">
              Health:{" "}
              <span className="font-medium text-[var(--ink-main)]">
                {pushDiagnosticsSummary.healthy} healthy
              </span>
              {" · "}
              <span className="font-medium text-[var(--ink-main)]">
                {pushDiagnosticsSummary.degraded} degraded
              </span>
            </p>
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
                disabled={pushBusy || !pushSupported || (isAppleMobileDevice && !isInstalledApp)}
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
              <button
                className="button-secondary w-full sm:w-auto"
                type="button"
                onClick={() => repairPushSubscription()}
                disabled={pushBusy || serverSubscriptionCount === 0}
              >
                Repair subscription
              </button>
              <button
                className="button-secondary w-full sm:w-auto"
                type="button"
                onClick={() => sendTestPushNotification()}
                disabled={pushBusy || !pushSubscribed}
              >
                Send test push
              </button>
              <button
                className="button-secondary w-full sm:w-auto"
                type="button"
                onClick={() => runSmartAlertCheck()}
                disabled={pushBusy || !pushSubscribed}
              >
                Run smart alert check
              </button>
              <button
                className="button-secondary w-full sm:w-auto"
                type="button"
                onClick={() => sendLocalNotificationPreview()}
                disabled={pushBusy || notificationPermission !== "granted"}
              >
                Local notify test
              </button>
            </div>
            {pushMessage ? <p className="mt-3 text-sm text-[var(--accent-strong)]">{pushMessage}</p> : null}
            {currentPushEndpoint ? (
              <p className="mt-2 text-[11px] text-[var(--ink-soft)]">
                Current device endpoint: …{currentPushEndpoint.slice(-18)}
              </p>
            ) : null}
            {pushDiagnosticsSummary.autoCleaned > 0 ? (
              <p className="mt-2 text-[11px] text-[var(--ink-soft)]">
                Auto-cleaned stale subscriptions: {pushDiagnosticsSummary.autoCleaned}
              </p>
            ) : null}
            {pushDiagnostics.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="label">Device diagnostics</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pushDiagnostics.map((entry) => (
                    <div className="rounded-xl border border-[var(--ring)] bg-white/60 p-3" key={entry.id}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-[var(--ink-main)]">…{entry.endpointSuffix}</p>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${diagnosticsHealthChipClass(entry.endpointHealth)}`}
                        >
                          {entry.endpointHealth}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
                        Last success: {formatDiagnosticTimestamp(entry.lastSuccessAt)}
                      </p>
                      <p className="text-[11px] text-[var(--ink-soft)]">
                        Last failure: {formatDiagnosticTimestamp(entry.lastFailureAt)}
                      </p>
                      <p className="text-[11px] text-[var(--ink-soft)]">
                        Failures: {entry.failureCount}
                        {entry.lastFailureReason ? ` · ${entry.lastFailureReason}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {isAppleMobileDevice && !isInstalledApp ? (
              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                iPhone/iPad web push only works in the installed Home Screen app.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-[var(--ink-soft)]">
              Alert timing, due-day offsets, and type toggles are configured in Dashboard → Smart alerts.
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
                  {formatMonthKeyUK(entry)}
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
