import { DocumentData } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { COLLECTIONS, CollectionKey } from "@/lib/firestore/collections";
import { toIsoNow } from "@/lib/util/dates";

export type RestorableCollectionKey = Exclude<CollectionKey, "backups">;

export interface BackupSnapshotDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface WorkspaceBackupSnapshot {
  version: 1;
  exportedAt: string;
  exportedByUid: string;
  profile: Record<string, unknown> | null;
  collections: Record<RestorableCollectionKey, BackupSnapshotDocument[]>;
}

export interface SnapshotSummary {
  totalDocuments: number;
  collectionCounts: Record<string, number>;
  hasUserProfile: boolean;
}

const RESTORABLE_COLLECTION_KEYS = (Object.keys(COLLECTIONS) as CollectionKey[])
  .filter((key) => key !== "backups")
  .sort((a, b) => a.localeCompare(b)) as RestorableCollectionKey[];

function toSerializableValue(input: unknown): unknown {
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean"
  ) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((entry) => toSerializableValue(entry));
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (input && typeof input === "object") {
    const maybeDateFactory = (input as { toDate?: () => Date }).toDate;
    if (typeof maybeDateFactory === "function") {
      try {
        const date = maybeDateFactory();
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch {
        // Fall through to object traversal.
      }
    }

    const out: Record<string, unknown> = {};
    Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }
      out[key] = toSerializableValue(value);
    });
    return out;
  }

  return String(input);
}

function sortRows(rows: BackupSnapshotDocument[]): BackupSnapshotDocument[] {
  return rows.slice().sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function getRestorableCollectionKeys(): RestorableCollectionKey[] {
  return RESTORABLE_COLLECTION_KEYS.slice();
}

export async function readWorkspaceBackupSnapshot(uid: string): Promise<WorkspaceBackupSnapshot> {
  const db = getFirebaseAdminFirestore();
  const userRef = db.collection("users").doc(uid);

  const [profileDoc, ...collectionSnaps] = await Promise.all([
    userRef.get(),
    ...RESTORABLE_COLLECTION_KEYS.map((key) => userRef.collection(COLLECTIONS[key]).get())
  ]);

  const profile = profileDoc.exists
    ? (toSerializableValue(profileDoc.data() as DocumentData) as Record<string, unknown>)
    : null;

  const collections = {} as Record<RestorableCollectionKey, BackupSnapshotDocument[]>;
  RESTORABLE_COLLECTION_KEYS.forEach((key, index) => {
    const snap = collectionSnaps[index];
    const rows = snap.docs.map((doc) => ({
      id: doc.id,
      data: toSerializableValue(doc.data()) as Record<string, unknown>
    }));
    collections[key] = sortRows(rows);
  });

  return {
    version: 1,
    exportedAt: toIsoNow(),
    exportedByUid: uid,
    profile,
    collections
  };
}

export function summarizeSnapshot(snapshot: WorkspaceBackupSnapshot): SnapshotSummary {
  const collectionCounts = Object.fromEntries(
    getRestorableCollectionKeys().map((key) => [key, snapshot.collections[key]?.length || 0])
  );
  const totalDocuments = Object.values(collectionCounts).reduce((acc, count) => acc + count, 0);
  return {
    totalDocuments,
    collectionCounts,
    hasUserProfile: Boolean(snapshot.profile)
  };
}

export function snapshotToCsv(snapshot: WorkspaceBackupSnapshot): string {
  function csvCell(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, "\"\"")}"`;
    }
    return value;
  }

  const lines: string[] = ["collection,documentId,json"];

  getRestorableCollectionKeys().forEach((collectionKey) => {
    const rows = snapshot.collections[collectionKey] || [];
    rows.forEach((row) => {
      lines.push(
        [collectionKey, row.id, JSON.stringify(row.data)].map((value) => csvCell(String(value))).join(",")
      );
    });
  });

  if (snapshot.profile) {
    lines.push(
      ["profile", "users/" + snapshot.exportedByUid, JSON.stringify(snapshot.profile)]
        .map((value) => csvCell(value))
        .join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

export function validateBackupSnapshot(input: unknown): {
  ok: boolean;
  errors: string[];
  snapshot?: WorkspaceBackupSnapshot;
} {
  const root = normalizeRecord(input);
  if (!root) {
    return { ok: false, errors: ["snapshot must be an object"] };
  }

  const errors: string[] = [];

  if (root.version !== 1) {
    errors.push("snapshot.version must be 1");
  }

  if (typeof root.exportedByUid !== "string" || root.exportedByUid.length === 0) {
    errors.push("snapshot.exportedByUid must be a non-empty string");
  }

  if (typeof root.exportedAt !== "string" || root.exportedAt.length === 0) {
    errors.push("snapshot.exportedAt must be a non-empty string");
  }

  const collectionsRoot = normalizeRecord(root.collections);
  if (!collectionsRoot) {
    errors.push("snapshot.collections must be an object");
  }

  const profileRaw = root.profile;
  if (profileRaw !== null && profileRaw !== undefined && !normalizeRecord(profileRaw)) {
    errors.push("snapshot.profile must be an object or null");
  }

  const collections = {} as Record<RestorableCollectionKey, BackupSnapshotDocument[]>;

  if (collectionsRoot) {
    getRestorableCollectionKeys().forEach((key) => {
      const value = collectionsRoot[key];
      if (!Array.isArray(value)) {
        errors.push(`snapshot.collections.${key} must be an array`);
        collections[key] = [];
        return;
      }

      const rows: BackupSnapshotDocument[] = [];
      value.forEach((entry, index) => {
        const row = normalizeRecord(entry);
        if (!row) {
          errors.push(`snapshot.collections.${key}[${index}] must be an object`);
          return;
        }

        if (typeof row.id !== "string" || row.id.length === 0) {
          errors.push(`snapshot.collections.${key}[${index}].id must be a non-empty string`);
          return;
        }

        const data = normalizeRecord(row.data);
        if (!data) {
          errors.push(`snapshot.collections.${key}[${index}].data must be an object`);
          return;
        }

        rows.push({
          id: row.id,
          data: toSerializableValue(data) as Record<string, unknown>
        });
      });

      collections[key] = sortRows(rows);
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    snapshot: {
      version: 1,
      exportedByUid: root.exportedByUid as string,
      exportedAt: root.exportedAt as string,
      profile: normalizeRecord(profileRaw) ? (toSerializableValue(profileRaw) as Record<string, unknown>) : null,
      collections
    }
  };
}
