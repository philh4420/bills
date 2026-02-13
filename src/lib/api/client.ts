"use client";

import {
  canQueueOfflineWrite,
  enqueueOfflineWrite,
  isOfflineQueueNetworkError,
  startOfflineSync,
  triggerOfflineReplay
} from "@/lib/offline/queue";

export class ApiClientError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function detailMessageFromUnknown(details: unknown): string | null {
  if (!details) {
    return null;
  }

  if (typeof details === "string") {
    return details;
  }

  if (typeof details !== "object") {
    return null;
  }

  const detailsRecord = details as Record<string, unknown>;
  if (typeof detailsRecord.message === "string" && detailsRecord.message) {
    return detailsRecord.message;
  }

  for (const value of Object.values(detailsRecord)) {
    if (typeof value === "string" && value) {
      return value;
    }

    if (Array.isArray(value)) {
      const firstString = value.find((entry) => typeof entry === "string" && entry.length > 0);
      if (typeof firstString === "string") {
        return firstString;
      }
    }
  }

  return null;
}

function lockedMonthFromError(error: ApiClientError): string | null {
  if (!error.details || typeof error.details !== "object") {
    return null;
  }

  const maybeMonth = (error.details as Record<string, unknown>).month;
  if (typeof maybeMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(maybeMonth)) {
    return maybeMonth;
  }

  const messageMonth = error.message.match(/\b\d{4}-(0[1-9]|1[0-2])\b/);
  return messageMonth?.[0] ?? null;
}

export function formatApiClientError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    if (error.status === 202) {
      return error.message || "Saved offline. Will sync automatically when back online.";
    }

    if (error.status === 401) {
      return "Your session has expired. Sign in again.";
    }

    if (error.status === 403) {
      return "Access denied. This app is private to the owner account.";
    }

    if (error.status === 423) {
      const lockedMonth = lockedMonthFromError(error);
      if (lockedMonth) {
        return `Month ${lockedMonth} is locked. Reopen it from the Reconciliation page to continue.`;
      }
      return error.message || fallback;
    }

    if (error.status === 400) {
      const detailsMessage = detailMessageFromUnknown(error.details);
      return detailsMessage || error.message || fallback;
    }

    return error.message || fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function authedRequest<T>(
  getIdToken: () => Promise<string | null>,
  path: string,
  init?: RequestInit
): Promise<T> {
  if (typeof window !== "undefined") {
    startOfflineSync();
  }

  const token = await getIdToken();
  if (!token) {
    throw new ApiClientError(401, "Not authenticated");
  }

  const isFormData = init?.body instanceof FormData;
  const method = (init?.method || "GET").toUpperCase();
  const shouldQueue = typeof window !== "undefined" && canQueueOfflineWrite(path, method, isFormData);

  if (shouldQueue && typeof navigator !== "undefined" && !navigator.onLine) {
    const queued = enqueueOfflineWrite({
      method,
      path,
      bodyText: typeof init?.body === "string" ? init.body : undefined,
      contentType:
        !isFormData && init?.body ? "application/json" : undefined
    });
    throw new ApiClientError(202, `Saved offline (queue ${queued.id}). Sync will run automatically.`);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(isFormData ? {} : { "content-type": "application/json" }),
        ...(init?.headers || {})
      }
    });
  } catch (error) {
    if (shouldQueue && isOfflineQueueNetworkError(error)) {
      const queued = enqueueOfflineWrite({
        method,
        path,
        bodyText: typeof init?.body === "string" ? init.body : undefined,
        contentType:
          !isFormData && init?.body ? "application/json" : undefined
      });
      throw new ApiClientError(202, `Saved offline (queue ${queued.id}). Sync will run automatically.`);
    }
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const details =
      typeof body === "object" && body !== null && "details" in body
        ? (body as { details: unknown }).details
        : body;

    const detailsMessage =
      typeof details === "object" &&
      details !== null &&
      "message" in (details as Record<string, unknown>) &&
      typeof (details as Record<string, unknown>).message === "string"
        ? (details as Record<string, string>).message
        : null;

    const message =
      typeof body === "object" && body !== null && "error" in body
        ? detailsMessage
          ? `${String((body as { error: string }).error)}: ${detailsMessage}`
          : String((body as { error: string }).error)
        : `Request failed with status ${response.status}`;

    throw new ApiClientError(response.status, message, details);
  }

  if (shouldQueue && typeof window !== "undefined") {
    void triggerOfflineReplay();
  }

  return body as T;
}
