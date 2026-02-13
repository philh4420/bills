export type CurrencyCode = "GBP";
export type MonthKey = string;

export type MinimumPaymentRuleType = "fixed" | "percent";

export interface MinimumPaymentRule {
  type: MinimumPaymentRuleType;
  value: number;
}

export interface LateFeeRule {
  type: "fixed";
  value: number;
}

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
  statementDay?: number | null;
  minimumPaymentRule?: MinimumPaymentRule | null;
  interestFreeDays?: number | null;
  lateFeeRule?: LateFeeRule | null;
  createdAt: string;
  updatedAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  auth: string;
  p256dh: string;
  userAgent?: string;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastFailureReason?: string | null;
  endpointHealth?: "healthy" | "degraded" | "stale";
  failureCount?: number;
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

export interface PaydayModeSettings {
  id: string;
  enabled: boolean;
  anchorDate: string; // YYYY-MM-DD
  cycleDays: number; // e.g. 28
  incomeIds?: string[];
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
export type LedgerEntrySourceType =
  | "card-due"
  | "bill-due"
  | "adjustment"
  | "income"
  | "loaned-out"
  | "card-statement-balance"
  | "card-due-amount"
  | "card-minimum-payment"
  | "card-interest-accrual"
  | "card-late-fee";

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

export type BankAccountType = "current" | "savings" | "cash";

export interface BankAccount {
  id: string;
  name: string;
  accountType: BankAccountType;
  balance: number;
  includeInNetWorth: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankTransfer {
  id: string;
  month: MonthKey;
  day: number;
  date: string; // YYYY-MM-DD
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type SavingsGoalStatus = "active" | "paused" | "completed";

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  startMonth: MonthKey;
  targetMonth?: MonthKey;
  status: SavingsGoalStatus;
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

export type BackupAction = "export" | "restore";
export type BackupStatus = "success" | "failed";
export type BackupFormat = "json" | "csv" | "snapshot";
export type BackupMode = "dry-run" | "commit";

export interface BackupRecord {
  id: string;
  action: BackupAction;
  status: BackupStatus;
  format: BackupFormat;
  mode: BackupMode;
  createdAt: string;
  totalDocuments: number;
  collectionCounts: Record<string, number>;
  message?: string;
}

export type CommandStatus = "running" | "succeeded" | "failed" | "undone";

export interface CommandRecord {
  id: string;
  method: string;
  path: string;
  actorEmail: string;
  status: CommandStatus;
  reversible: boolean;
  undoKind?: string;
  undoPayload?: Record<string, unknown>;
  requestPayload?: unknown;
  responseStatus?: number;
  errorMessage?: string;
  entityType?: string;
  entityId?: string;
  month?: MonthKey;
  createdAt: string;
  updatedAt: string;
  undoneAt?: string;
}

export interface AuditEventRecord {
  id: string;
  commandId?: string;
  type: "write" | "undo" | "archive";
  method: string;
  path: string;
  actorEmail: string;
  success: boolean;
  entityType?: string;
  entityId?: string;
  month?: MonthKey;
  before?: unknown;
  after?: unknown;
  requestPayload?: unknown;
  responseStatus?: number;
  message?: string;
  createdAt: string;
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
  bankAccounts?: BankAccount[];
  bankTransfers?: BankTransfer[];
  bankAccountProjection?: {
    month: MonthKey;
    entries: BankAccountProjection[];
    totalOpeningBalance: number;
    totalClosingBalance: number;
    netMovementApplied: number;
  };
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
  planning?: PlanningSummary;
}

export interface AlertSettings {
  lowMoneyLeftThreshold: number;
  utilizationThresholdPercent: number;
  dueReminderOffsets: number[];
  deliveryHoursLocal: number[];
  cooldownMinutes: number;
  realtimePushEnabled: boolean;
  cronPushEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStartLocal: number;
  quietHoursEndLocal: number;
  quietHoursTimezone: string;
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

export interface AlertStateRecord {
  id: string;
  acknowledgedAt?: string | null;
  snoozedUntil?: string | null;
  muted: boolean;
  mutedAt?: string | null;
  updatedAt: string;
}

export type TimelineEventType = "card-due" | "bill-due" | "adjustment" | "transfer";
export type TimelineEventSourceType =
  | "cardAccount"
  | "houseBill"
  | "shoppingItem"
  | "myBill"
  | "monthlyAdjustment"
  | "incomeItem"
  | "loanedOutItem"
  | "bankTransfer";

export interface MonthTimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  subtitle?: string;
  date: string; // YYYY-MM-DD
  day: number;
  amount: number; // debit is negative, credit is positive
  category: string;
  sourceType?: TimelineEventSourceType;
  sourceId?: string;
  editableDueDay?: boolean;
  transferAmount?: number;
}

export interface MonthTimeline {
  month: MonthKey;
  events: MonthTimelineEvent[];
}

export interface SavingsGoalProjection {
  id: string;
  name: string;
  status: SavingsGoalStatus;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  startMonth: MonthKey;
  targetMonth?: MonthKey;
  projectedCompletionMonth?: MonthKey | null;
  remainingAmount: number;
  monthContribution: number;
}

export interface SavingsProjectionSummary {
  selectedMonth: MonthKey;
  monthlyTargetTotal: number;
  projectedMoneyLeftAfterSavings: number;
  goals: SavingsGoalProjection[];
  atRiskGoalIds: string[];
}

export interface DebtPayoffStrategySummary {
  strategy: "snowball" | "avalanche";
  monthlyBudget: number;
  monthsToDebtFree: number | null;
  totalInterest: number;
  totalPaid: number;
  payoffOrder: string[];
}

export interface DebtPayoffSummary {
  totalDebt: number;
  monthlyBudget: number;
  byStrategy: {
    snowball: DebtPayoffStrategySummary;
    avalanche: DebtPayoffStrategySummary;
  };
}

export interface NetWorthSummary {
  month: MonthKey;
  assets: number;
  liabilities: number;
  loanedOutRecoverable: number;
  netWorth: number;
  monthDelta: number;
}

export interface BankAccountProjection {
  accountId: string;
  name: string;
  accountType: BankAccountType;
  includeInNetWorth: boolean;
  openingBalance: number;
  closingBalance: number;
  netChange: number;
}

export interface SubscriptionCostEntry {
  id: string;
  sourceCollection: "houseBills" | "myBills" | "shoppingItems";
  name: string;
  monthlyAmount: number;
  annualAmount: number;
  rank: number;
}

export interface SubscriptionSwapSuggestion {
  id: string;
  name: string;
  currentMonthly: number;
  suggestedMonthly: number;
  potentialMonthlySavings: number;
  potentialAnnualSavings: number;
  reason: string;
}

export interface SubscriptionIntelligenceSummary {
  month: MonthKey;
  ranked: SubscriptionCostEntry[];
  suggestions: SubscriptionSwapSuggestion[];
}

export interface AnalyticsCategoryDelta {
  key:
    | "income"
    | "cardSpend"
    | "houseBills"
    | "shopping"
    | "myBills"
    | "adjustments"
    | "moneyLeft"
    | "moneyInBank";
  label: string;
  currentValue: number;
  previousValue: number;
  delta: number;
  deltaPercent: number | null;
}

export interface AnalyticsSummary {
  month: MonthKey;
  previousMonth?: MonthKey;
  deltas: AnalyticsCategoryDelta[];
  driftAlerts: Array<{
    key: AnalyticsCategoryDelta["key"];
    label: string;
    delta: number;
    deltaPercent: number;
  }>;
}

export interface PlanningSummary {
  paydayMode: {
    enabled: boolean;
    anchorDate: string;
    cycleDays: number;
    incomeIds: string[];
    monthPaydaysByIncomeId: Record<string, number[]>;
  };
  savings: SavingsProjectionSummary;
  debtPayoff: DebtPayoffSummary;
  netWorth: NetWorthSummary;
  analytics: AnalyticsSummary;
  subscriptionIntelligence: SubscriptionIntelligenceSummary;
}
