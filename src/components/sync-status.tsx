"use client";

import { useMemo, useState } from "react";

import { useOfflineSyncStatus } from "@/lib/offline/hooks";
import {
  clearOfflineFailedItems,
  resolveOfflineConflict,
  retryOfflineQueueItem,
  triggerOfflineReplay
} from "@/lib/offline/queue";

function statusToneClass(input: "ok" | "warn" | "danger"): string {
  if (input === "danger") {
    return "border border-red-200 bg-red-50 text-red-800";
  }
  if (input === "warn") {
    return "border border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border border-emerald-200 bg-emerald-50 text-emerald-800";
}

function formatTimestamp(value: string | null): string {
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

export function SyncStatus() {
  const status = useOfflineSyncStatus();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const tone = useMemo(() => {
    if (!status.online || status.failedCount > 0) {
      return "danger" as const;
    }
    if (status.syncing || status.queuedCount > 0) {
      return "warn" as const;
    }
    return "ok" as const;
  }, [status.failedCount, status.online, status.queuedCount, status.syncing]);

  const label = useMemo(() => {
    if (!status.online) {
      return "Offline";
    }
    if (status.syncing) {
      return "Syncing";
    }
    if (status.failedCount > 0) {
      return `${status.failedCount} failed`;
    }
    if (status.queuedCount > 0) {
      return `${status.queuedCount} queued`;
    }
    return "Up to date";
  }, [status.failedCount, status.online, status.queuedCount, status.syncing]);

  const failedItems = status.items.filter((item) => item.status === "failed" || item.status === "conflict");

  return (
    <div className="panel p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-soft)]">Offline Sync</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusToneClass(tone)}`}>{label}</span>
            <p className="truncate text-xs text-[var(--ink-soft)]">
              Queue {status.queuedCount} · Failed {status.failedCount} · Last sync {formatTimestamp(status.lastSyncAt)}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button className="button-secondary" type="button" onClick={() => setOpen((prev) => !prev)}>
            {open ? "Hide sync" : "Show sync"}
          </button>
          <button className="button-secondary" type="button" onClick={() => triggerOfflineReplay()}>
            Sync now
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 space-y-2">
          {status.lastError ? <p className="text-sm text-red-700">{status.lastError}</p> : null}
          {failedItems.length > 0 ? (
            <div className="space-y-2">
              {failedItems.map((item) => (
                <div
                  key={`sync-item-${item.id}`}
                  className="rounded-2xl border border-[var(--ring)] bg-white/72 p-3"
                >
                  <p className="text-sm font-semibold text-[var(--ink-main)]">
                    {item.method} {item.path}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)]">
                    {item.status === "conflict" ? "Conflict" : "Failed"} · {item.lastError || item.conflictReason || "No details"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.status === "conflict" ? (
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={busyId === `${item.id}:apply`}
                        onClick={async () => {
                          setBusyId(`${item.id}:apply`);
                          try {
                            await resolveOfflineConflict(item.id, "apply");
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        Apply anyway
                      </button>
                    ) : (
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={busyId === `${item.id}:retry`}
                        onClick={async () => {
                          setBusyId(`${item.id}:retry`);
                          try {
                            await retryOfflineQueueItem(item.id);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        Retry
                      </button>
                    )}

                    <button
                      className="button-danger"
                      type="button"
                      disabled={busyId === `${item.id}:discard`}
                      onClick={async () => {
                        setBusyId(`${item.id}:discard`);
                        try {
                          await resolveOfflineConflict(item.id, "discard");
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ))}

              <button className="button-secondary" type="button" onClick={() => clearOfflineFailedItems()}>
                Clear failed list
              </button>
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">No failed or conflicting queued writes.</p>
          )}

          <p className="text-xs text-[var(--ink-soft)]">
            Telemetry: enqueued {status.telemetry.enqueued}, replayed {status.telemetry.replayed}, failed{" "}
            {status.telemetry.failed}, conflicts {status.telemetry.conflicts}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
