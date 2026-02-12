import { NextRequest } from "next/server";

import { assistantQuerySchema } from "@/lib/api/schemas";
import { withOwnerAuth } from "@/lib/api/handler";
import { runAssistantQuery } from "@/lib/mcp/orchestrator";
import { checkRateLimit } from "@/lib/mcp/rate-limit";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const limit = checkRateLimit(`assistant:${uid}`);
    if (!limit.ok) {
      return jsonError(429, "Rate limit exceeded", {
        remaining: limit.remaining,
        resetAt: new Date(limit.resetAt).toISOString()
      });
    }

    const body = await request.json();
    const parsed = assistantQuerySchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    const response = await runAssistantQuery(parsed.data.query);

    return jsonOk(response, {
      headers: {
        "x-ratelimit-remaining": String(limit.remaining),
        "x-ratelimit-reset": String(limit.resetAt)
      }
    });
  });
}
