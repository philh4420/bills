import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { pushSubscriptionRepairSchema } from "@/lib/api/schemas";
import {
  deletePushSubscription,
  listPushSubscriptions,
  updatePushSubscription
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = pushSubscriptionRepairSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid push subscription repair payload", formatZodError(parsed.error));
    }

    const subscriptions = await listPushSubscriptions(uid);
    if (subscriptions.length === 0) {
      return jsonOk({
        ok: true,
        targeted: 0,
        repaired: 0,
        removedStale: 0,
        message: "No push subscriptions saved."
      });
    }

    const endpoint = parsed.data.endpoint || null;
    const targetSubscriptions = endpoint
      ? subscriptions.filter((entry) => entry.endpoint === endpoint)
      : subscriptions;

    if (endpoint && targetSubscriptions.length === 0) {
      return jsonError(404, "Push subscription not found on the server.");
    }

    let repaired = 0;
    let removedStale = 0;
    const now = toIsoNow();

    for (const entry of targetSubscriptions) {
      if (entry.endpointHealth === "stale") {
        await deletePushSubscription(uid, entry.endpoint);
        removedStale += 1;
        continue;
      }

      await updatePushSubscription(uid, entry.id, {
        endpointHealth: "healthy",
        failureCount: 0,
        lastFailureAt: null,
        lastFailureReason: null,
        updatedAt: now
      });
      repaired += 1;
    }

    return jsonOk({
      ok: true,
      targeted: targetSubscriptions.length,
      repaired,
      removedStale
    });
  });
}
