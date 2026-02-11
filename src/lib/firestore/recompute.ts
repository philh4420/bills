import { computeMonthSnapshots } from "@/lib/formulas/engine";
import {
  listCardAccounts,
  listMonthlyAdjustments,
  listLineItems,
  listMonthlyPayments,
  replaceMonthSnapshots
} from "@/lib/firestore/repository";

export async function recomputeAndPersistSnapshots(uid: string): Promise<void> {
  const [cards, monthlyPayments, houseBills, income, shopping, myBills, adjustments] =
    await Promise.all([
      listCardAccounts(uid),
      listMonthlyPayments(uid),
      listLineItems(uid, "houseBills"),
      listLineItems(uid, "incomeItems"),
      listLineItems(uid, "shoppingItems"),
      listLineItems(uid, "myBills"),
      listMonthlyAdjustments(uid)
    ]);

  const snapshots = computeMonthSnapshots({
    cards,
    monthlyPayments,
    houseBills,
    income,
    shopping,
    myBills,
    adjustments
  });

  await replaceMonthSnapshots(uid, snapshots);
}
