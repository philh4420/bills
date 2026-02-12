import { computeMonthSnapshots } from "@/lib/formulas/engine";
import {
  getBankBalance,
  listCardAccounts,
  listLoanedOutItems,
  listMonthlyAdjustments,
  listMonthlyIncomePaydays,
  listLineItems,
  listMonthlyPayments,
  replaceMonthSnapshots
} from "@/lib/firestore/repository";
import { dispatchSmartAlertsForUser } from "@/lib/notifications/smart-alerts";

export async function recomputeAndPersistSnapshots(uid: string): Promise<void> {
  const [
    cards,
    monthlyPayments,
    houseBills,
    income,
    shopping,
    myBills,
    adjustments,
    incomePaydays,
    loanedOutItems,
    bankBalance
  ] =
    await Promise.all([
      listCardAccounts(uid),
      listMonthlyPayments(uid),
      listLineItems(uid, "houseBills"),
      listLineItems(uid, "incomeItems"),
      listLineItems(uid, "shoppingItems"),
      listLineItems(uid, "myBills"),
      listMonthlyAdjustments(uid),
      listMonthlyIncomePaydays(uid),
      listLoanedOutItems(uid),
      getBankBalance(uid)
    ]);

  const snapshots = computeMonthSnapshots({
    cards,
    monthlyPayments,
    houseBills,
    income,
    shopping,
    myBills,
    adjustments,
    incomePaydays,
    loanedOutItems,
    baseBankBalance: bankBalance?.amount ?? 0
  });

  await replaceMonthSnapshots(uid, snapshots);

  try {
    await dispatchSmartAlertsForUser(uid, { source: "realtime", now: new Date() });
  } catch (error) {
    console.error("Realtime smart alert dispatch failed", error);
  }
}
