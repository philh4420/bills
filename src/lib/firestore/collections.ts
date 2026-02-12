export const COLLECTIONS = {
  cardAccounts: "cardAccounts",
  monthlyCardPayments: "monthlyCardPayments",
  monthlyIncomePaydays: "monthlyIncomePaydays",
  houseBills: "houseBills",
  incomeItems: "incomeItems",
  shoppingItems: "shoppingItems",
  myBills: "myBills",
  monthlyAdjustments: "monthlyAdjustments",
  loanedOutItems: "loanedOutItems",
  bankBalances: "bankBalances",
  purchasePlans: "purchasePlans",
  monthSnapshots: "monthSnapshots",
  ledgerEntries: "ledgerEntries",
  recurrenceRules: "recurrenceRules",
  monthClosures: "monthClosures",
  reconciliations: "reconciliations",
  imports: "imports",
  pushSubscriptions: "pushSubscriptions",
  alertSettings: "alertSettings"
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;
