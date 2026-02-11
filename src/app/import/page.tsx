"use client";

import { useState } from "react";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { useAuth } from "@/lib/auth/client";
import { authedRequest } from "@/lib/api/client";

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

export default function ImportPage() {
  const { getIdToken } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

            <div className="flex flex-wrap gap-2">
              <button className="button-secondary" disabled={busy || !file} type="button" onClick={() => run(false)}>
                {busy ? "Working..." : "Preview"}
              </button>
              <button className="button-primary" disabled={busy || !file} type="button" onClick={() => run(true)}>
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
      </div>
    </ProtectedPage>
  );
}
