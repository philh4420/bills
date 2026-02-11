export const COLLECTIONS = {
  cardAccounts: "cardAccounts",
  monthlyCardPayments: "monthlyCardPayments",
  houseBills: "houseBills",
  incomeItems: "incomeItems",
  shoppingItems: "shoppingItems",
  myBills: "myBills",
  monthlyAdjustments: "monthlyAdjustments",
  purchasePlans: "purchasePlans",
  monthSnapshots: "monthSnapshots",
  imports: "imports"
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;
