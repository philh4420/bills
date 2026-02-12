import { ProviderResult } from "@/types";

interface ProviderConfig {
  provider: ProviderResult["provider"];
  url: string | undefined;
  apiKey: string | undefined;
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function summarizeText(input: string): string {
  const clean = input.replace(/\s+/g, " ").trim();
  return clean.slice(0, 600);
}

function parseSourcesFromBody(body: unknown): string[] {
  if (typeof body !== "object" || body === null) {
    return [];
  }

  const maybeSources = (body as Record<string, unknown>).sources;
  if (!Array.isArray(maybeSources)) {
    return [];
  }

  return maybeSources.filter((entry): entry is string => typeof entry === "string").slice(0, 10);
}

export async function callProvider(config: ProviderConfig, query: string): Promise<ProviderResult> {
  const start = Date.now();

  if (!config.url) {
    return {
      provider: config.provider,
      ok: false,
      summary: "Provider URL is not configured.",
      sources: [],
      latencyMs: Date.now() - start,
      errorCode: "MISSING_URL"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify({ query }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await safeText(response);
      return {
        provider: config.provider,
        ok: false,
        summary: `HTTP ${response.status}: ${summarizeText(text) || "empty response"}`,
        sources: [],
        latencyMs: Date.now() - start,
        errorCode: `HTTP_${response.status}`
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as Record<string, unknown>;
      const summaryField =
        typeof body.summary === "string"
          ? body.summary
          : typeof body.answer === "string"
            ? body.answer
            : JSON.stringify(body);

      return {
        provider: config.provider,
        ok: true,
        summary: summarizeText(summaryField),
        sources: parseSourcesFromBody(body),
        latencyMs: Date.now() - start
      };
    }

    const text = await safeText(response);
    return {
      provider: config.provider,
      ok: true,
      summary: summarizeText(text),
      sources: [],
      latencyMs: Date.now() - start
    };
  } catch (error) {
    clearTimeout(timeout);
    const errorCode = error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "NETWORK";

    return {
      provider: config.provider,
      ok: false,
      summary: error instanceof Error ? error.message : "Unknown provider error",
      sources: [],
      latencyMs: Date.now() - start,
      errorCode
    };
  }
}

export function providerConfigs(): ProviderConfig[] {
  return [
    {
      provider: "context7",
      url: process.env.MCP_CONTEXT7_URL,
      apiKey: process.env.MCP_CONTEXT7_API_KEY
    },
    {
      provider: "google-dev-knowledge",
      url: process.env.MCP_GOOGLE_DEV_URL,
      apiKey: process.env.MCP_GOOGLE_DEV_API_KEY
    }
  ];
}
