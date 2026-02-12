import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { listBackups } from "@/lib/firestore/repository";
import { jsonOk } from "@/lib/util/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const backups = await listBackups(uid);
    return jsonOk({
      backups: backups.map((entry) => ({
        id: entry.id,
        action: entry.action,
        status: entry.status,
        format: entry.format,
        mode: entry.mode,
        createdAt: entry.createdAt,
        totalDocuments: entry.totalDocuments,
        collectionCounts: entry.collectionCounts,
        message: entry.message || null
      }))
    });
  });
}
