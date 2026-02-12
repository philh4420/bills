import { NextRequest } from "next/server";
import { z } from "zod";

import { withOwnerAuth } from "@/lib/api/handler";
import { dispatchSmartAlertsForUser } from "@/lib/notifications/smart-alerts";
import { jsonOk } from "@/lib/util/http";

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    let force = false;

    try {
      const parsed = z
        .object({
          force: z.boolean().optional()
        })
        .safeParse(await request.json());
      force = parsed.success ? Boolean(parsed.data.force) : false;
    } catch {
      // Body is optional for this endpoint.
    }

    const result = await dispatchSmartAlertsForUser(uid, {
      source: "manual",
      now: new Date(),
      force
    });

    return jsonOk(result);
  });
}
