"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { useAuth } from "@/lib/auth/client";
import { authedRequest, formatApiClientError } from "@/lib/api/client";

interface ImportResponse {
  mode: "preview" | "committed";
  fileName: string;
  summary: {
    cardCount: number;
    monthlyRows: number;
    monthCount: number;
    houseBillCount: number;
    incomeCount: number;
    shoppingCount: number;
    myBillCount: number;
    purchaseCount: number;
    inferredMonths: string[];
    warnings: string[];
  };
  warnings: string[];
  importId?: string;
  sha256?: string;
}

interface SnapshotSummary {
  totalDocuments: number;
  collectionCounts: Record<string, number>;
  hasUserProfile: boolean;
}

interface RestoreResponse {
  ok: boolean;
  mode: "dry-run" | "commit";
  summary: SnapshotSummary;
  warnings: string[];
}

interface BackupsResponse {
  backups: Array<{
    id: string;
    action: "export" | "restore";
    status: "success" | "failed";
    format: "csv" | "json" | "snapshot";
    mode: "dry-run" | "commit";
    createdAt: string;
    totalDocuments: number;
    collectionCounts: Record<string, number>;
    message?: string | null;
  }>;
}

function Summary({ data }: { data: ImportResponse["summary"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="panel p-4">
        <p className="label">Cards</p>
        <p className="metric-value mt-2">{data.cardCount}</p>
      </div>
      <div className="panel p-4">
        <p className="label">Months</p>
        <p className="metric-value mt-2">{data.monthCount}</p>
      </div>
      <div className="panel p-4">
        <p className="label">House Bills</p>
        <p className="metric-value mt-2">{data.houseBillCount}</p>
      </div>
      <div className="panel p-4">
        <p className="label">Purchases</p>
        <p className="metric-value mt-2">{data.purchaseCount}</p>
      </div>
    </div>
  );
}

function formatLocalDateTime(value: string): string {
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

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function ImportPage() {
  const { getIdToken } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opsBusy, setOpsBusy] = useState(false);
  const [opsMessage, setOpsMessage] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResponse | null>(null);

  const backupsQuery = useQuery({
    queryKey: ["backups"],
    queryFn: () => authedRequest<BackupsResponse>(getIdToken, "/api/backups")
  });

  async function run(commit: boolean) {
    if (!file) {
      setError("Choose a .xlsx file first.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const form = new FormData();
      form.set("file", file);
      form.set("commit", String(commit));

      const response = await authedRequest<ImportResponse>(getIdToken, "/api/import/bills-xlsx", {
        method: "POST",
        body: form
      });

      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function exportWorkspace(format: "csv" | "json") {
    setOpsBusy(true);
    setOpsMessage(null);

    try {
      if (format === "csv") {
        const csv = await authedRequest<string>(getIdToken, "/api/export?format=csv");
        downloadTextFile(`bills-export-${Date.now()}.csv`, csv, "text/csv;charset=utf-8");
        setOpsMessage("CSV export downloaded.");
      } else {
        const json = await authedRequest<Record<string, unknown>>(getIdToken, "/api/export?format=json");
        downloadTextFile(
          `bills-export-${Date.now()}.json`,
          JSON.stringify(json, null, 2),
          "application/json;charset=utf-8"
        );
        setOpsMessage("JSON snapshot export downloaded.");
      }
      await backupsQuery.refetch();
    } catch (requestError) {
      setOpsMessage(formatApiClientError(requestError, "Export failed."));
    } finally {
      setOpsBusy(false);
    }
  }

  async function runRestore(mode: "dry-run" | "commit") {
    if (!restoreFile) {
      setOpsMessage("Select a JSON snapshot file first.");
      return;
    }

    setOpsBusy(true);
    setOpsMessage(null);

    try {
      const rawText = await restoreFile.text();
      let parsedSnapshot: unknown;
      try {
        parsedSnapshot = JSON.parse(rawText);
      } catch {
        setOpsMessage("Restore file is not valid JSON.");
        return;
      }

      const response = await authedRequest<RestoreResponse>(getIdToken, "/api/restore", {
        method: "POST",
        body: JSON.stringify({
          mode,
          snapshot: parsedSnapshot
        })
      });

      setRestoreResult(response);
      if (response.mode === "dry-run") {
        setOpsMessage(`Dry-run passed: ${response.summary.totalDocuments} documents validated.`);
      } else {
        setOpsMessage(`Restore committed: ${response.summary.totalDocuments} documents replaced.`);
      }
      await backupsQuery.refetch();
    } catch (requestError) {
      setOpsMessage(formatApiClientError(requestError, "Restore failed."));
    } finally {
      setOpsBusy(false);
    }
  }

  return (
    <ProtectedPage title="Workbook Import">
      <div className="space-y-4">
        <SectionPanel
          title="One-time import"
          subtitle="Upload Bills.xlsx, preview parsed entities, then commit to Firestore."
        >
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="xlsx">Workbook file</label>
              <input
                id="xlsx"
                className="input mt-1"
                type="file"
                accept=".xlsx"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button className="button-secondary w-full sm:w-auto" disabled={busy || !file} type="button" onClick={() => run(false)}>
                {busy ? "Working..." : "Preview"}
              </button>
              <button className="button-primary w-full sm:w-auto" disabled={busy || !file} type="button" onClick={() => run(true)}>
                {busy ? "Working..." : "Commit Import"}
              </button>
            </div>
            <p className="text-xs text-[var(--ink-soft)]">
              Preview mode validates and maps workbook sheets without writing data. Commit writes normalized entities and
              month snapshots to Firestore.
            </p>

            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </div>
        </SectionPanel>

        {result ? (
          <SectionPanel
            title={result.mode === "preview" ? "Preview result" : "Committed result"}
            subtitle={result.fileName}
          >
            <Summary data={result.summary} />
            {result.importId ? (
              <div className="mt-3 text-xs text-[var(--ink-soft)]">
                <p>Import ID: {result.importId}</p>
                <p>SHA256: {result.sha256}</p>
              </div>
            ) : null}
            {result.warnings.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--ink-soft)]">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </SectionPanel>
        ) : null}

        <SectionPanel
          title="Data portability & recovery"
          subtitle="Export your complete workspace to CSV/JSON and restore from a JSON snapshot with dry-run validation first."
        >
          <div className="space-y-4">
            <div className="panel p-4">
              <p className="label">Export workspace</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  className="button-secondary w-full sm:w-auto"
                  type="button"
                  onClick={() => exportWorkspace("csv")}
                  disabled={opsBusy}
                >
                  {opsBusy ? "Working..." : "Export CSV"}
                </button>
                <button
                  className="button-primary w-full sm:w-auto"
                  type="button"
                  onClick={() => exportWorkspace("json")}
                  disabled={opsBusy}
                >
                  {opsBusy ? "Working..." : "Export JSON snapshot"}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                CSV is for spreadsheet-style review. JSON is the restore-ready snapshot.
              </p>
            </div>

            <div className="panel p-4">
              <p className="label">Restore workspace</p>
              <div className="mt-3">
                <label className="label" htmlFor="restore-json">Snapshot file (JSON)</label>
                <input
                  id="restore-json"
                  className="input mt-1"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => setRestoreFile(event.target.files?.[0] || null)}
                />
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  className="button-secondary w-full sm:w-auto"
                  type="button"
                  onClick={() => runRestore("dry-run")}
                  disabled={opsBusy || !restoreFile}
                >
                  {opsBusy ? "Working..." : "Dry-run validate"}
                </button>
                <button
                  className="button-danger w-full sm:w-auto"
                  type="button"
                  onClick={() => runRestore("commit")}
                  disabled={opsBusy || !restoreFile}
                >
                  {opsBusy ? "Working..." : "Commit restore"}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--warn)]">
                Commit restore replaces all workspace collections with snapshot data. Always run dry-run first.
              </p>
            </div>

            {opsMessage ? <p className="text-sm text-[var(--accent-strong)]">{opsMessage}</p> : null}

            {restoreResult ? (
              <div className="panel p-4">
                <p className="label">Restore summary ({restoreResult.mode})</p>
                <p className="mt-2 text-sm text-[var(--ink-main)]">
                  Total documents: {restoreResult.summary.totalDocuments}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(restoreResult.summary.collectionCounts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([collection, count]) => (
                      <div className="rounded-xl border border-[var(--ring)] bg-white/60 px-3 py-2" key={collection}>
                        <p className="text-xs uppercase tracking-[0.08em] text-[var(--ink-soft)]">{collection}</p>
                        <p className="mt-1 text-base font-semibold text-[var(--ink-main)]">{count}</p>
                      </div>
                    ))}
                </div>
                {restoreResult.warnings.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[var(--warn)]">
                    {restoreResult.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="panel p-4">
              <p className="label">Recent backup operations</p>
              {backupsQuery.isLoading ? (
                <p className="mt-2 text-sm text-[var(--ink-soft)]">Loading history...</p>
              ) : null}
              {backupsQuery.error ? (
                <p className="mt-2 text-sm text-red-700">{(backupsQuery.error as Error).message}</p>
              ) : null}
              {(backupsQuery.data?.backups || []).length > 0 ? (
                <div className="table-wrap mt-3">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Action</th>
                        <th>Format</th>
                        <th>Mode</th>
                        <th>Status</th>
                        <th>Docs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(backupsQuery.data?.backups || []).map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatLocalDateTime(entry.createdAt)}</td>
                          <td>{entry.action}</td>
                          <td>{entry.format}</td>
                          <td>{entry.mode}</td>
                          <td>{entry.status}</td>
                          <td>{entry.totalDocuments}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-sm text-[var(--ink-soft)]">No backup operations yet.</p>
              )}
            </div>
          </div>
        </SectionPanel>
      </div>
    </ProtectedPage>
  );
}
