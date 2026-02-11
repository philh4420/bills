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

export interface LineItem {
  id: string;
  name: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export type AdjustmentCategory = "income" | "houseBills" | "shopping" | "myBills";

export interface MonthlyAdjustment {
  id: string;
  name: string;
  amount: number;
  category: AdjustmentCategory;
  startMonth: MonthKey;
  endMonth?: MonthKey;
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
  cardAccounts: Array<Pick<CardAccount, "name" | "limit" | "usedLimit" | "interestRateApr">>;
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
}
