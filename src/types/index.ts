export type CurrencyCode = "GBP";
export type MonthKey = string;

export interface UserProfile {
  uid: string;
  email: string;
  locale: "en-GB";
  timezone: "Europe/London";
  createdAt: string;
  updatedAt: string;
}

export interface CardAccount {
  id: string;
  name: string;
  limit: number;
  usedLimit: number;
  interestRateApr: number;
  dueDayOfMonth?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  auth: string;
  p256dh: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyCardPayments {
  month: MonthKey;
  byCardId: Record<string, number>;
  total: number;
  formulaVariantId: string;
  formulaExpression: string | null;
  inferred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyIncomePaydays {
  month: MonthKey;
  byIncomeId: Record<string, number[]>;
  createdAt: string;
  updatedAt: string;
}

export interface LineItem {
  id: string;
  name: string;
  amount: number;
  dueDayOfMonth?: number | null;
  createdAt: string;
  updatedAt: string;
}

export type RecurrenceFrequency = "monthly" | "weekly" | "every4Weeks" | "customInterval";
export type RecurrenceKind = "income" | "expense" | "card";
export type RecurrenceSourceType =
  | "cardAccount"
  | "houseBill"
  | "incomeItem"
  | "shoppingItem"
  | "myBill"
  | "monthlyAdjustment";

export interface RecurrenceRule {
  id: string;
  sourceType: RecurrenceSourceType;
  sourceId: string;
  label: string;
  kind: RecurrenceKind;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  dayOfMonth?: number | null;
  weekday?: number | null; // 0 (Sun) -> 6 (Sat)
  startMonth: MonthKey;
  endMonth?: MonthKey;
  amount: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LedgerEntryStatus = "planned" | "posted" | "paid";
export type LedgerEntrySourceType = "card-due" | "bill-due" | "adjustment" | "income" | "loaned-out";

export interface LedgerEntry {
  id: string;
  month: MonthKey;
  date: string; // YYYY-MM-DD
  day: number;
  title: string;
  subtitle?: string;
  category: string;
  amount: number; // debit negative, credit positive
  status: LedgerEntryStatus;
  sourceType: LedgerEntrySourceType;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
  postedAt?: string;
  paidAt?: string;
}

export type AdjustmentCategory = "income" | "houseBills" | "shopping" | "myBills";
export type IncomeSourceType = "loan" | "bonus" | "other";

export interface MonthlyAdjustment {
  id: string;
  name: string;
  amount: number;
  category: AdjustmentCategory;
  sourceType?: IncomeSourceType;
  startMonth: MonthKey;
  endMonth?: MonthKey;
  dueDayOfMonth?: number | null;
  createdAt: string;
  updatedAt: string;
}

export type LoanedOutStatus = "outstanding" | "paidBack";

export interface LoanedOutItem {
  id: string;
  name: string;
  amount: number;
  startMonth: MonthKey;
  status: LoanedOutStatus;
  paidBackMonth?: MonthKey | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankBalance {
  id: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseStatus = "planned" | "bought" | "skipped";

export interface PurchasePlan {
  id: string;
  name: string;
  price: number;
  link?: string;
  alias?: string;
  status: PurchaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MonthSnapshot {
  month: MonthKey;
  incomeTotal: number;
  houseBillsTotal: number;
  shoppingTotal: number;
  myBillsTotal: number;
  adjustmentsTotal: number;
  cardInterestTotal: number;
  cardBalanceTotal: number;
  cardSpendTotal: number;
  loanedOutOutstandingTotal: number;
  loanedOutPaidBackTotal: number;
  moneyInBank: number;
  moneyLeft: number;
  formulaVariantId: string;
  inferred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonthClosure {
  id: string;
  month: MonthKey;
  closed: boolean;
  reason?: string;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReconciliationStatus = "matched" | "variance";

export interface ReconciliationRecord {
  id: string;
  month: MonthKey;
  expectedBalance: number;
  actualBalance: number;
  variance: number;
  status: ReconciliationStatus;
  notes?: string;
  reconciledAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  sha256: string;
  warnings: string[];
  summary: ImportSummary;
  rawSnapshot: ImportedWorkbookSnapshot;
  createdAt: string;
}

export interface ImportedWorkbookSnapshot {
  cardAccounts: Array<
    Pick<CardAccount, "name" | "limit" | "usedLimit" | "interestRateApr" | "dueDayOfMonth">
  >;
  monthlyPayments: Array<{
    month: MonthKey;
    byCardName: Record<string, number>;
    spendTotal: number;
    formulaExpression: string | null;
    formulaVariantId: string;
    inferred: boolean;
  }>;
  houseBills: Array<Pick<LineItem, "name" | "amount">>;
  income: Array<Pick<LineItem, "name" | "amount">>;
  shopping: Array<Pick<LineItem, "name" | "amount">>;
  myBills: Array<Pick<LineItem, "name" | "amount">>;
  purchases: Array<Pick<PurchasePlan, "name" | "price" | "alias" | "link" | "status">>;
}

export interface ImportSummary {
  cardCount: number;
  monthlyRows: number;
  monthCount: number;
  houseBillCount: number;
  incomeCount: number;
  shoppingCount: number;
  myBillCount: number;
  purchaseCount: number;
  inferredMonths: MonthKey[];
  warnings: string[];
}

export interface DashboardResponse {
  selectedMonth: MonthKey;
  availableMonths: MonthKey[];
  snapshot: MonthSnapshot | null;
  cards: CardAccount[];
  monthlyPayments: MonthlyCardPayments | null;
  bankBalance: BankBalance | null;
  loanedOutItems: LoanedOutItem[];
  ledgerEntries: LedgerEntry[];
  monthClosure: MonthClosure | null;
  reconciliation: ReconciliationRecord | null;
  bankFlow: {
    openingBalance: number;
    plannedToDate: number;
    actualToDate: number;
    usingActual: boolean;
  };
  alertSettings: AlertSettings;
  alerts: SmartAlert[];
  timeline: MonthTimeline;
}

export interface AlertSettings {
  lowMoneyLeftThreshold: number;
  utilizationThresholdPercent: number;
  dueReminderOffsets: number[];
  deliveryHoursLocal: number[];
  cooldownMinutes: number;
  realtimePushEnabled: boolean;
  cronPushEnabled: boolean;
  enabledTypes: {
    lowMoneyLeft: boolean;
    cardUtilization: boolean;
    cardDue: boolean;
    billDue: boolean;
  };
  lastPushSentAt?: string;
  lastPushFingerprint?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type SmartAlertType = "low-money-left" | "card-utilization" | "card-due" | "bill-due";
export type SmartAlertSeverity = "info" | "warning" | "critical";

export interface SmartAlert {
  id: string;
  type: SmartAlertType;
  severity: SmartAlertSeverity;
  title: string;
  message: string;
  month: MonthKey;
  actionUrl: string;
  amount?: number;
  cardId?: string;
}

export type TimelineEventType = "card-due" | "bill-due" | "adjustment";

export interface MonthTimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  subtitle?: string;
  date: string; // YYYY-MM-DD
  day: number;
  amount: number; // debit is negative, credit is positive
  category: string;
}

export interface MonthTimeline {
  month: MonthKey;
  events: MonthTimelineEvent[];
}
