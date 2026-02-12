"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest, formatApiClientError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";

interface AuditEventRow {
  id: string;
  commandId?: string;
  type: "write" | "undo" | "archive";
  method: string;
  path: string;
  actorEmail: string;
  success: boolean;
  entityType?: string;
  entityId?: string;
  month?: string;
  before?: unknown;
  after?: unknown;
  requestPayload?: unknown;
  responseStatus?: number;
  message?: string;
  createdAt: string;
  command?: {
    id: string;
    status: "running" | "succeeded" | "failed" | "undone";
    reversible: boolean;
    undoKind?: string | null;
  } | null;
}

interface AuditEventsResponse {
  events: AuditEventRow[];
  pagination: {
    limit: number;
    cursor: string | null;
    nextCursor: string | null;
    total: number;
  };
}

interface ArchiveStatusResponse {
  activeCount: number;
  archiveCount: number;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London"
  }).format(parsed);
}

function statusChipClass(ok: boolean): string {
  return ok
    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border border-red-200 bg-red-50 text-red-700";
}

function commandChipClass(status: "running" | "succeeded" | "failed" | "undone" | undefined): string {
  if (status === "undone") {
    return "border border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "failed") {
    return "border border-red-200 bg-red-50 text-red-700";
  }
  if (status === "running") {
    return "border border-blue-200 bg-blue-50 text-blue-800";
  }
  return "border border-emerald-200 bg-emerald-50 text-emerald-800";
}

function parseMonthInput(value: string): string {
  if (!value) {
    return "";
  }
  const match = value.match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function toJsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function HistoryPage() {
  const { getIdToken } = useAuth();
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsMessage, setEventsMessage] = useState<string | null>(null);
  const [undoBusyId, setUndoBusyId] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [filters, setFilters] = useState({
    entityType: "",
    entityId: "",
    month: ""
  });
  const [archiveBefore, setArchiveBefore] = useState<string>("");
  const [archiveLimit, setArchiveLimit] = useState<string>("250");

  const statusQuery = useQuery({
    queryKey: ["audit-archive-status"],
    queryFn: () => authedRequest<ArchiveStatusResponse>(getIdToken, "/api/audit/archive")
  });

  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.entityType.trim()) {
      params.set("entityType", filters.entityType.trim());
    }
    if (filters.entityId.trim()) {
      params.set("entityId", filters.entityId.trim());
    }
    if (filters.month.trim()) {
      params.set("month", filters.month.trim());
    }
    return params.toString();
  }, [filters]);

  const loadEvents = useCallback(
    async (cursor: string | null, reset: boolean) => {
      setLoadingEvents(true);
      setEventsMessage(null);
      try {
        const query = new URLSearchParams(filterQueryString);
        query.set("limit", "20");
        if (cursor) {
          query.set("cursor", cursor);
        }
        const response = await authedRequest<AuditEventsResponse>(
          getIdToken,
          `/api/audit-events?${query.toString()}`
        );

        setEvents((prev) => (reset ? response.events : [...prev, ...response.events]));
        setNextCursor(response.pagination.nextCursor);
      } catch (error) {
        setEventsMessage(formatApiClientError(error, "Failed to load history."));
      } finally {
        setLoadingEvents(false);
      }
    },
    [filterQueryString, getIdToken]
  );

  useEffect(() => {
    void loadEvents(null, true);
  }, [loadEvents]);

  async function undoCommand(commandId: string) {
    setUndoBusyId(commandId);
    setEventsMessage(null);
    try {
      await authedRequest(getIdToken, `/api/undo/${encodeURIComponent(commandId)}`, {
        method: "POST"
      });
      setEventsMessage("Undo completed.");
      await Promise.all([loadEvents(null, true), statusQuery.refetch()]);
    } catch (error) {
      setEventsMessage(formatApiClientError(error, "Undo failed."));
    } finally {
      setUndoBusyId(null);
    }
  }

  async function archiveEvents(dryRun: boolean) {
    setArchiveBusy(true);
    setEventsMessage(null);
    try {
      const beforeIso = archiveBefore
        ? new Date(`${archiveBefore}T00:00:00.000Z`).toISOString()
        : new Date().toISOString();
      const limit = Number.parseInt(archiveLimit, 10);
      const response = await authedRequest<{
        dryRun: boolean;
        eligibleCount?: number;
        archivedCount?: number;
      }>(getIdToken, "/api/audit/archive", {
        method: "POST",
        body: JSON.stringify({
          dryRun,
          before: beforeIso,
          limit: Number.isInteger(limit) ? limit : 250
        })
      });

      if (dryRun) {
        setEventsMessage(`Archive dry-run: ${response.eligibleCount || 0} event(s) eligible.`);
      } else {
        setEventsMessage(`Archived ${response.archivedCount || 0} event(s).`);
      }

      await Promise.all([statusQuery.refetch(), loadEvents(null, true)]);
    } catch (error) {
      setEventsMessage(formatApiClientError(error, "Archive operation failed."));
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <ProtectedPage title="Edit History">
      <div className="space-y-4">
        <SectionPanel
          title="Audit stream"
          subtitle="Immutable write/undo timeline with command metadata and reversible actions."
        >
          <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
            <div className="panel p-4">
              <p className="label">Filters</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <input
                  className="input"
                  placeholder="Entity type (e.g. houseBills)"
                  value={filters.entityType}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      entityType: event.target.value
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Entity id"
                  value={filters.entityId}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      entityId: event.target.value
                    }))
                  }
                />
                <input
                  className="input"
                  type="month"
                  value={filters.month}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      month: parseMonthInput(event.target.value)
                    }))
                  }
                />
              </div>
            </div>

            <div className="panel p-4">
              <p className="label">Archive status</p>
              <p className="mt-2 text-sm text-[var(--ink-main)]">
                Active: <span className="font-semibold">{statusQuery.data?.activeCount ?? 0}</span>
              </p>
              <p className="text-sm text-[var(--ink-main)]">
                Archived: <span className="font-semibold">{statusQuery.data?.archiveCount ?? 0}</span>
              </p>
            </div>
          </div>

          <div className="mt-3 panel p-4">
            <p className="label">Retention controls</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input
                className="input"
                type="date"
                value={archiveBefore}
                onChange={(event) => setArchiveBefore(event.target.value)}
              />
              <input
                className="input"
                type="number"
                min={1}
                max={2000}
                value={archiveLimit}
                onChange={(event) => setArchiveLimit(event.target.value)}
              />
              <div className="flex gap-2">
                <button
                  className="button-secondary w-full"
                  type="button"
                  onClick={() => archiveEvents(true)}
                  disabled={archiveBusy}
                >
                  {archiveBusy ? "Working..." : "Dry-run archive"}
                </button>
                <button
                  className="button-danger w-full"
                  type="button"
                  onClick={() => archiveEvents(false)}
                  disabled={archiveBusy}
                >
                  {archiveBusy ? "Working..." : "Archive now"}
                </button>
              </div>
            </div>
          </div>

          {eventsMessage ? <p className="mt-3 text-sm text-[var(--accent-strong)]">{eventsMessage}</p> : null}

          <div className="mt-4 space-y-3">
            {events.map((event) => (
              <div className="panel p-4" key={event.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--ink-main)]">{formatTimestamp(event.createdAt)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusChipClass(event.success)}`}>
                      {event.success ? "success" : "failed"}
                    </span>
                    {event.command ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${commandChipClass(event.command.status)}`}
                      >
                        {event.command.status}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-sm text-[var(--ink-main)]">
                  <span className="font-medium">{event.method}</span> {event.path}
                </p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {event.entityType || "generic"} {event.entityId ? `· ${event.entityId}` : ""}
                  {event.month ? ` · ${event.month}` : ""}
                </p>
                {event.message ? <p className="mt-2 text-sm text-[var(--ink-soft)]">{event.message}</p> : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {event.command?.reversible &&
                  event.command.status === "succeeded" &&
                  event.command.id ? (
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => undoCommand(event.command!.id)}
                      disabled={undoBusyId === event.command.id}
                    >
                      {undoBusyId === event.command.id ? "Undoing..." : "Undo"}
                    </button>
                  ) : null}
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[var(--ink-soft)]">
                    Payload metadata
                  </summary>
                  <div className="mt-2 grid gap-2 lg:grid-cols-3">
                    <pre className="overflow-auto rounded-xl border border-[var(--ring)] bg-white/60 p-2 text-[11px]">
                      <strong>Request</strong>
                      {"\n"}
                      {toJsonPreview(event.requestPayload ?? null)}
                    </pre>
                    <pre className="overflow-auto rounded-xl border border-[var(--ring)] bg-white/60 p-2 text-[11px]">
                      <strong>Before</strong>
                      {"\n"}
                      {toJsonPreview(event.before ?? null)}
                    </pre>
                    <pre className="overflow-auto rounded-xl border border-[var(--ring)] bg-white/60 p-2 text-[11px]">
                      <strong>After</strong>
                      {"\n"}
                      {toJsonPreview(event.after ?? null)}
                    </pre>
                  </div>
                </details>
              </div>
            ))}

            {!loadingEvents && events.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">No history events found for current filters.</p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="button-secondary w-full sm:w-auto"
                type="button"
                onClick={() => loadEvents(null, true)}
                disabled={loadingEvents}
              >
                {loadingEvents ? "Loading..." : "Refresh"}
              </button>
              <button
                className="button-primary w-full sm:w-auto"
                type="button"
                onClick={() => loadEvents(nextCursor, false)}
                disabled={loadingEvents || !nextCursor}
              >
                {loadingEvents ? "Loading..." : nextCursor ? "Load more" : "No more events"}
              </button>
            </div>
          </div>
        </SectionPanel>
      </div>
    </ProtectedPage>
  );
}
