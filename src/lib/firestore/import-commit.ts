import { randomUUID, createHash } from "crypto";

import { APP_LOCALE, APP_TIMEZONE } from "@/lib/util/constants";
import { toIsoNow } from "@/lib/util/dates";
import {
  replaceCollectionFromArray,
  saveImportRecord,
  upsertUserProfile
} from "@/lib/firestore/repository";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import { ImportedWorkbookSnapshot, ImportSummary } from "@/types";

function toCardId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function commitWorkbookImport(params: {
  uid: string;
  email: string;
  fileName: string;
  fileBuffer: Buffer;
  snapshot: ImportedWorkbookSnapshot;
  summary: ImportSummary;
}): Promise<{ importId: string; sha256: string }> {
  const { uid, email, fileName, fileBuffer, snapshot, summary } = params;
  const now = toIsoNow();

  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");

  await upsertUserProfile({
    uid,
    email,
    locale: APP_LOCALE,
    timezone: APP_TIMEZONE,
    createdAt: now,
    updatedAt: now
  });

  const cardsWithId = snapshot.cardAccounts.map((card) => {
    const id = toCardId(card.name);
    return {
      id,
      name: card.name,
      limit: card.limit,
      usedLimit: card.usedLimit,
      interestRateApr: card.interestRateApr ?? 0,
      dueDayOfMonth: card.dueDayOfMonth ?? null,
      createdAt: now,
      updatedAt: now
    };
  });

  const cardNameToId = new Map(cardsWithId.map((card) => [card.name, card.id]));

  await replaceCollectionFromArray(uid, "cardAccounts", cardsWithId, (item) => item.id ?? randomUUID());

  await replaceCollectionFromArray(
    uid,
    "monthlyCardPayments",
    snapshot.monthlyPayments.map((entry) => {
      const byCardId: Record<string, number> = {};
      Object.entries(entry.byCardName).forEach(([name, amount]) => {
        const id = cardNameToId.get(name);
        if (id) {
          byCardId[id] = amount;
        }
      });

      return {
        id: entry.month,
        month: entry.month,
        byCardId,
        total: entry.spendTotal,
        formulaVariantId: entry.formulaVariantId,
        formulaExpression: entry.formulaExpression,
        inferred: entry.inferred,
        createdAt: now,
        updatedAt: now
      };
    }),
    (item) => item.id ?? randomUUID()
  );

  await Promise.all([
    replaceCollectionFromArray(
      uid,
      "houseBills",
      snapshot.houseBills.map((item) => ({ ...item, createdAt: now, updatedAt: now }))
    ),
    replaceCollectionFromArray(
      uid,
      "incomeItems",
      snapshot.income.map((item) => ({ ...item, createdAt: now, updatedAt: now }))
    ),
    replaceCollectionFromArray(
      uid,
      "shoppingItems",
      snapshot.shopping.map((item) => ({ ...item, createdAt: now, updatedAt: now }))
    ),
    replaceCollectionFromArray(
      uid,
      "myBills",
      snapshot.myBills.map((item) => ({ ...item, createdAt: now, updatedAt: now }))
    ),
    replaceCollectionFromArray(
      uid,
      "purchasePlans",
      snapshot.purchases.map((item) => ({ ...item, createdAt: now, updatedAt: now }))
    )
  ]);

  await recomputeAndPersistSnapshots(uid);

  const importId = await saveImportRecord(uid, {
    fileName,
    sha256,
    warnings: summary.warnings,
    summary,
    rawSnapshot: snapshot,
    createdAt: now
  });

  return { importId, sha256 };
}
