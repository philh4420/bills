import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { buildSmartAlerts } from "@/lib/alerts/engine";
import { normalizeAlertSettings, parseReminderOffsets } from "@/lib/alerts/settings";
import { daysInMonth, getDatePartsInTimeZone } from "@/lib/cards/due-date";
import { buildMonthTimeline } from "@/lib/dashboard/timeline";
import { computeCardMonthProjections, computeMonthSnapshots, extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import {
  getAlertSettings,
  getBankBalance,
  listCardAccounts,
  listLoanedOutItems,
  listLineItems,
  listMonthlyAdjustments,
  listMonthlyIncomePaydays,
  listMonthlyPayments
} from "@/lib/firestore/repository";
import { monthKeySchema } from "@/lib/api/schemas";
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
      loanedOutItems,
      bankBalance,
      persistedAlertSettings
    ] = await Promise.all([
      listCardAccounts(uid),
      listMonthlyPayments(uid),
      listLineItems(uid, "houseBills"),
      listLineItems(uid, "incomeItems"),
      listLineItems(uid, "shoppingItems"),
      listLineItems(uid, "myBills"),
      listMonthlyAdjustments(uid),
      listMonthlyIncomePaydays(uid),
      listLoanedOutItems(uid),
      getBankBalance(uid),
      getAlertSettings(uid)
    ]);

    const reminderOffsets = parseReminderOffsets(process.env.CARD_REMINDER_OFFSETS);
    const alertSettings = normalizeAlertSettings(persistedAlertSettings, reminderOffsets);

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
      loanedOutItems,
      baseBankBalance: bankBalance?.amount ?? 0
    });

    const availableMonths = snapshots.map((snapshot) => snapshot.month);
    const todayParts = getDatePartsInTimeZone(new Date(), APP_TIMEZONE);
    const currentMonth = `${String(todayParts.year).padStart(4, "0")}-${String(todayParts.month).padStart(2, "0")}`;
    const defaultMonth = availableMonths.includes(currentMonth)
      ? currentMonth
      : availableMonths[0] || currentMonth;
    const selectedMonth = monthParam || defaultMonth;
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
    const currentMonthPayment = timelinePayments.find((entry) => entry.month === currentMonth) || null;

    const projectedClosingByCardId: Record<string, number> = selectedProjection
      ? Object.fromEntries(
          Object.entries(selectedProjection.entries).map(([cardId, projection]) => [
            cardId,
            projection.closingBalance
          ])
        )
      : {};

    const timeline = buildMonthTimeline({
      selectedMonth,
      cards,
      monthlyPayments: selectedMonthlyPayment,
      income,
      incomePaydayOverridesByIncomeId:
        monthlyIncomePaydays.find((entry) => entry.month === selectedMonth)?.byIncomeId || {},
      houseBills,
      shopping,
      myBills,
      adjustments,
      loanedOutItems
    });

    const selectedIndex = snapshots.findIndex((entry) => entry.month === selectedMonth);
    const openingBankBalance =
      selectedIndex > 0 ? snapshots[selectedIndex - 1].moneyInBank : bankBalance?.amount ?? 0;
    const [yearRaw, monthRaw] = selectedMonth.split("-");
    const selectedYear = Number.parseInt(yearRaw || "", 10);
    const selectedMonthNumber = Number.parseInt(monthRaw || "", 10);
    const monthDays =
      Number.isInteger(selectedYear) && Number.isInteger(selectedMonthNumber)
        ? daysInMonth(selectedYear, selectedMonthNumber)
        : 31;
    const dayCutoff = selectedMonth === currentMonth ? todayParts.day : monthDays;
    const cashflowMovementToCutoff = normalizeCurrency(
      timeline.events
        .filter((event) => event.day <= dayCutoff)
        .reduce((acc, event) => acc + event.amount, 0)
    );
    const moneyInBankByDueDates = normalizeCurrency(openingBankBalance + cashflowMovementToCutoff);

    const normalizedSnapshot = selectedSnapshot
      ? {
          ...selectedSnapshot,
          cardSpendTotal: selectedSnapshot.cardSpendTotal ?? selectedProjection?.totalPaymentAmount ?? 0,
          cardInterestTotal:
            selectedSnapshot.cardInterestTotal ?? selectedProjection?.totalInterestAdded ?? 0,
          cardBalanceTotal:
            selectedSnapshot.cardBalanceTotal ?? selectedProjection?.totalClosingBalance ?? 0,
          loanedOutOutstandingTotal: selectedSnapshot.loanedOutOutstandingTotal ?? 0,
          loanedOutPaidBackTotal: selectedSnapshot.loanedOutPaidBackTotal ?? 0,
          moneyInBank: moneyInBankByDueDates
        }
      : null;

    const alerts = buildSmartAlerts({
      selectedMonth,
      snapshot: normalizedSnapshot,
      cards,
      settings: alertSettings,
      projectedClosingByCardId,
      paymentByCardIdForCurrentMonth: currentMonthPayment?.byCardId || {}
    });

    return jsonOk({
      selectedMonth,
      availableMonths,
      snapshot: normalizedSnapshot,
      cards,
      monthlyPayments: selectedMonthlyPayment,
      bankBalance,
      loanedOutItems,
      alertSettings,
      alerts,
      timeline
    });
  });
}
