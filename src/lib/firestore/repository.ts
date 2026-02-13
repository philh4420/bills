import { createHash, randomUUID } from "crypto";

import { DocumentData, QueryDocumentSnapshot, WriteBatch } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";
import {
  AlertSettings,
  AlertStateRecord,
  BackupRecord,
  AuditEventRecord,
  BankAccount,
  BankBalance,
  BankTransfer,
  CardAccount,
  CommandRecord,
  ImportRecord,
  LedgerEntry,
  LineItem,
  LoanedOutItem,
  MonthClosure,
  MonthlyAdjustment,
  MonthlyCardPayments,
  MonthlyIncomePaydays,
  MonthSnapshot,
  PaydayModeSettings,
  PushSubscriptionRecord,
  PurchasePlan,
  ReconciliationRecord,
  RecurrenceRule,
  SavingsGoal,
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

function normalizeLedgerStatus(value: unknown): LedgerEntry["status"] {
  if (value === "posted") {
    return "posted";
  }
  if (value === "paid") {
    return "paid";
  }
  return "planned";
}

function normalizeReconciliationStatus(value: unknown): ReconciliationRecord["status"] {
  if (value === "variance") {
    return "variance";
  }
  return "matched";
}

function normalizeAlertState(input: AlertStateRecord): AlertStateRecord {
  return {
    ...input,
    muted: input.muted === true
  };
}

function normalizePushEndpointHealth(value: unknown): PushSubscriptionRecord["endpointHealth"] {
  if (value === "degraded" || value === "stale") {
    return value;
  }
  return "healthy";
}

function normalizeSavingsGoalStatus(value: unknown): SavingsGoal["status"] {
  if (value === "paused" || value === "completed") {
    return value;
  }
  return "active";
}

function normalizeBankAccountType(value: unknown): BankAccount["accountType"] {
  if (value === "savings" || value === "cash") {
    return value;
  }
  return "current";
}

export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  await userDoc(profile.uid).set(stripUndefined(profile), { merge: true });
}

export async function listCardAccounts(uid: string): Promise<CardAccount[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.cardAccounts).get();
  return mapDocs<CardAccount>(snap.docs).map((card) => ({
    ...card,
    interestRateApr: card.interestRateApr ?? 0,
    dueDayOfMonth: card.dueDayOfMonth ?? null,
    statementDay: card.statementDay ?? null,
    interestFreeDays: card.interestFreeDays ?? null,
    minimumPaymentRule:
      card.minimumPaymentRule && typeof card.minimumPaymentRule.value === "number"
        ? {
            type: card.minimumPaymentRule.type === "fixed" ? "fixed" : "percent",
            value: card.minimumPaymentRule.value
          }
        : null,
    lateFeeRule:
      card.lateFeeRule && typeof card.lateFeeRule.value === "number"
        ? {
            type: "fixed",
            value: card.lateFeeRule.value
          }
        : null
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

export async function getPaydayModeSettings(uid: string): Promise<PaydayModeSettings | null> {
  const primaryDoc = await userDoc(uid).collection(COLLECTIONS.paydayMode).doc("primary").get();
  if (primaryDoc.exists) {
    const data = primaryDoc.data() as Omit<PaydayModeSettings, "id">;
    return {
      id: primaryDoc.id,
      ...data,
      enabled: data.enabled === true,
      cycleDays:
        typeof data.cycleDays === "number" && Number.isFinite(data.cycleDays)
          ? Math.max(7, Math.min(35, Math.round(data.cycleDays)))
          : 28,
      incomeIds: Array.isArray(data.incomeIds)
        ? data.incomeIds.filter((value): value is string => typeof value === "string" && value.length > 0)
        : undefined
    };
  }

  const legacyDoc = await userDoc(uid).collection(COLLECTIONS.paydayMode).doc("default").get();
  if (!legacyDoc.exists) {
    return null;
  }

  const data = legacyDoc.data() as Omit<PaydayModeSettings, "id">;
  return {
    id: "default",
    ...data,
    enabled: data.enabled === true,
    cycleDays:
      typeof data.cycleDays === "number" && Number.isFinite(data.cycleDays)
        ? Math.max(7, Math.min(35, Math.round(data.cycleDays)))
        : 28,
    incomeIds: Array.isArray(data.incomeIds)
      ? data.incomeIds.filter((value): value is string => typeof value === "string" && value.length > 0)
      : undefined
  };
}

export async function upsertPaydayModeSettings(
  uid: string,
  payload: Partial<Omit<PaydayModeSettings, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.paydayMode).doc("primary").set(stripUndefined(payload), {
    merge: true
  });
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

export async function listRecurrenceRules(uid: string): Promise<RecurrenceRule[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.recurrenceRules).orderBy("label", "asc").get();
  return mapDocs<RecurrenceRule>(snap.docs).map((rule) => ({
    ...rule,
    intervalCount:
      typeof rule.intervalCount === "number" && Number.isFinite(rule.intervalCount)
        ? Math.max(1, Math.round(rule.intervalCount))
        : 1,
    active: rule.active !== false
  }));
}

export async function replaceRecurrenceRules(uid: string, rules: RecurrenceRule[]): Promise<void> {
  await replaceCollectionFromArray(uid, "recurrenceRules", rules, (rule) => rule.id);
}

export async function listPurchasePlans(uid: string): Promise<PurchasePlan[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.purchasePlans).orderBy("name", "asc").get();
  return mapDocs<PurchasePlan>(snap.docs);
}

export async function listBackups(uid: string): Promise<BackupRecord[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.backups).orderBy("createdAt", "desc").limit(25).get();
  return mapDocs<BackupRecord>(snap.docs);
}

export async function createBackupRecord(uid: string, payload: Omit<BackupRecord, "id">): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS.backups).doc(id).set(stripUndefined(payload));
  return id;
}

export async function createCommandRecord(
  uid: string,
  payload: Omit<CommandRecord, "id">
): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS.commands).doc(id).set(stripUndefined(payload));
  return id;
}

export async function getCommandRecord(uid: string, id: string): Promise<CommandRecord | null> {
  const doc = await userDoc(uid).collection(COLLECTIONS.commands).doc(id).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...(doc.data() as Omit<CommandRecord, "id">) };
}

export async function updateCommandRecord(
  uid: string,
  id: string,
  payload: Partial<Omit<CommandRecord, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.commands).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function createAuditEventRecord(
  uid: string,
  payload: Omit<AuditEventRecord, "id">
): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS.auditEvents).doc(id).set(stripUndefined(payload));
  return id;
}

export async function listAuditEventRecords(uid: string): Promise<AuditEventRecord[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.auditEvents).orderBy("createdAt", "desc").get();
  return mapDocs<AuditEventRecord>(snap.docs);
}

function toPushSubscriptionId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export async function listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.pushSubscriptions).get();
  return mapDocs<PushSubscriptionRecord>(snap.docs).map((entry) => ({
    ...entry,
    endpointHealth: normalizePushEndpointHealth(entry.endpointHealth),
    failureCount:
      typeof entry.failureCount === "number" && Number.isFinite(entry.failureCount)
        ? Math.max(0, Math.round(entry.failureCount))
        : 0,
    lastSuccessAt: entry.lastSuccessAt ?? null,
    lastFailureAt: entry.lastFailureAt ?? null,
    lastFailureReason: entry.lastFailureReason ?? null
  }));
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

export async function updatePushSubscription(
  uid: string,
  id: string,
  payload: Partial<Omit<PushSubscriptionRecord, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.pushSubscriptions).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function deletePushSubscription(uid: string, endpoint: string): Promise<void> {
  const id = toPushSubscriptionId(endpoint);
  await userDoc(uid).collection(COLLECTIONS.pushSubscriptions).doc(id).delete();
}

export async function listMonthSnapshots(uid: string): Promise<MonthSnapshot[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.monthSnapshots).orderBy("month", "asc").get();
  return mapDocs<MonthSnapshot>(snap.docs);
}

export async function listLedgerEntries(uid: string, month?: string): Promise<LedgerEntry[]> {
  const collection = userDoc(uid).collection(COLLECTIONS.ledgerEntries);
  const snap = month
    ? await collection.where("month", "==", month).get()
    : await collection.get();

  return mapDocs<LedgerEntry>(snap.docs)
    .map((entry) => ({
      ...entry,
      status: normalizeLedgerStatus(entry.status)
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export async function getLedgerEntry(uid: string, id: string): Promise<LedgerEntry | null> {
  const doc = await userDoc(uid).collection(COLLECTIONS.ledgerEntries).doc(id).get();
  if (!doc.exists) {
    return null;
  }

  const data = doc.data() as Omit<LedgerEntry, "id">;
  return {
    id: doc.id,
    ...data,
    status: normalizeLedgerStatus(data.status)
  };
}

export async function updateLedgerEntry(
  uid: string,
  id: string,
  payload: Partial<Omit<LedgerEntry, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.ledgerEntries).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function replaceLedgerEntriesForMonth(
  uid: string,
  month: string,
  entries: Omit<LedgerEntry, "id">[]
): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const col = userDoc(uid).collection(COLLECTIONS.ledgerEntries);
  const existingSnap = await col.where("month", "==", month).get();
  const existingById = new Map(
    existingSnap.docs.map((doc) => [doc.id, doc.data() as Omit<LedgerEntry, "id">])
  );

  const batch = db.batch();
  const nextIds = new Set(entries.map((entry) => entry.sourceId));

  existingSnap.docs.forEach((doc) => {
    if (!nextIds.has(doc.id)) {
      batch.delete(doc.ref);
    }
  });

  entries.forEach((entry) => {
    const docId = entry.sourceId;
    const existing = existingById.get(docId);
    const status = normalizeLedgerStatus(existing?.status ?? entry.status);
    const postedAt =
      status === "posted" || status === "paid" ? existing?.postedAt ?? entry.postedAt : undefined;
    const paidAt = status === "paid" ? existing?.paidAt ?? entry.paidAt : undefined;
    const payload: Omit<LedgerEntry, "id"> = {
      ...entry,
      status,
      postedAt,
      paidAt,
      createdAt: existing?.createdAt ?? entry.createdAt,
      updatedAt: entry.updatedAt
    };
    batch.set(col.doc(docId), stripUndefined(payload), { merge: true });
  });

  await batch.commit();
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

export async function listSavingsGoals(uid: string): Promise<SavingsGoal[]> {
  const snap = await userDoc(uid)
    .collection(COLLECTIONS.savingsGoals)
    .orderBy("startMonth", "asc")
    .get();
  return mapDocs<SavingsGoal>(snap.docs)
    .map((goal) => ({
      ...goal,
      status: normalizeSavingsGoalStatus(goal.status),
      currentAmount:
        typeof goal.currentAmount === "number" && Number.isFinite(goal.currentAmount)
          ? Math.max(0, goal.currentAmount)
          : 0,
      monthlyContribution:
        typeof goal.monthlyContribution === "number" && Number.isFinite(goal.monthlyContribution)
          ? Math.max(0, goal.monthlyContribution)
          : 0
    }))
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth) || a.name.localeCompare(b.name));
}

export async function createSavingsGoal(uid: string, payload: Omit<SavingsGoal, "id">): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS.savingsGoals).doc(id).set(stripUndefined(payload));
  return id;
}

export async function updateSavingsGoal(
  uid: string,
  id: string,
  payload: Partial<Omit<SavingsGoal, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.savingsGoals).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function deleteSavingsGoal(uid: string, id: string): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.savingsGoals).doc(id).delete();
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

export async function listMonthClosures(uid: string): Promise<MonthClosure[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.monthClosures).orderBy("month", "asc").get();
  return mapDocs<MonthClosure>(snap.docs).map((entry) => ({
    ...entry,
    closed: Boolean(entry.closed)
  }));
}

export async function getMonthClosure(uid: string, month: string): Promise<MonthClosure | null> {
  const doc = await userDoc(uid).collection(COLLECTIONS.monthClosures).doc(month).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data() as Omit<MonthClosure, "id">;
  return {
    id: doc.id,
    ...data,
    month: data.month || month,
    closed: Boolean(data.closed)
  };
}

export async function upsertMonthClosure(
  uid: string,
  month: string,
  payload: Omit<MonthClosure, "id" | "month"> & Partial<Pick<MonthClosure, "month">>
): Promise<void> {
  await userDoc(uid)
    .collection(COLLECTIONS.monthClosures)
    .doc(month)
    .set(stripUndefined({ ...payload, month }));
}

export async function listReconciliations(uid: string): Promise<ReconciliationRecord[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.reconciliations).orderBy("month", "asc").get();
  return mapDocs<ReconciliationRecord>(snap.docs).map((entry) => ({
    ...entry,
    status: normalizeReconciliationStatus(entry.status)
  }));
}

export async function getReconciliation(
  uid: string,
  month: string
): Promise<ReconciliationRecord | null> {
  const doc = await userDoc(uid).collection(COLLECTIONS.reconciliations).doc(month).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data() as Omit<ReconciliationRecord, "id">;
  return {
    id: doc.id,
    ...data,
    month: data.month || month,
    status: normalizeReconciliationStatus(data.status)
  };
}

export async function upsertReconciliation(
  uid: string,
  month: string,
  payload: Omit<ReconciliationRecord, "id" | "month"> & Partial<Pick<ReconciliationRecord, "month">>
): Promise<void> {
  await userDoc(uid)
    .collection(COLLECTIONS.reconciliations)
    .doc(month)
    .set(stripUndefined({ ...payload, month }), { merge: true });
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

export async function listBankAccounts(uid: string): Promise<BankAccount[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.bankAccounts).get();
  const accounts = mapDocs<BankAccount>(snap.docs)
    .map((account) => ({
      ...account,
      accountType: normalizeBankAccountType(account.accountType),
      includeInNetWorth: account.includeInNetWorth !== false
    }))
    .sort((a, b) => {
      const typeOrder = ["current", "savings", "cash"];
      const leftRank = typeOrder.indexOf(a.accountType);
      const rightRank = typeOrder.indexOf(b.accountType);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return a.name.localeCompare(b.name);
    });

  if (accounts.length > 0) {
    return accounts;
  }

  const legacyDoc = await userDoc(uid).collection(COLLECTIONS.bankBalances).doc("primary").get();
  if (!legacyDoc.exists) {
    return [];
  }
  const data = legacyDoc.data() as Omit<BankBalance, "id">;
  return [
    {
      id: "current",
      name: "Current Account",
      accountType: "current",
      balance: typeof data.amount === "number" && Number.isFinite(data.amount) ? data.amount : 0,
      includeInNetWorth: true,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString()
    }
  ];
}

export async function createBankAccount(uid: string, payload: Omit<BankAccount, "id">): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS.bankAccounts).doc(id).set(stripUndefined(payload));
  return id;
}

export async function updateBankAccount(
  uid: string,
  id: string,
  payload: Partial<Omit<BankAccount, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.bankAccounts).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function deleteBankAccount(uid: string, id: string): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.bankAccounts).doc(id).delete();
}

export async function listBankTransfers(uid: string): Promise<BankTransfer[]> {
  const collection = userDoc(uid).collection(COLLECTIONS.bankTransfers);
  let snap: Awaited<ReturnType<typeof collection.get>>;
  try {
    snap = await collection
      .orderBy("month", "asc")
      .orderBy("day", "asc")
      .get();
  } catch {
    // Fallback avoids hard dependency on a composite index during rollout.
    snap = await collection.get();
  }

  return mapDocs<BankTransfer>(snap.docs)
    .map((transfer) => ({
    ...transfer,
    day:
      typeof transfer.day === "number" && Number.isFinite(transfer.day)
        ? Math.max(1, Math.min(31, Math.round(transfer.day)))
        : 1,
    amount:
      typeof transfer.amount === "number" && Number.isFinite(transfer.amount)
        ? Math.max(0, transfer.amount)
        : 0
    }))
    .sort((a, b) => a.month.localeCompare(b.month) || a.day - b.day || a.id.localeCompare(b.id));
}

export async function createBankTransfer(uid: string, payload: Omit<BankTransfer, "id">): Promise<string> {
  const id = randomUUID();
  await userDoc(uid).collection(COLLECTIONS.bankTransfers).doc(id).set(stripUndefined(payload));
  return id;
}

export async function updateBankTransfer(
  uid: string,
  id: string,
  payload: Partial<Omit<BankTransfer, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.bankTransfers).doc(id).set(stripUndefined(payload), {
    merge: true
  });
}

export async function deleteBankTransfer(uid: string, id: string): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.bankTransfers).doc(id).delete();
}

export async function getBankBalance(uid: string): Promise<BankBalance | null> {
  const doc = await userDoc(uid).collection(COLLECTIONS.bankBalances).doc("primary").get();
  if (doc.exists) {
    const data = doc.data() as Omit<BankBalance, "id">;
    return {
      id: doc.id,
      ...data
    };
  }

  const accounts = await listBankAccounts(uid);
  if (accounts.length === 0) {
    return null;
  }

  const amount = accounts.reduce((acc, account) => acc + account.balance, 0);
  const latestUpdatedAt = accounts
    .map((account) => account.updatedAt)
    .filter((value) => typeof value === "string" && value.length > 0)
    .sort((a, b) => b.localeCompare(a))[0];
  const earliestCreatedAt = accounts
    .map((account) => account.createdAt)
    .filter((value) => typeof value === "string" && value.length > 0)
    .sort((a, b) => a.localeCompare(b))[0];

  return {
    id: "primary",
    amount,
    createdAt: earliestCreatedAt || new Date().toISOString(),
    updatedAt: latestUpdatedAt || new Date().toISOString()
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

  const accountsSnap = await userDoc(uid).collection(COLLECTIONS.bankAccounts).limit(1).get();
  if (accountsSnap.empty) {
    await userDoc(uid)
      .collection(COLLECTIONS.bankAccounts)
      .doc("current")
      .set(
        stripUndefined({
          name: "Current Account",
          accountType: "current",
          balance: payload.amount,
          includeInNetWorth: true,
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt
        }),
        { merge: true }
      );
  }
}

export async function getAlertSettings(uid: string): Promise<AlertSettings | null> {
  const primaryDoc = await userDoc(uid).collection(COLLECTIONS.alertSettings).doc("primary").get();
  if (primaryDoc.exists) {
    return primaryDoc.data() as AlertSettings;
  }

  const legacyDoc = await userDoc(uid).collection(COLLECTIONS.alertSettings).doc("default").get();
  if (!legacyDoc.exists) {
    return null;
  }

  return legacyDoc.data() as AlertSettings;
}

export async function upsertAlertSettings(uid: string, payload: Partial<AlertSettings>): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.alertSettings).doc("primary").set(stripUndefined(payload), {
    merge: true
  });
}

export async function listAlertStates(uid: string): Promise<AlertStateRecord[]> {
  const snap = await userDoc(uid).collection(COLLECTIONS.alertStates).get();
  return mapDocs<AlertStateRecord>(snap.docs).map((record) => normalizeAlertState(record));
}

export async function getAlertState(uid: string, alertId: string): Promise<AlertStateRecord | null> {
  const doc = await userDoc(uid).collection(COLLECTIONS.alertStates).doc(alertId).get();
  if (!doc.exists) {
    return null;
  }

  const data = doc.data() as Omit<AlertStateRecord, "id">;
  return normalizeAlertState({
    id: doc.id,
    ...data
  });
}

export async function upsertAlertState(
  uid: string,
  alertId: string,
  payload: Partial<Omit<AlertStateRecord, "id">>
): Promise<void> {
  await userDoc(uid).collection(COLLECTIONS.alertStates).doc(alertId).set(stripUndefined(payload), {
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

export async function replaceCollectionFromArray<T extends object>(
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
