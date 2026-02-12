import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { healthcheckProviders } from "@/lib/mcp/orchestrator";
import { jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async () => {
    const health = await healthcheckProviders();
    return jsonOk(health, { status: health.overallOk ? 200 : 503 });
  });
}
