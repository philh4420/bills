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
  alertSettings: AlertSettings;
  alerts: SmartAlert[];
  timeline: MonthTimeline;
}

export interface AlertSettings {
  lowMoneyLeftThreshold: number;
  utilizationThresholdPercent: number;
  dueReminderOffsets: number[];
  createdAt?: string;
  updatedAt?: string;
}

export type SmartAlertType = "low-money-left" | "card-utilization" | "card-due";
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
