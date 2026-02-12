import { NextRequest } from "next/server";

import { dispatchSmartAlertsForUser } from "@/lib/notifications/smart-alerts";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { jsonError, jsonOk } from "@/lib/util/http";

export const runtime = "nodejs";

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

  const result = await dispatchSmartAlertsForUser(ownerUid, {
    source: "cron",
    now: new Date()
  });

  return jsonOk(result);
}

export async function GET(request: NextRequest) {
  return runReminderJob(request);
}

export async function POST(request: NextRequest) {
  return runReminderJob(request);
}
