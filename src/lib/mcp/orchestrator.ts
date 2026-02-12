import { AssistantResponse } from "@/types";

import { callProvider, providerConfigs } from "@/lib/mcp/client";

export async function runAssistantQuery(query: string): Promise<AssistantResponse> {
  const configs = providerConfigs();
  const results = await Promise.allSettled(configs.map((config) => callProvider(config, query)));

  const providerResults = results.map((result, idx) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      provider: configs[idx].provider,
      ok: false,
      summary: result.reason instanceof Error ? result.reason.message : "Unknown provider failure",
      sources: [] as string[],
      latencyMs: 0,
      errorCode: "UNHANDLED"
    };
  });

  const successful = providerResults.filter((result) => result.ok);
  const failed = providerResults.filter((result) => !result.ok);

  const answer = successful.length
    ? successful.map((result) => `[${result.provider}] ${result.summary}`).join("\n\n")
    : "All providers failed for this request.";

  return {
    answer,
    degraded: failed.length > 0,
    providerResults
  };
}

export async function healthcheckProviders(): Promise<{
  overallOk: boolean;
  providers: Array<{ provider: string; ok: boolean; status: number; detail: string }>;
}> {
  const configs = providerConfigs();

  const checks = await Promise.all(
    configs.map(async (config) => {
      if (!config.url) {
        return { provider: config.provider, ok: false, status: 0, detail: "Missing URL" };
      }

      try {
        const response = await fetch(config.url, {
          method: "GET",
          headers: {
            ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
          }
        });

        return {
          provider: config.provider,
          ok: response.ok,
          status: response.status,
          detail: response.ok ? "reachable" : `HTTP ${response.status}`
        };
      } catch (error) {
        return {
          provider: config.provider,
          ok: false,
          status: 0,
          detail: error instanceof Error ? error.message : "Network error"
        };
      }
    })
  );

  return {
    overallOk: checks.every((entry) => entry.ok),
    providers: checks
  };
}
