import { NextRequest } from "next/server";
import { z } from "zod";

import { withOwnerAuth } from "@/lib/api/handler";
import {
  deletePushSubscription,
  listPushSubscriptions,
  updatePushSubscription
} from "@/lib/firestore/repository";
import { sendWebPushNotification } from "@/lib/notifications/web-push";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";

export const runtime = "nodejs";

function parsePushErrorStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return null;
  }
  const raw = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isFinite(raw) ? raw : null;
}

function parsePushErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message || "Push send failed");
  }
  return "Push send failed";
}

async function bestEffortUpdatePushDiagnostics(
  uid: string,
  subscriptionId: string,
  payload: Parameters<typeof updatePushSubscription>[2]
): Promise<void> {
  try {
    await updatePushSubscription(uid, subscriptionId, payload);
  } catch {
    // Diagnostics updates should not break test route responses.
  }
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    let targetEndpoint: string | null = null;
    try {
      const parsed = z
        .object({
          endpoint: z.url().optional()
        })
        .safeParse(await request.json());
      if (parsed.success) {
        targetEndpoint = parsed.data.endpoint || null;
      }
    } catch {
      // Body is optional for this endpoint.
    }

    const subscriptions = await listPushSubscriptions(uid);
    if (subscriptions.length === 0) {
      return jsonError(400, "No push subscriptions saved.");
    }

    const targetSubscriptions = targetEndpoint
      ? subscriptions.filter((entry) => entry.endpoint === targetEndpoint)
      : subscriptions;

    if (targetSubscriptions.length === 0) {
      return jsonError(404, "The current device push subscription was not found on the server.");
    }

    const timestamp = toIsoNow();

    const results = await Promise.all(
      targetSubscriptions.map(async (subscription) => {
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
              tag: `bills-test-${timestamp}`,
              badgeCount: 1
            }
          );
          const successAt = toIsoNow();
          await bestEffortUpdatePushDiagnostics(uid, subscription.id, {
            lastSuccessAt: successAt,
            lastFailureAt: null,
            lastFailureReason: null,
            endpointHealth: "healthy",
            failureCount: 0,
            updatedAt: successAt
          });

          return {
            sent: 1,
            failed: 0,
            deleted: 0,
            detail: null as null | { endpoint: string; statusCode: number | null; message: string }
          };
        } catch (error) {
          const statusCode = parsePushErrorStatusCode(error);
          const message = parsePushErrorMessage(error);
          const failureAt = toIsoNow();
          const nextFailureCount = (subscription.failureCount ?? 0) + 1;
          const reason =
            `${statusCode ?? "error"} ${message}`.trim().slice(0, 240) || "push send failed";

          if (statusCode === 404 || statusCode === 410) {
            await bestEffortUpdatePushDiagnostics(uid, subscription.id, {
              lastFailureAt: failureAt,
              lastFailureReason: reason,
              endpointHealth: "stale",
              failureCount: nextFailureCount,
              updatedAt: failureAt
            });
            await deletePushSubscription(uid, subscription.endpoint);
            return {
              sent: 0,
              failed: 1,
              deleted: 1,
              detail: {
                endpoint: subscription.endpoint,
                statusCode,
                message
              }
            };
          }

          await bestEffortUpdatePushDiagnostics(uid, subscription.id, {
            lastFailureAt: failureAt,
            lastFailureReason: reason,
            endpointHealth: "degraded",
            failureCount: nextFailureCount,
            updatedAt: failureAt
          });

          return {
            sent: 0,
            failed: 1,
            deleted: 0,
            detail: {
              endpoint: subscription.endpoint,
              statusCode,
              message
            }
          };
        }
      })
    );

    const summary = results.reduce(
      (acc, result) => ({
        sent: acc.sent + result.sent,
        failed: acc.failed + result.failed,
        deleted: acc.deleted + result.deleted,
        details: result.detail ? [...acc.details, result.detail] : acc.details
      }),
      {
        sent: 0,
        failed: 0,
        deleted: 0,
        details: [] as Array<{ endpoint: string; statusCode: number | null; message: string }>
      }
    );

    return jsonOk({
      ok: true,
      targeted: targetSubscriptions.length,
      sent: summary.sent,
      failed: summary.failed,
      deleted: summary.deleted,
      details: summary.details.slice(0, 5)
    });
  });
}
