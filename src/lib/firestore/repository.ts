import { createHash, randomUUID } from "crypto";

import { DocumentData, QueryDocumentSnapshot, WriteBatch } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";
import {
  AlertSettings,
  BankBalance,
  CardAccount,
  ImportRecord,
  LineItem,
  LoanedOutItem,
  MonthlyAdjustment,
  MonthlyCardPayments,
  MonthlyIncomePaydays,
  MonthSnapshot,
  PushSubscriptionRecord,
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

function normalizeDayList(input: unknown): number[] {
  const values = Array.isArray(input) ? input : typeof input === "number" ? [input] : [];
  return Array.from(
    new Set(
      values
        .map((value) => Number.parseInt(String(value), 10))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 31)
    )
  ).sort((a, b) => a - b);
}

export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  await userDoc(profile.uid).set(stripUndefined(profile), { merge: true });
}

export async function listCardAccounts(uid: string): Promise<CardAccount[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.cardAccounts).get();
  return mapDocs<CardAccount>(snap.docs).map((card) => ({
    ...card,
    interestRateApr: card.interestRateApr ?? 0,
    dueDayOfMonth: card.dueDayOfMonth ?? null
  }));
}

export async function listMonthlyPayments(uid: string): Promise<MonthlyCardPayments[]> {
  const snap = await userDoc(uid)
    .collection(COLLECTIONS.monthlyCardPayments)
    .orderBy("month", "asc")
    .get();
  return mapDocs<MonthlyCardPayments>(snap.docs);
}

export async function listMonthlyIncomePaydays(uid: string): Promise<MonthlyIncomePaydays[]> {
  const snap = await userDoc(uid)
    .collection(COLLECTIONS.monthlyIncomePaydays)
    .orderBy("month", "asc")
    .get();
  return mapDocs<MonthlyIncomePaydays>(snap.docs).map((entry) => ({
    ...entry,
    byIncomeId: Object.fromEntries(
      Object.entries(entry.byIncomeId || {})
        .map(([incomeId, dayOrDays]) => [incomeId, normalizeDayList(dayOrDays)])
        .filter(([, days]) => days.length > 0)
    )
  }));
}

export async function listLineItems(
  uid: string,
  collection: "houseBills" | "incomeItems" | "shoppingItems" | "myBills"
): Promise<LineItem[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS[collection]).orderBy("name", "asc").get();
  const defaultDueDay = 1;
  return mapDocs<LineItem>(snap.docs).map((item) => ({
    ...item,
    dueDayOfMonth: item.dueDayOfMonth ?? defaultDueDay
  }));
}

export async function listPurchasePlans(uid: string): Promise<PurchasePlan[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.purchasePlans).orderBy("name", "asc").get();
  return mapDocs<PurchasePlan>(snap.docs);
}

function toPushSubscriptionId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export async function listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.pushSubscriptions).get();
  return mapDocs<PushSubscriptionRecord>(snap.docs);
}

export async function upsertPushSubscription(
  uid: string,
  payload: Omit<PushSubscriptionRecord, "id">
): Promise<string> {
  const id = toPushSubscriptionId(payload.endpoint);
  await userDoc(uid).collection(COLLECTIONS.pushSubscriptions).doc(id).set(stripUndefined(payload), {
    merge: true
  });
  return id;
}

export async function deletePushSubscription(uid: string, endpoint: string): Promise<void> {
  const id = toPushSubscriptionId(endpoint);
  await userDoc(uid).collection(COLLECTIONS.pushSubscriptions).doc(id).delete();
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
  return mapDocs<MonthlyAdjustment>(snap.docs).map((adjustment) => ({
    ...adjustment,
    dueDayOfMonth: adjustment.dueDayOfMonth ?? 1
  }));
}

export async function listLoanedOutItems(uid: string): Promise<LoanedOutItem[]> {
  const snap = await userDoc(uid)
    .collection(COLLECTIONS.loanedOutItems)
    .orderBy("startMonth", "asc")
    .get();
  return mapDocs<LoanedOutItem>(snap.docs)
    .map((item) => ({
      ...item,
      status: (item.status === "paidBack" ? "paidBack" : "outstanding") as LoanedOutItem["status"],
      paidBackMonth: item.paidBackMonth || undefined
    }))
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth) || a.name.localeCompare(b.name));
}

export async function createLoanedOutItem(
  uid: string,
  payload: Omit<LoanedOutItem, "id">
): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS.loanedOutItems).doc(id).set(stripUndefined(payload));
  return id;
}

export async function updateLoanedOutItem(
  uid: string,
  id: string,
  payload: Partial<Omit<LoanedOutItem, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.loanedOutItems).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function deleteLoanedOutItem(uid: string, id: string): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.loanedOutItems).doc(id).delete();
}

export async function getBankBalance(uid: string): Promise<BankBalance | null> {
  const doc = await userDoc(uid).collection(COLLECTIONS.bankBalances).doc("primary").get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data() as Omit<BankBalance, "id">;
  return {
    id: doc.id,
    ...data
  };
}

export async function upsertBankBalance(
  uid: string,
  payload: Omit<BankBalance, "id">,
  id = "primary"
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.bankBalances).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function getAlertSettings(uid: string): Promise<AlertSettings | null> {
  const doc = await userDoc(uid).collection(COLLECTIONS.alertSettings).doc("default").get();
  if (!doc.exists) {
    return null;
  }
  return doc.data() as AlertSettings;
}

export async function upsertAlertSettings(uid: string, payload: Partial<AlertSettings>): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.alertSettings).doc("default").set(stripUndefined(payload), {
    merge: true
  });
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

export async function upsertMonthlyIncomePaydays(
  uid: string,
  month: string,
  payload: Omit<MonthlyIncomePaydays, "month">
): Promise<void> {
  await userDoc(uid)
    .collection(COLLECTIONS.monthlyIncomePaydays)
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
