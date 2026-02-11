import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import {
  pushSubscriptionDeleteSchema,
  pushSubscriptionUpsertSchema
} from "@/lib/api/schemas";
import {
  deletePushSubscription,
  listPushSubscriptions,
  upsertPushSubscription
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const subscriptions = await listPushSubscriptions(uid);
    return jsonOk({
      subscriptions: subscriptions.map((entry) => ({
        id: entry.id,
        endpoint: entry.endpoint,
        updatedAt: entry.updatedAt
      }))
    });
  });
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const body = await request.json();
    const parsed = pushSubscriptionUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid push subscription payload", formatZodError(parsed.error));
    }

    const now = toIsoNow();
    const existing = (await listPushSubscriptions(uid)).find(
      (entry) => entry.endpoint === parsed.data.subscription.endpoint
    );

    const id = await upsertPushSubscription(uid, {
      endpoint: parsed.data.subscription.endpoint,
      auth: parsed.data.subscription.keys.auth,
      p256dh: parsed.data.subscription.keys.p256dh,
      userAgent: parsed.data.userAgent?.trim() || existing?.userAgent,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });

    return jsonOk({ ok: true, id });
  });
}

export async function DELETE(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const body = await request.json();
    const parsed = pushSubscriptionDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid push subscription delete payload", formatZodError(parsed.error));
    }

    await deletePushSubscription(uid, parsed.data.endpoint);
    return jsonOk({ ok: true });
  });
}
