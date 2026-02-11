import { randomUUID } from "crypto";

import { DocumentData, QueryDocumentSnapshot, WriteBatch } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";
import {
  CardAccount,
  ImportRecord,
  LineItem,
  MonthlyAdjustment,
  MonthlyCardPayments,
  MonthSnapshot,
  PurchasePlan,
  UserProfile
} from "@/types";

function stripUndefined<T>(input: T): T {
  if (Array.isArray(input)) {
    const cleaned = input
      .map((value) => stripUndefined(value))
      .filter((value) => value !== undefined);
    return cleaned as T;
  }

  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }
      out[key] = stripUndefined(value);
    });
    return out as T;
  }

  return input;
}

function usersCollection() {
  return getFirebaseAdminFirestore().collection("users");
}

function userDoc(uid: string) {
  return usersCollection().doc(uid);
}

function mapDocs<T>(docs: QueryDocumentSnapshot<DocumentData>[]): T[] {
  return docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<T, "id">) } as T));
}

export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  await userDoc(profile.uid).set(stripUndefined(profile), { merge: true });
}

export async function listCardAccounts(uid: string): Promise<CardAccount[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.cardAccounts).get();
  return mapDocs<CardAccount>(snap.docs).map((card) => ({
    ...card,
    interestRateApr: card.interestRateApr ?? 0
  }));
}

export async function listMonthlyPayments(uid: string): Promise<MonthlyCardPayments[]> {
  const snap = await userDoc(uid)
    .collection(COLLECTIONS.monthlyCardPayments)
    .orderBy("month", "asc")
    .get();
  return mapDocs<MonthlyCardPayments>(snap.docs);
}

export async function listLineItems(
  uid: string,
  collection: "houseBills" | "incomeItems" | "shoppingItems" | "myBills"
): Promise<LineItem[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS[collection]).orderBy("name", "asc").get();
  return mapDocs<LineItem>(snap.docs);
}

export async function listPurchasePlans(uid: string): Promise<PurchasePlan[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.purchasePlans).orderBy("name", "asc").get();
  return mapDocs<PurchasePlan>(snap.docs);
}

export async function listMonthSnapshots(uid: string): Promise<MonthSnapshot[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.monthSnapshots).orderBy("month", "asc").get();
  return mapDocs<MonthSnapshot>(snap.docs);
}

export async function listMonthlyAdjustments(uid: string): Promise<MonthlyAdjustment[]> {
  const snap = await userDoc(uid)
    .collection(COLLECTIONS.monthlyAdjustments)
    .orderBy("startMonth", "asc")
    .orderBy("name", "asc")
    .get();
  return mapDocs<MonthlyAdjustment>(snap.docs);
}

export async function upsertCardAccount(
  uid: string,
  id: string,
  payload: Omit<CardAccount, "id">
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.cardAccounts).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function upsertMonthlyPayment(
  uid: string,
  month: string,
  payload: Omit<MonthlyCardPayments, "month">
): Promise<void> {
  await userDoc(uid)
    .collection(COLLECTIONS.monthlyCardPayments)
    .doc(month)
    .set(stripUndefined({ month, ...payload }), { merge: true });
}

export async function replaceMonthSnapshots(uid: string, snapshots: MonthSnapshot[]): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const batch = db.batch();
  const col = userDoc(uid).collection(COLLECTIONS.monthSnapshots);

  const existing = await col.get();
  existing.docs.forEach((doc) => batch.delete(doc.ref));

  snapshots.forEach((snapshot) => {
    batch.set(col.doc(snapshot.month), stripUndefined(snapshot));
  });

  await batch.commit();
}

export async function createLineItem(
  uid: string,
  collection: "houseBills" | "incomeItems" | "shoppingItems" | "myBills",
  payload: Omit<LineItem, "id">
): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS[collection]).doc(id).set(stripUndefined(payload));
  return id;
}

export async function updateLineItem(
  uid: string,
  collection: "houseBills" | "incomeItems" | "shoppingItems" | "myBills",
  id: string,
  payload: Partial<Omit<LineItem, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS[collection]).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function deleteLineItem(
  uid: string,
  collection: "houseBills" | "incomeItems" | "shoppingItems" | "myBills",
  id: string
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS[collection]).doc(id).delete();
}

export async function createPurchasePlan(uid: string, payload: Omit<PurchasePlan, "id">): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS.purchasePlans).doc(id).set(stripUndefined(payload));
  return id;
}

export async function createMonthlyAdjustment(
  uid: string,
  payload: Omit<MonthlyAdjustment, "id">
): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS.monthlyAdjustments).doc(id).set(stripUndefined(payload));
  return id;
}

export async function updateMonthlyAdjustment(
  uid: string,
  id: string,
  payload: Partial<Omit<MonthlyAdjustment, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.monthlyAdjustments).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function deleteMonthlyAdjustment(uid: string, id: string): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.monthlyAdjustments).doc(id).delete();
}

export async function updatePurchasePlan(
  uid: string,
  id: string,
  payload: Partial<Omit<PurchasePlan, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.purchasePlans).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function saveImportRecord(uid: string, record: Omit<ImportRecord, "id">): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS.imports).doc(id).set(stripUndefined(record));
  return id;
}

export async function replaceCollectionFromArray<T extends Record<string, unknown>>(
  uid: string,
  collection: keyof typeof COLLECTIONS,
  items: T[],
  idFactory?: (item: T, index: number) => string
): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const col = userDoc(uid).collection(COLLECTIONS[collection]);
  const batch = db.batch();

  const existing = await col.get();
  existing.docs.forEach((doc) => batch.delete(doc.ref));

  items.forEach((item, index) => {
    const typed = item as T & { id?: string };
    const { id, ...data } = typed;
    const docId = id || idFactory?.(item, index) || randomUUID();
    batch.set(col.doc(docId), stripUndefined(data));
  });

  await batch.commit();
}

export async function runBatch(mutator: (batch: WriteBatch) => void): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const batch = db.batch();
  mutator(batch);
  await batch.commit();
}
