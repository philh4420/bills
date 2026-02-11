export const COLLECTIONS = {
  cardAccounts: "cardAccounts",
  monthlyCardPayments: "monthlyCardPayments",
  houseBills: "houseBills",
  incomeItems: "incomeItems",
  shoppingItems: "shoppingItems",
  myBills: "myBills",
  monthlyAdjustments: "monthlyAdjustments",
  loanedOutItems: "loanedOutItems",
  bankBalances: "bankBalances",
  purchasePlans: "purchasePlans",
  monthSnapshots: "monthSnapshots",
  imports: "imports",
  pushSubscriptions: "pushSubscriptions",
  alertSettings: "alertSettings"
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;
