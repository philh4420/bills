import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { computeCardMonthProjections, computeMonthSnapshots, extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import {
  listCardAccounts,
  listLineItems,
  listMonthlyAdjustments,
  listMonthlyPayments
} from "@/lib/firestore/repository";
import { monthKeySchema } from "@/lib/api/schemas";
import { jsonError, jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const monthParam = request.nextUrl.searchParams.get("month");
    if (monthParam) {
      const parsed = monthKeySchema.safeParse(monthParam);
      if (!parsed.success) {
        return jsonError(400, "Invalid month query. Use YYYY-MM.");
      }
    }

    const [cards, monthlyPayments, houseBills, income, shopping, myBills, adjustments] = await Promise.all([
      listCardAccounts(uid),
      listMonthlyPayments(uid),
      listLineItems(uid, "houseBills"),
      listLineItems(uid, "incomeItems"),
      listLineItems(uid, "shoppingItems"),
      listLineItems(uid, "myBills"),
      listMonthlyAdjustments(uid)
    ]);

    const timelinePayments = extendMonthlyPaymentsToYearEnd(monthlyPayments);
    const snapshots = computeMonthSnapshots({
      cards,
      monthlyPayments: timelinePayments,
      houseBills,
      income,
      shopping,
      myBills,
      adjustments
    });

    const availableMonths = snapshots.map((snapshot) => snapshot.month);
    const selectedMonth = monthParam || availableMonths[0] || null;
    const selectedMonthlyPayment = selectedMonth
      ? timelinePayments.find((entry) => entry.month === selectedMonth) || null
      : null;
    const selectedSnapshot = selectedMonth
      ? snapshots.find((entry) => entry.month === selectedMonth) || null
      : null;

    const projections = computeCardMonthProjections(cards, timelinePayments);
    const selectedProjection = selectedMonth
      ? projections.find((entry) => entry.month === selectedMonth) || null
      : null;

    const normalizedSnapshot = selectedSnapshot
      ? {
          ...selectedSnapshot,
          cardSpendTotal: selectedSnapshot.cardSpendTotal ?? selectedProjection?.totalPaymentAmount ?? 0,
          cardInterestTotal:
            selectedSnapshot.cardInterestTotal ?? selectedProjection?.totalInterestAdded ?? 0,
          cardBalanceTotal:
            selectedSnapshot.cardBalanceTotal ?? selectedProjection?.totalClosingBalance ?? 0
        }
      : null;

    return jsonOk({
      selectedMonth,
      availableMonths,
      snapshot: normalizedSnapshot,
      cards,
      monthlyPayments: selectedMonthlyPayment
    });
  });
}
