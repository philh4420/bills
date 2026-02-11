import { NextRequest } from "next/server";

import { computeUpcomingDueDate, formatDueDateLabel } from "@/lib/cards/due-date";
import {
  deletePushSubscription,
  listCardAccounts,
  listPushSubscriptions
} from "@/lib/firestore/repository";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { sendWebPushNotification } from "@/lib/notifications/web-push";
import { jsonError, jsonOk } from "@/lib/util/http";

export const runtime = "nodejs";

const FALLBACK_REMINDER_OFFSETS = [7, 1, 0];

function parseReminderOffsets(): number[] {
  const raw = process.env.CARD_REMINDER_OFFSETS?.trim();
  if (!raw) {
    return FALLBACK_REMINDER_OFFSETS;
  }

  const parsed = raw
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 31);

  if (parsed.length === 0) {
    return FALLBACK_REMINDER_OFFSETS;
  }

  return Array.from(new Set(parsed)).sort((a, b) => b - a);
}

function hasValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("CRON_SECRET is not configured.");
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function resolveOwnerUid(): Promise<string | null> {
  const ownerUid = process.env.OWNER_UID?.trim();
  if (ownerUid) {
    return ownerUid;
  }

  const ownerEmail = process.env.OWNER_GOOGLE_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    return null;
  }

  const snap = await getFirebaseAdminFirestore()
    .collection("users")
    .where("email", "==", ownerEmail)
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  return snap.docs[0]?.id || null;
}

function createReminderPayload(
  cards: Array<{ name: string; daysUntil: number; dueDate: string }>
): { title: string; body: string } {
  if (cards.length === 1) {
    const card = cards[0];
    const suffix = card.daysUntil === 0 ? "today" : `in ${card.daysUntil} day${card.daysUntil === 1 ? "" : "s"}`;
    return {
      title: `${card.name} payment due ${suffix}`,
      body: `Due on ${formatDueDateLabel(card.dueDate)}.`
    };
  }

  const headline = cards
    .slice(0, 3)
    .map((card) => {
      if (card.daysUntil === 0) {
        return `${card.name} today`;
      }
      return `${card.name} in ${card.daysUntil}d`;
    })
    .join(", ");

  const extra = cards.length > 3 ? ` +${cards.length - 3} more` : "";

  return {
    title: `${cards.length} card payments coming up`,
    body: `${headline}${extra}`
  };
}

async function runReminderJob(request: NextRequest) {
  try {
    if (!hasValidCronSecret(request)) {
      return jsonError(401, "Unauthorized cron request.");
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return jsonError(500, "Cron secret is missing.", { details });
  }

  const ownerUid = await resolveOwnerUid();
  if (!ownerUid) {
    return jsonError(500, "Owner account is not configured.");
  }

  const [cards, subscriptions] = await Promise.all([
    listCardAccounts(ownerUid),
    listPushSubscriptions(ownerUid)
  ]);

  if (subscriptions.length === 0) {
    return jsonOk({
      ok: true,
      sent: 0,
      failed: 0,
      deleted: 0,
      reason: "No push subscriptions saved."
    });
  }

  const reminderOffsets = parseReminderOffsets();
  const reminderSet = new Set(reminderOffsets);

  const dueCards = cards
    .filter((card) => Number.isInteger(card.dueDayOfMonth) && (card.dueDayOfMonth ?? 0) > 0)
    .map((card) => {
      const due = computeUpcomingDueDate(card.dueDayOfMonth ?? 1);
      return {
        id: card.id,
        name: card.name,
        dueDayOfMonth: card.dueDayOfMonth ?? null,
        dueDate: due.isoDate,
        daysUntil: due.daysUntil
      };
    })
    .filter((card) => reminderSet.has(card.daysUntil))
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));

  if (dueCards.length === 0) {
    return jsonOk({
      ok: true,
      sent: 0,
      failed: 0,
      deleted: 0,
      reason: "No cards match reminder offsets today.",
      reminderOffsets
    });
  }

  const payload = createReminderPayload(dueCards);
  const nowTag = new Date().toISOString().slice(0, 10);
  const fullPayload = {
    ...payload,
    tag: `cards-due-${nowTag}`,
    url: "/cards",
    cards: dueCards.map((card) => ({
      id: card.id,
      name: card.name,
      dueDate: card.dueDate,
      daysUntil: card.daysUntil
    }))
  };

  let sent = 0;
  let failed = 0;
  let deleted = 0;

  await Promise.all(
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
          fullPayload
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : null;

        if (statusCode === 404 || statusCode === 410) {
          await deletePushSubscription(ownerUid, subscription.endpoint);
          deleted += 1;
        }
      }
    })
  );

  return jsonOk({
    ok: true,
    sent,
    failed,
    deleted,
    dueCards: dueCards.map((card) => ({
      name: card.name,
      dueDate: card.dueDate,
      daysUntil: card.daysUntil
    })),
    reminderOffsets
  });
}

export async function GET(request: NextRequest) {
  return runReminderJob(request);
}

export async function POST(request: NextRequest) {
  return runReminderJob(request);
}
