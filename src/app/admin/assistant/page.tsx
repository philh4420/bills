"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";

interface HealthResponse {
  overallOk: boolean;
  providers: Array<{ provider: string; ok: boolean; status: number; detail: string }>;
}

interface AssistantResponse {
  answer: string;
  degraded: boolean;
  providerResults: Array<{
    provider: "context7" | "google-dev-knowledge";
    ok: boolean;
    summary: string;
    sources: string[];
    latencyMs: number;
    errorCode?: string;
  }>;
}

export default function AdminAssistantPage() {
  const { getIdToken } = useAuth();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const health = useQuery({
    queryKey: ["assistant-health"],
    queryFn: () => authedRequest<HealthResponse>(getIdToken, "/api/admin/assistant/health")
  });

  async function submit() {
    if (!query.trim()) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await authedRequest<AssistantResponse>(getIdToken, "/api/admin/assistant", {
        method: "POST",
        body: JSON.stringify({ query })
      });

      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedPage title="Admin Assistant">
      <div className="space-y-4">
        <SectionPanel
          title="Provider health"
          subtitle="Checks remote MCP endpoints used by the admin copilot."
          right={
            <button className="button-secondary" type="button" onClick={() => health.refetch()}>
              Recheck
            </button>
          }
        >
          {health.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Checking provider reachability...</p> : null}
          {health.error ? <p className="text-sm text-red-700">{(health.error as Error).message}</p> : null}

          {(health.data?.providers || []).map((provider) => (
            <div className="panel mb-2 p-3" key={provider.provider}>
              <p className="text-sm font-medium">{provider.provider}</p>
              <p className="text-sm text-[var(--ink-soft)]">
                {provider.ok ? "OK" : "Degraded"} · status {provider.status || "n/a"} · {provider.detail}
              </p>
            </div>
          ))}
        </SectionPanel>

        <SectionPanel title="Ask admin copilot" subtitle="Runs the same prompt against both MCP providers in parallel.">
          <div className="space-y-3">
            <textarea
              className="input min-h-28"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Example: Review Next.js + Firestore deployment config for this app"
            />
            <button className="button-primary" disabled={busy} type="button" onClick={() => submit()}>
              {busy ? "Running..." : "Run Query"}
            </button>

            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </div>
        </SectionPanel>

        {result ? (
          <SectionPanel title="Response" subtitle={result.degraded ? "Degraded (partial provider failures)" : "Healthy"}>
            <pre className="whitespace-pre-wrap text-sm text-[var(--ink-main)]">{result.answer}</pre>

            <div className="mt-4 space-y-2">
              {result.providerResults.map((provider) => (
                <div className="panel p-3" key={provider.provider}>
                  <p className="text-sm font-medium">
                    {provider.provider} · {provider.ok ? "ok" : `failed (${provider.errorCode || "error"})`} ·
                    {` ${provider.latencyMs}ms`}
                  </p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">{provider.summary}</p>
                  {provider.sources.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-[var(--ink-soft)]">
                      {provider.sources.map((source) => (
                        <li key={source}>{source}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionPanel>
        ) : null}
      </div>
    </ProtectedPage>
  );
}
