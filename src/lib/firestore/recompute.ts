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
}
