import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { buildSmartAlerts } from "@/lib/alerts/engine";
import { applyAlertStateToAlerts } from "@/lib/alerts/state";
import {
  normalizeAlertSettings,
  parseDeliveryHours,
  parseReminderOffsets
} from "@/lib/alerts/settings";
import { daysInMonth, getDatePartsInTimeZone } from "@/lib/cards/due-date";
import { buildMonthTimeline } from "@/lib/dashboard/timeline";
import { computeCardMonthProjections, computeMonthSnapshots, extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import { sumLedgerMovement } from "@/lib/ledger/engine";
import { buildPlanningSummary } from "@/lib/planning/engine";
import { buildSubscriptionIntelligence } from "@/lib/subscriptions/intelligence";
import { buildBankAccountProjectionForMonth, sumBankAccountBalances } from "@/lib/bank/accounts";
import {
  getAlertSettings,
  getBankBalance,
  getPaydayModeSettings,
  listBankAccounts,
  listBankTransfers,
  listCardAccounts,
  listLedgerEntries,
  listLoanedOutItems,
  listLineItems,
  listAlertStates,
  listMonthClosures,
  listMonthlyAdjustments,
  listMonthlyIncomePaydays,
  listMonthlyPayments,
  listReconciliations,
  listSavingsGoals
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
      paydayModeSettings,
      loanedOutItems,
      bankBalance,
      bankAccounts,
      bankTransfers,
      savingsGoals,
      persistedAlertSettings,
      alertStates,
      monthClosures,
      reconciliations
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
      listBankTransfers(uid),
      listSavingsGoals(uid),
      getAlertSettings(uid),
      listAlertStates(uid),
      listMonthClosures(uid),
      listReconciliations(uid)
    ]);

    const reminderOffsets = parseReminderOffsets(process.env.CARD_REMINDER_OFFSETS);
    const deliveryHours = parseDeliveryHours(process.env.CARD_REMINDER_DELIVERY_HOURS);
    const alertSettings = normalizeAlertSettings(persistedAlertSettings, reminderOffsets, deliveryHours);

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
      baseBankBalance: bankAccounts.length > 0 ? sumBankAccountBalances(bankAccounts) : bankBalance?.amount ?? 0
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

    const bankAccountProjection = buildBankAccountProjectionForMonth({
      month: selectedMonth,
      accounts: bankAccounts,
      transfers: bankTransfers,
      snapshots
    });
    const bankAccountNameById = Object.fromEntries(
      bankAccounts.map((account) => [account.id, account.name])
    );

    const timeline = buildMonthTimeline({
      selectedMonth,
      cards,
      monthlyPayments: selectedMonthlyPayment,
      income,
      incomePaydayOverridesByIncomeId:
        monthlyIncomePaydays.find((entry) => entry.month === selectedMonth)?.byIncomeId || {},
      paydayModeSettings,
      houseBills,
      shopping,
      myBills,
      adjustments,
      loanedOutItems,
      bankTransfers,
      bankAccountNameById
    });
    const ledgerEntries = await listLedgerEntries(uid, selectedMonth);

    const selectedIndex = snapshots.findIndex((entry) => entry.month === selectedMonth);
    const openingBankBalance =
      bankAccountProjection.totalOpeningBalance ||
      (selectedIndex > 0 ? snapshots[selectedIndex - 1].moneyInBank : bankBalance?.amount ?? 0);
    const [yearRaw, monthRaw] = selectedMonth.split("-");
    const selectedYear = Number.parseInt(yearRaw || "", 10);
    const selectedMonthNumber = Number.parseInt(monthRaw || "", 10);
    const monthDays =
      Number.isInteger(selectedYear) && Number.isInteger(selectedMonthNumber)
        ? daysInMonth(selectedYear, selectedMonthNumber)
        : 31;
    const dayCutoff = selectedMonth === currentMonth ? todayParts.day : monthDays;
    const plannedMovementToCutoff = normalizeCurrency(
      timeline.events
        .filter((event) => event.day <= dayCutoff)
        .reduce((acc, event) => acc + event.amount, 0)
    );
    const actualMovementToCutoff = sumLedgerMovement(ledgerEntries, {
      cutoffDay: dayCutoff,
      statuses: ["posted", "paid"]
    });
    const hasActualStatuses = ledgerEntries.some((entry) => entry.status === "posted" || entry.status === "paid");
    const activeMovement = hasActualStatuses ? actualMovementToCutoff : plannedMovementToCutoff;
    const moneyInBankByDueDates = normalizeCurrency(openingBankBalance + activeMovement);
    const monthClosure = monthClosures.find((entry) => entry.month === selectedMonth) || null;
    const reconciliation = reconciliations.find((entry) => entry.month === selectedMonth) || null;

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

    const computedAlerts = buildSmartAlerts({
      selectedMonth,
      snapshot: normalizedSnapshot,
      cards,
      timelineEvents: timeline.events,
      settings: alertSettings,
      projectedClosingByCardId,
      paymentByCardIdForCurrentMonth: currentMonthPayment?.byCardId || {}
    });
    const { activeAlerts } = applyAlertStateToAlerts({
      alerts: computedAlerts,
      states: alertStates,
      now: new Date()
    });

    const selectedIncomePaydayOverridesByIncomeId =
      monthlyIncomePaydays.find((entry) => entry.month === selectedMonth)?.byIncomeId || {};
    const subscriptionIntelligence = buildSubscriptionIntelligence({
      month: selectedMonth,
      houseBills,
      myBills,
      shopping
    });
    const planning = buildPlanningSummary({
      selectedMonth,
      snapshots,
      selectedSnapshot: normalizedSnapshot,
      cards,
      selectedMonthlyPayment,
      selectedProjectionByCardId: selectedProjection?.entries || {},
      income,
      houseBills,
      shopping,
      myBills,
      selectedIncomePaydayOverridesByIncomeId,
      paydayModeSettings,
      savingsGoals
    });

    return jsonOk({
      selectedMonth,
      availableMonths,
      snapshot: normalizedSnapshot,
      cards,
      monthlyPayments: selectedMonthlyPayment,
      bankBalance,
      bankAccounts,
      bankTransfers,
      bankAccountProjection,
      loanedOutItems,
      ledgerEntries,
      monthClosure,
      reconciliation,
      bankFlow: {
        openingBalance: openingBankBalance,
        plannedToDate: plannedMovementToCutoff,
        actualToDate: actualMovementToCutoff,
        usingActual: hasActualStatuses
      },
      alertSettings,
      alerts: activeAlerts,
      timeline,
      subscriptionIntelligence,
      planning
    });
  });
}
