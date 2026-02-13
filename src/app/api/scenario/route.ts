import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { scenarioEvaluateSchema } from "@/lib/api/schemas";
import { buildBankAccountProjectionForMonth, sumBankAccountBalances } from "@/lib/bank/accounts";
import { computeCardMonthProjections, computeMonthSnapshots, extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import {
  getBankBalance,
  getPaydayModeSettings,
  listBankAccounts,
  listBankTransfers,
  listCardAccounts,
  listLoanedOutItems,
  listLineItems,
  listMonthlyAdjustments,
  listMonthlyIncomePaydays,
  listMonthlyPayments
} from "@/lib/firestore/repository";
import { evaluateScenario } from "@/lib/scenario/engine";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const payload = await request.json();
    const parsed = scenarioEvaluateSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid scenario payload", formatZodError(parsed.error));
    }

    const [
      cards,
      monthlyPayments,
      houseBills,
      income,
      shopping,
      myBills,
      adjustments,
      monthlyIncomePaydays,
      paydayModeSettings,
      loanedOutItems,
      legacyBankBalance,
      bankAccounts,
      bankTransfers
    ] = await Promise.all([
      listCardAccounts(uid),
      listMonthlyPayments(uid),
      listLineItems(uid, "houseBills"),
      listLineItems(uid, "incomeItems"),
      listLineItems(uid, "shoppingItems"),
      listLineItems(uid, "myBills"),
      listMonthlyAdjustments(uid),
      listMonthlyIncomePaydays(uid),
      getPaydayModeSettings(uid),
      listLoanedOutItems(uid),
      getBankBalance(uid),
      listBankAccounts(uid),
      listBankTransfers(uid)
    ]);

    const timelinePayments = extendMonthlyPaymentsToYearEnd(monthlyPayments);
    const baseBankBalance =
      bankAccounts.length > 0 ? sumBankAccountBalances(bankAccounts) : legacyBankBalance?.amount ?? 0;

    const snapshots = computeMonthSnapshots({
      cards,
      monthlyPayments: timelinePayments,
      houseBills,
      income,
      shopping,
      myBills,
      adjustments,
      incomePaydays: monthlyIncomePaydays,
      paydayModeSettings,
      loanedOutItems,
      baseBankBalance
    });
    const selectedSnapshot = snapshots.find((snapshot) => snapshot.month === parsed.data.month) || null;
    if (!selectedSnapshot) {
      return jsonError(400, "Scenario month is outside available timeline.");
    }
    const selectedProjection = computeCardMonthProjections(cards, timelinePayments).find(
      (projection) => projection.month === parsed.data.month
    );
    const accountProjection = buildBankAccountProjectionForMonth({
      month: parsed.data.month,
      accounts: bankAccounts,
      transfers: bankTransfers,
      snapshots
    });

    const scenario = evaluateScenario({
      selectedMonth: parsed.data.month,
      snapshot: selectedSnapshot,
      accountProjection,
      input: {
        month: parsed.data.month,
        extraIncome: parsed.data.extraIncome,
        extraExpenses: parsed.data.extraExpenses,
        extraCardPayments: parsed.data.extraCardPayments,
        accountDeltas: parsed.data.accountDeltas || {},
        note: parsed.data.note
      }
    });

    return jsonOk({
      selectedMonth: parsed.data.month,
      availableMonths: snapshots.map((snapshot) => snapshot.month),
      base: {
        snapshot: selectedSnapshot,
        cardProjection: selectedProjection || null,
        bankAccountProjection: accountProjection
      },
      scenario
    });
  });
}
