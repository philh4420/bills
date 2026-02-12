import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import {
  getRestorableCollectionKeys,
  summarizeSnapshot,
  validateBackupSnapshot
} from "@/lib/backup/snapshot";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import {
  createBackupRecord,
  replaceCollectionFromArray
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";

export const runtime = "nodejs";

type RestoreMode = "dry-run" | "commit";

function parseRestoreMode(value: unknown): RestoreMode {
  if (value === "commit") {
    return "commit";
  }
  return "dry-run";
}

function parseSnapshotInput(value: unknown): unknown {
  if (value && typeof value === "object" && "snapshot" in (value as Record<string, unknown>)) {
    return (value as { snapshot?: unknown }).snapshot;
  }
  return value;
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid, email }) => {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON payload.");
    }

    const mode = parseRestoreMode((rawBody as { mode?: unknown })?.mode);
    const snapshotRaw = parseSnapshotInput(rawBody);
    const parsed = validateBackupSnapshot(snapshotRaw);
    if (!parsed.ok || !parsed.snapshot) {
      return jsonError(400, "Invalid restore snapshot.", {
        errors: parsed.errors.slice(0, 50)
      });
    }

    const summary = summarizeSnapshot(parsed.snapshot);
    const warnings: string[] = [];

    if (parsed.snapshot.exportedByUid !== uid) {
      warnings.push("Snapshot owner UID differs from current owner; applying to current owner workspace.");
    }

    if (mode === "dry-run") {
      await createBackupRecord(uid, {
        action: "restore",
        status: "success",
        format: "snapshot",
        mode,
        createdAt: toIsoNow(),
        totalDocuments: summary.totalDocuments,
        collectionCounts: summary.collectionCounts,
        message: "Dry-run validation completed."
      }).catch(() => {
        // Dry-run should still return success if metadata write fails.
      });

      return jsonOk({
        ok: true,
        mode,
        summary,
        warnings
      });
    }

    const now = toIsoNow();

    try {
      const profile = parsed.snapshot.profile || {};
      await getFirebaseAdminFirestore()
        .collection("users")
        .doc(uid)
        .set({
          ...profile,
          uid,
          email,
          updatedAt: now,
          createdAt:
            typeof profile.createdAt === "string" && profile.createdAt.length > 0
              ? profile.createdAt
              : now
        });

      for (const collection of getRestorableCollectionKeys()) {
        const rows = parsed.snapshot.collections[collection] || [];
        await replaceCollectionFromArray(
          uid,
          collection,
          rows.map((row) => ({
            id: row.id,
            ...row.data
          })),
          (item) => (item as { id: string }).id
        );
      }

      await createBackupRecord(uid, {
        action: "restore",
        status: "success",
        format: "snapshot",
        mode,
        createdAt: now,
        totalDocuments: summary.totalDocuments,
        collectionCounts: summary.collectionCounts,
        message: `Restore committed from snapshot exported at ${parsed.snapshot.exportedAt}.`
      }).catch(() => {
        // Restore commit should not fail because backup metadata write fails.
      });

      return jsonOk({
        ok: true,
        mode,
        summary,
        warnings
      });
    } catch (error) {
      await createBackupRecord(uid, {
        action: "restore",
        status: "failed",
        format: "snapshot",
        mode,
        createdAt: now,
        totalDocuments: summary.totalDocuments,
        collectionCounts: summary.collectionCounts,
        message: error instanceof Error ? error.message : "Restore failed"
      }).catch(() => {
        // Ignore metadata write failures in error path.
      });

      return jsonError(500, "Restore failed", error instanceof Error ? error.message : error);
    }
  });
}
