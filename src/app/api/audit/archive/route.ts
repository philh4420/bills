import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";

export const runtime = "nodejs";

function clampLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? 250), 10);
  if (!Number.isInteger(parsed)) {
    return 250;
  }
  return Math.min(Math.max(parsed, 1), 2000);
}

async function safeCount(uid: string, collectionName: string): Promise<number> {
  const snap = await getFirebaseAdminFirestore()
    .collection("users")
    .doc(uid)
    .collection(collectionName)
    .get();
  return snap.size;
}

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const [activeCount, archiveCount] = await Promise.all([
      safeCount(uid, COLLECTIONS.auditEvents),
      safeCount(uid, COLLECTIONS.auditEventsArchive)
    ]);

    return jsonOk({
      activeCount,
      archiveCount
    });
  });
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const bodyRecord = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const dryRun = bodyRecord.dryRun === true;
    const before = typeof bodyRecord.before === "string" && bodyRecord.before ? bodyRecord.before : toIsoNow();
    const limit = clampLimit(bodyRecord.limit);

    const db = getFirebaseAdminFirestore();
    const userRef = db.collection("users").doc(uid);
    const source = userRef.collection(COLLECTIONS.auditEvents);
    const archive = userRef.collection(COLLECTIONS.auditEventsArchive);

    let candidates;
    try {
      candidates = await source.where("createdAt", "<", before).orderBy("createdAt", "asc").limit(limit).get();
    } catch (error) {
      return jsonError(400, "Invalid archive parameters.", error instanceof Error ? error.message : error);
    }

    const eligibleCount = candidates.size;
    if (dryRun) {
      return jsonOk({
        dryRun: true,
        before,
        limit,
        eligibleCount
      });
    }

    const batch = db.batch();
    const archivedAt = toIsoNow();
    candidates.docs.forEach((doc) => {
      batch.set(archive.doc(doc.id), {
        ...doc.data(),
        archivedAt
      });
      batch.delete(doc.ref);
    });
    await batch.commit();

    return jsonOk({
      dryRun: false,
      before,
      limit,
      archivedCount: eligibleCount
    });
  });
}
