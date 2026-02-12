import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import {
  readWorkspaceBackupSnapshot,
  snapshotToCsv
} from "@/lib/backup/snapshot";
import { createBackupRecord } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError } from "@/lib/util/http";

export const runtime = "nodejs";

type ExportFormat = "csv" | "json";

function parseFormat(value: string | null): ExportFormat {
  return value === "csv" ? "csv" : "json";
}

function downloadName(format: ExportFormat): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `bills-backup-${stamp}.${format}`;
}

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const format = parseFormat(request.nextUrl.searchParams.get("format"));
    const snapshot = await readWorkspaceBackupSnapshot(uid);
    const summaryCounts = Object.fromEntries(
      Object.entries(snapshot.collections).map(([key, rows]) => [key, rows.length])
    );
    const totalDocuments = Object.values(summaryCounts).reduce((acc, count) => acc + count, 0);

    try {
      await createBackupRecord(uid, {
        action: "export",
        status: "success",
        format,
        mode: "commit",
        createdAt: toIsoNow(),
        totalDocuments,
        collectionCounts: summaryCounts
      });
    } catch {
      // Export should still succeed even if metadata write fails.
    }

    if (format === "csv") {
      return new Response(snapshotToCsv(snapshot), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${downloadName("csv")}"`
        }
      });
    }

    return new Response(JSON.stringify(snapshot, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${downloadName("json")}"`
      }
    });
  }).catch((error) => {
    return jsonError(500, "Export failed", error instanceof Error ? error.message : error);
  });
}
