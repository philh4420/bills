import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import {
  deletePushSubscription,
  listPushSubscriptions
} from "@/lib/firestore/repository";
import { jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const subscriptions = await listPushSubscriptions(uid);
    const activeSubscriptions = [];
    let autoCleaned = 0;

    for (const entry of subscriptions) {
      if (entry.endpointHealth === "stale") {
        await deletePushSubscription(uid, entry.endpoint);
        autoCleaned += 1;
        continue;
      }
      activeSubscriptions.push(entry);
    }

    const summary = activeSubscriptions.reduce(
      (acc, entry) => {
        if (entry.endpointHealth === "degraded") {
          acc.degraded += 1;
        } else if (entry.endpointHealth === "stale") {
          acc.stale += 1;
        } else {
          acc.healthy += 1;
        }
        return acc;
      },
      {
        total: activeSubscriptions.length,
        healthy: 0,
        degraded: 0,
        stale: 0,
        autoCleaned
      }
    );

    return jsonOk({
      summary,
      subscriptions: activeSubscriptions.map((entry) => ({
        id: entry.id,
        endpoint: entry.endpoint,
        endpointSuffix: entry.endpoint.slice(-18),
        endpointHealth: entry.endpointHealth || "healthy",
        failureCount: entry.failureCount ?? 0,
        lastSuccessAt: entry.lastSuccessAt ?? null,
        lastFailureAt: entry.lastFailureAt ?? null,
        lastFailureReason: entry.lastFailureReason ?? null,
        updatedAt: entry.updatedAt,
        userAgent: entry.userAgent || null
      }))
    });
  });
}
