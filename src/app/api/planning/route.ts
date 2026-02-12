import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthKeySchema } from "@/lib/api/schemas";
import { getDatePartsInTimeZone } from "@/lib/cards/due-date";
import { computeCardMonthProjections, computeMonthSnapshots, extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import { buildPlanningSummary } from "@/lib/planning/engine";
import {
  getBankBalance,
  getPaydayModeSettings,
  listCardAccounts,
  listLoanedOutItems,
  listLineItems,
  listMonthlyAdjustments,
  listMonthlyIncomePaydays,
  listMonthlyPayments,
  listSavingsGoals
} from "@/lib/firestore/repository";
import { APP_TIMEZONE } from "@/lib/util/constants";
import { jsonError, jsonOk } from "@/lib/util/http";
import { normalizeCurrency } from "@/lib/util/numbers";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const monthParam = request.nextUrl.searchParams.get("month");
    if (monthParam) {
      const parsed = monthKeySchema.safeParse(monthParam);
      if (!parsed.success) {
        return jsonError(400, "Invalid month query. Use YYYY-MM.");
      }
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
      bankBalance,
      savingsGoals
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
      listSavingsGoals(uid)
    ]);

    const timelinePayments = extendMonthlyPaymentsToYearEnd(monthlyPayments);
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
      baseBankBalance: bankBalance?.amount ?? 0
    });

    const availableMonths = snapshots.map((snapshot) => snapshot.month);
    const todayParts = getDatePartsInTimeZone(new Date(), APP_TIMEZONE);
    const currentMonth = `${String(todayParts.year).padStart(4, "0")}-${String(todayParts.month).padStart(2, "0")}`;
    const selectedMonth =
      monthParam ||
      (availableMonths.includes(currentMonth) ? currentMonth : availableMonths[0] || currentMonth);
    const selectedSnapshot = snapshots.find((entry) => entry.month === selectedMonth) || null;
    const selectedMonthlyPayment = timelinePayments.find((entry) => entry.month === selectedMonth) || null;
    const selectedProjection = computeCardMonthProjections(cards, timelinePayments).find(
      (entry) => entry.month === selectedMonth
    );
    const selectedIncomePaydayOverridesByIncomeId =
      monthlyIncomePaydays.find((entry) => entry.month === selectedMonth)?.byIncomeId || {};

    const planning = buildPlanningSummary({
      selectedMonth,
      snapshots,
      selectedSnapshot,
      cards,
      selectedMonthlyPayment,
      selectedProjectionByCardId: selectedProjection?.entries || {},
      income,
      selectedIncomePaydayOverridesByIncomeId,
      paydayModeSettings,
      savingsGoals
    });

    return jsonOk({
      selectedMonth,
      availableMonths,
      planning,
      netWorthTimeline: snapshots.map((snapshot) => ({
        month: snapshot.month,
        assets: normalizeCurrency(snapshot.moneyInBank + snapshot.loanedOutOutstandingTotal),
        liabilities: normalizeCurrency(snapshot.cardBalanceTotal),
        netWorth: normalizeCurrency(
          snapshot.moneyInBank + snapshot.loanedOutOutstandingTotal - snapshot.cardBalanceTotal
        )
      }))
    });
  });
}

