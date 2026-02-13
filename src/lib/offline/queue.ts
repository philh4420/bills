"use client";

export type OfflineQueueItemStatus = "queued" | "syncing" | "failed" | "conflict";
export type OfflineConflictResolution = "apply" | "discard";

export interface OfflineQueueItem {
  id: string;
  method: string;
  path: string;
  bodyText?: string;
  headers?: Record<string, string>;
  contentType?: string;
  createdAt: string;
  updatedAt: string;
  retries: number;
  status: OfflineQueueItemStatus;
  lastError?: string;
  lastStatusCode?: number;
  conflictReason?: string;
  ignoreConflict?: boolean;
}

export interface OfflineTelemetry {
  enqueued: number;
  replayed: number;
  failed: number;
  conflicts: number;
}

export interface OfflineSyncSnapshot {
  online: boolean;
  syncing: boolean;
  queuedCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  telemetry: OfflineTelemetry;
  items: OfflineQueueItem[];
}

interface OfflineState {
  items: OfflineQueueItem[];
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  telemetry: OfflineTelemetry;
}

interface EnqueueInput {
  method: string;
  path: string;
  headers?: Record<string, string>;
  bodyText?: string;
  contentType?: string;
}

const STORAGE_KEY = "bills-offline-queue-v1";
const MAX_QUEUE_ITEMS = 250;
const MAX_RETRIES = 3;
const REPLAY_INTERVAL_MS = 20_000;

let state: OfflineState = {
  items: [],
  syncing: false,
  lastSyncAt: null,
  lastError: null,
  telemetry: {
    enqueued: 0,
    replayed: 0,
    failed: 0,
    conflicts: 0
  }
};

const listeners = new Set<() => void>();
let started = false;
let replayTimer: ReturnType<typeof setInterval> | null = null;
let tokenProvider: (() => Promise<string | null>) | null = null;
let replayPromise: Promise<void> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function supportsWindow(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalizeMethod(value: string | undefined): string {
  return (value || "GET").toUpperCase();
}

function normalizeItemStatus(value: unknown): OfflineQueueItemStatus {
  if (value === "failed" || value === "conflict" || value === "syncing") {
    return value;
  }
  return "queued";
}

function asCleanPath(path: string): string {
  try {
    const url = new URL(path, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return path;
  }
}

function toUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isSameWriteTarget(left: OfflineQueueItem, right: EnqueueInput): boolean {
  return (
    (left.method === "PATCH" || left.method === "PUT") &&
    left.method === right.method &&
    left.path === right.path
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isNetworkLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed")
  );
}

function readStateFromStorage(): void {
  if (!supportsWindow()) {
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as Partial<OfflineState>;
    const parsedItems = Array.isArray(parsed.items) ? parsed.items : [];
    state = {
      items: parsedItems
        .filter((item) => {
          return Boolean(
            item &&
              typeof item.id === "string" &&
              typeof item.method === "string" &&
              typeof item.path === "string" &&
              typeof item.createdAt === "string"
          );
        })
        .map((item) => ({
          ...item,
          method: normalizeMethod(item.method),
          status: normalizeItemStatus(item.status),
          createdAt: typeof item.createdAt === "string" ? item.createdAt : nowIso(),
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : nowIso(),
          retries:
            typeof item.retries === "number" && Number.isFinite(item.retries)
              ? Math.max(0, Math.floor(item.retries))
              : 0
        }))
        .slice(0, MAX_QUEUE_ITEMS),
      syncing: false,
      lastSyncAt: typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
      telemetry: {
        enqueued: typeof parsed.telemetry?.enqueued === "number" ? parsed.telemetry.enqueued : 0,
        replayed: typeof parsed.telemetry?.replayed === "number" ? parsed.telemetry.replayed : 0,
        failed: typeof parsed.telemetry?.failed === "number" ? parsed.telemetry.failed : 0,
        conflicts: typeof parsed.telemetry?.conflicts === "number" ? parsed.telemetry.conflicts : 0
      }
    };
  } catch {
    // Ignore malformed offline storage.
  }
  refreshCachedSnapshot();
}

function persistState(): void {
  if (!supportsWindow()) {
    return;
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: state.items,
        lastSyncAt: state.lastSyncAt,
        lastError: state.lastError,
        telemetry: state.telemetry
      })
    );
  } catch {
    // Ignore storage write failures (private mode quota, etc).
  }
}

function emit(): void {
  refreshCachedSnapshot();
  listeners.forEach((listener) => listener());
}

function sortItems(items: OfflineQueueItem[]): OfflineQueueItem[] {
  return items.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function trimQueue(items: OfflineQueueItem[]): OfflineQueueItem[] {
  if (items.length <= MAX_QUEUE_ITEMS) {
    return items;
  }
  return sortItems(items).slice(items.length - MAX_QUEUE_ITEMS);
}

function withState(mutator: (current: OfflineState) => OfflineState): void {
  state = mutator(state);
  persistState();
  emit();
}

function defaultSnapshot(): OfflineSyncSnapshot {
  return {
    online: true,
    syncing: false,
    queuedCount: 0,
    failedCount: 0,
    conflictCount: 0,
    lastSyncAt: null,
    lastError: null,
    telemetry: {
      enqueued: 0,
      replayed: 0,
      failed: 0,
      conflicts: 0
    },
    items: []
  };
}

const SERVER_SNAPSHOT = defaultSnapshot();
let cachedSnapshot: OfflineSyncSnapshot = SERVER_SNAPSHOT;

function buildSnapshot(): OfflineSyncSnapshot {
  if (!supportsWindow()) {
    return SERVER_SNAPSHOT;
  }

  const failedCount = state.items.filter((item) => item.status === "failed" || item.status === "conflict")
    .length;
  const conflictCount = state.items.filter((item) => item.status === "conflict").length;
  const queuedCount = state.items.filter((item) => item.status === "queued" || item.status === "syncing").length;
  return {
    online: navigator.onLine,
    syncing: state.syncing,
    queuedCount,
    failedCount,
    conflictCount,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
    telemetry: state.telemetry,
    items: sortItems(state.items)
  };
}

function refreshCachedSnapshot(): void {
  cachedSnapshot = buildSnapshot();
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseErrorMessageFromResponse(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) {
    return body;
  }
  if (body && typeof body === "object") {
    const root = body as Record<string, unknown>;
    if (typeof root.error === "string" && root.error) {
      return root.error;
    }
    if (typeof root.message === "string" && root.message) {
      return root.message;
    }
    if (root.details && typeof root.details === "object") {
      const details = root.details as Record<string, unknown>;
      if (typeof details.message === "string" && details.message) {
        return details.message;
      }
    }
  }
  return `Request failed with status ${status}`;
}

function conflictTargetForPath(path: string): {
  listPath: string;
  listKey: string;
  idField: string;
  entityId: string;
} | null {
  const cleanPath = path.split("?")[0];
  const matchers: Array<{
    pattern: RegExp;
    listPath: string;
    listKey: string;
    idField?: string;
  }> = [
    { pattern: /^\/api\/cards\/([^/]+)$/, listPath: "/api/cards", listKey: "cards" },
    { pattern: /^\/api\/house-bills\/([^/]+)$/, listPath: "/api/house-bills", listKey: "items" },
    { pattern: /^\/api\/income\/([^/]+)$/, listPath: "/api/income", listKey: "items" },
    { pattern: /^\/api\/shopping\/([^/]+)$/, listPath: "/api/shopping", listKey: "items" },
    { pattern: /^\/api\/my-bills\/([^/]+)$/, listPath: "/api/my-bills", listKey: "items" },
    { pattern: /^\/api\/monthly-adjustments\/([^/]+)$/, listPath: "/api/monthly-adjustments", listKey: "adjustments" },
    { pattern: /^\/api\/loaned-out\/([^/]+)$/, listPath: "/api/loaned-out", listKey: "items" },
    { pattern: /^\/api\/savings-goals\/([^/]+)$/, listPath: "/api/savings-goals", listKey: "goals" },
    { pattern: /^\/api\/bank-accounts\/([^/]+)$/, listPath: "/api/bank-accounts", listKey: "accounts" },
    { pattern: /^\/api\/bank-transfers\/([^/]+)$/, listPath: "/api/bank-transfers", listKey: "transfers" },
    {
      pattern: /^\/api\/monthly-payments\/(\d{4}-(0[1-9]|1[0-2]))$/,
      listPath: "/api/monthly-payments",
      listKey: "payments",
      idField: "month"
    }
  ];

  for (const matcher of matchers) {
    const matched = cleanPath.match(matcher.pattern);
    if (!matched) {
      continue;
    }
    return {
      listPath: matcher.listPath,
      listKey: matcher.listKey,
      idField: matcher.idField || "id",
      entityId: matched[1]
    };
  }
  return null;
}

async function detectConflictForItem(item: OfflineQueueItem, token: string): Promise<string | null> {
  if (item.ignoreConflict) {
    return null;
  }
  const method = normalizeMethod(item.method);
  if (method !== "PATCH" && method !== "PUT" && method !== "DELETE") {
    return null;
  }

  const target = conflictTargetForPath(item.path);
  if (!target) {
    return null;
  }

  try {
    const response = await fetch(target.listPath, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return null;
    }
    const body = (await response.json()) as Record<string, unknown>;
    const list = body[target.listKey];
    if (!Array.isArray(list)) {
      return null;
    }

    const entity = list.find((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const value = (entry as Record<string, unknown>)[target.idField];
      return String(value ?? "") === target.entityId;
    });

    if (!entity) {
      return "Server item is missing.";
    }

    const updatedAt = (entity as Record<string, unknown>).updatedAt;
    if (typeof updatedAt !== "string" || !updatedAt) {
      return null;
    }

    if (updatedAt > item.createdAt) {
      return `Server changed this item after it was queued (${updatedAt}).`;
    }
    return null;
  } catch {
    return null;
  }
}

async function replayQueueInternal(): Promise<void> {
  if (state.syncing || replayPromise || !tokenProvider) {
    return;
  }
  if (!supportsWindow()) {
    return;
  }
  if (!navigator.onLine) {
    emit();
    return;
  }

  const snapshotItems = sortItems(state.items);
  const pendingItems = snapshotItems.filter((item) => item.status === "queued" || item.status === "syncing");
  if (pendingItems.length === 0) {
    return;
  }

  replayPromise = (async () => {
    withState((current) => ({
      ...current,
      syncing: true,
      lastError: null
    }));

    try {
      const token = await tokenProvider?.();
      if (!token) {
        withState((current) => ({
          ...current,
          syncing: false,
          lastError: "Missing auth token for queued sync."
        }));
        return;
      }

      let items = sortItems(state.items);
      let hadSuccess = false;

      for (const originalItem of items) {
        const itemIndex = items.findIndex((entry) => entry.id === originalItem.id);
        if (itemIndex < 0) {
          continue;
        }
        const item = items[itemIndex];
        if (item.status !== "queued" && item.status !== "syncing") {
          continue;
        }

        const conflictReason = await detectConflictForItem(item, token);
        if (conflictReason) {
          items[itemIndex] = {
            ...item,
            status: "conflict",
            conflictReason,
            updatedAt: nowIso()
          };
          state = {
            ...state,
            items,
            telemetry: {
              ...state.telemetry,
              conflicts: state.telemetry.conflicts + 1
            }
          };
          persistState();
          emit();
          continue;
        }

        const requestHeaders: Record<string, string> = {
          authorization: `Bearer ${token}`
        };
        if (item.contentType) {
          requestHeaders["content-type"] = item.contentType;
        }
        if (item.headers) {
          Object.assign(requestHeaders, item.headers);
        }

        let response: Response;
        try {
          response = await fetch(item.path, {
            method: item.method,
            headers: requestHeaders,
            body: item.bodyText
          });
        } catch (error) {
          if (isNetworkLikeError(error)) {
            withState((current) => ({
              ...current,
              syncing: false,
              lastError: "Offline during queue replay."
            }));
            return;
          }

          items[itemIndex] = {
            ...item,
            status: item.retries + 1 >= MAX_RETRIES ? "failed" : "queued",
            retries: item.retries + 1,
            lastError: error instanceof Error ? error.message : "Queue replay failed",
            updatedAt: nowIso()
          };
          state = {
            ...state,
            items,
            telemetry: {
              ...state.telemetry,
              failed: state.telemetry.failed + 1
            }
          };
          persistState();
          emit();
          continue;
        }

        if (!response.ok) {
          const contentType = response.headers.get("content-type") || "";
          const rawBody = contentType.includes("application/json")
            ? (await response.json())
            : await response.text();
          const message = parseErrorMessageFromResponse(rawBody, response.status);

          if (response.status === 409) {
            items[itemIndex] = {
              ...item,
              status: "conflict",
              conflictReason: message,
              lastStatusCode: response.status,
              updatedAt: nowIso()
            };
            state = {
              ...state,
              items,
              telemetry: {
                ...state.telemetry,
                conflicts: state.telemetry.conflicts + 1
              }
            };
            persistState();
            emit();
            continue;
          }

          const shouldRetry = isRetryableStatus(response.status) && item.retries + 1 < MAX_RETRIES;
          items[itemIndex] = {
            ...item,
            status: shouldRetry ? "queued" : "failed",
            retries: item.retries + 1,
            lastError: message,
            lastStatusCode: response.status,
            updatedAt: nowIso()
          };
          state = {
            ...state,
            items,
            telemetry: {
              ...state.telemetry,
              failed: state.telemetry.failed + 1
            }
          };
          persistState();
          emit();
          continue;
        }

        hadSuccess = true;
        items = items.filter((entry) => entry.id !== item.id);
        state = {
          ...state,
          items,
          telemetry: {
            ...state.telemetry,
            replayed: state.telemetry.replayed + 1
          }
        };
        persistState();
        emit();
      }

      withState((current) => ({
        ...current,
        syncing: false,
        lastSyncAt: hadSuccess ? nowIso() : current.lastSyncAt
      }));
    } finally {
      replayPromise = null;
    }
  })();

  await replayPromise;
}

export function setOfflineTokenProvider(provider: (() => Promise<string | null>) | null): void {
  tokenProvider = provider;
}

export function startOfflineSync(): void {
  if (!supportsWindow() || started) {
    return;
  }

  readStateFromStorage();
  started = true;

  const onOnlineStateChange = () => {
    emit();
    if (navigator.onLine) {
      void replayQueueInternal();
    }
  };
  window.addEventListener("online", onOnlineStateChange);
  window.addEventListener("offline", onOnlineStateChange);
  window.addEventListener("focus", () => {
    if (navigator.onLine) {
      void replayQueueInternal();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void replayQueueInternal();
    }
  });

  replayTimer = setInterval(() => {
    if (navigator.onLine) {
      void replayQueueInternal();
    }
  }, REPLAY_INTERVAL_MS);

  if (navigator.onLine) {
    void replayQueueInternal();
  }
}

export function stopOfflineSync(): void {
  if (!started) {
    return;
  }
  started = false;
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
}

export async function triggerOfflineReplay(): Promise<void> {
  await replayQueueInternal();
}

export function getOfflineSyncSnapshot(): OfflineSyncSnapshot {
  if (!supportsWindow()) {
    return SERVER_SNAPSHOT;
  }
  if (cachedSnapshot === SERVER_SNAPSHOT) {
    refreshCachedSnapshot();
  }
  return cachedSnapshot;
}

export function subscribeOfflineSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function canQueueOfflineWrite(path: string, method: string, isFormData: boolean): boolean {
  const normalizedMethod = normalizeMethod(method);
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD" || normalizedMethod === "OPTIONS") {
    return false;
  }
  if (isFormData) {
    return false;
  }

  const queueablePrefixes = [
    "/api/cards",
    "/api/monthly-payments",
    "/api/house-bills",
    "/api/income",
    "/api/shopping",
    "/api/my-bills",
    "/api/monthly-adjustments",
    "/api/loaned-out",
    "/api/bank-balance",
    "/api/bank-accounts",
    "/api/bank-transfers",
    "/api/payday-mode",
    "/api/income-paydays",
    "/api/savings-goals",
    "/api/calendar/due-day",
    "/api/reconciliations",
    "/api/month-closures"
  ];
  const cleanPath = path.split("?")[0];
  return queueablePrefixes.some((prefix) => cleanPath.startsWith(prefix));
}

export function enqueueOfflineWrite(input: EnqueueInput): OfflineQueueItem {
  const method = normalizeMethod(input.method);
  const queuedAt = nowIso();
  const base: EnqueueInput = {
    ...input,
    method,
    path: asCleanPath(input.path)
  };

  const existingTarget = state.items.find((entry) => isSameWriteTarget(entry, base));
  const nextItem: OfflineQueueItem = existingTarget
    ? {
        ...existingTarget,
        bodyText: base.bodyText,
        headers: base.headers,
        contentType: base.contentType,
        status: "queued",
        retries: 0,
        lastError: undefined,
        lastStatusCode: undefined,
        conflictReason: undefined,
        ignoreConflict: false,
        updatedAt: queuedAt
      }
    : {
        id: toUniqueId(),
        method,
        path: base.path,
        bodyText: base.bodyText,
        headers: base.headers,
        contentType: base.contentType,
        createdAt: queuedAt,
        updatedAt: queuedAt,
        retries: 0,
        status: "queued"
      };

  withState((current) => {
    const withoutOld = existingTarget
      ? current.items.filter((entry) => entry.id !== existingTarget.id)
      : current.items;
    return {
      ...current,
      items: trimQueue([...withoutOld, nextItem]),
      telemetry: {
        ...current.telemetry,
        enqueued: current.telemetry.enqueued + (existingTarget ? 0 : 1)
      }
    };
  });

  return nextItem;
}

export async function retryOfflineQueueItem(itemId: string): Promise<void> {
  withState((current) => ({
    ...current,
    items: current.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            status: "queued",
            retries: 0,
            lastError: undefined,
            conflictReason: undefined,
            ignoreConflict: false,
            updatedAt: nowIso()
          }
        : item
    )
  }));
  await replayQueueInternal();
}

export async function resolveOfflineConflict(
  itemId: string,
  resolution: OfflineConflictResolution
): Promise<void> {
  if (resolution === "discard") {
    withState((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId)
    }));
    return;
  }

  withState((current) => ({
    ...current,
    items: current.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            status: "queued",
            ignoreConflict: true,
            retries: 0,
            conflictReason: undefined,
            lastError: undefined,
            updatedAt: nowIso()
          }
        : item
    )
  }));
  await replayQueueInternal();
}

export function clearOfflineFailedItems(): void {
  withState((current) => ({
    ...current,
    items: current.items.filter((item) => item.status !== "failed" && item.status !== "conflict")
  }));
}

export function isOfflineQueueNetworkError(error: unknown): boolean {
  return isNetworkLikeError(error);
}

export function parseJsonBody(bodyText?: string): unknown {
  if (!bodyText) {
    return null;
  }
  return parseJsonSafe(bodyText);
}
