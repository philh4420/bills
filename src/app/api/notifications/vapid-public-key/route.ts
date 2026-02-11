import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { getWebPushPublicKey } from "@/lib/notifications/web-push";
import { jsonError, jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async () => {
    try {
      const publicKey = getWebPushPublicKey();
      return jsonOk({ publicKey });
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown error";
      return jsonError(500, "Web push is not configured.", { details });
    }
  });
}
