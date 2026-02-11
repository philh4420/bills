import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import {
  deletePushSubscription,
  listPushSubscriptions
} from "@/lib/firestore/repository";
import { sendWebPushNotification } from "@/lib/notifications/web-push";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const subscriptions = await listPushSubscriptions(uid);
    if (subscriptions.length === 0) {
      return jsonError(400, "No push subscriptions saved.");
    }

    const timestamp = toIsoNow();

    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await sendWebPushNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                auth: subscription.auth,
                p256dh: subscription.p256dh
              }
            },
            {
              title: "Bills App test notification",
              body: "Mobile push is set up correctly for this installed web app.",
              url: "/cards",
              tag: `bills-test-${timestamp}`
            }
          );

          return { sent: 1, failed: 0, deleted: 0 };
        } catch (error) {
          const statusCode =
            typeof error === "object" && error !== null && "statusCode" in error
              ? Number((error as { statusCode?: unknown }).statusCode)
              : null;

          if (statusCode === 404 || statusCode === 410) {
            await deletePushSubscription(uid, subscription.endpoint);
            return { sent: 0, failed: 1, deleted: 1 };
          }

          return { sent: 0, failed: 1, deleted: 0 };
        }
      })
    );

    const summary = results.reduce(
      (acc, result) => ({
        sent: acc.sent + result.sent,
        failed: acc.failed + result.failed,
        deleted: acc.deleted + result.deleted
      }),
      { sent: 0, failed: 0, deleted: 0 }
    );

    return jsonOk({
      ok: true,
      ...summary
    });
  });
}
