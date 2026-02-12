import { buildMonthTimeline } from "@/lib/dashboard/timeline";
import {
  computeCardMonthProjections,
  extendMonthlyPaymentsToYearEnd,
  computeMonthSnapshots
} from "@/lib/formulas/engine";
import {
  getBankBalance,
  getPaydayModeSettings,
  listCardAccounts,
  listLoanedOutItems,
  listMonthlyAdjustments,
  listMonthlyIncomePaydays,
  listLineItems,
  listMonthlyPayments,
  replaceLedgerEntriesForMonth,
  replaceMonthSnapshots
} from "@/lib/firestore/repository";
import {
  buildCardStatementLedgerEntriesForMonth,
  buildPlannedLedgerEntriesForMonth
} from "@/lib/ledger/engine";
import { dispatchSmartAlertsForUser } from "@/lib/notifications/smart-alerts";
import { syncDefaultRecurrenceRules } from "@/lib/recurrence/sync";
import { monthKeyInTimeZone } from "@/lib/util/dates";

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
    paydayModeSettings,
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
      getPaydayModeSettings(uid),
      listLoanedOutItems(uid),
      getBankBalance(uid)
    ]);

  const timelinePayments = extendMonthlyPaymentsToYearEnd(monthlyPayments);
  const cardProjections = computeCardMonthProjections(cards, timelinePayments);
  const cardProjectionByMonth = new Map(cardProjections.map((projection) => [projection.month, projection]));
  const snapshots = computeMonthSnapshots({
    cards,
    monthlyPayments: timelinePayments,
    houseBills,
    income,
    shopping,
    myBills,
    adjustments,
    incomePaydays,
    paydayModeSettings,
    loanedOutItems,
    baseBankBalance: bankBalance?.amount ?? 0
  });

  await replaceMonthSnapshots(uid, snapshots);

  const paydaysByMonth = new Map(
    incomePaydays.map((entry) => [entry.month, entry.byIncomeId] as const)
  );
  const nowIso = new Date().toISOString();

  await Promise.all(
    timelinePayments.map(async (payment) => {
      const timeline = buildMonthTimeline({
        selectedMonth: payment.month,
        cards,
        monthlyPayments: payment,
        income,
        incomePaydayOverridesByIncomeId: paydaysByMonth.get(payment.month) || {},
        paydayModeSettings,
        houseBills,
        shopping,
        myBills,
        adjustments,
        loanedOutItems
      });

      const plannedEntries = buildPlannedLedgerEntriesForMonth({
        month: payment.month,
        events: timeline.events,
        nowIso
      });
      const statementEntries = buildCardStatementLedgerEntriesForMonth({
        month: payment.month,
        cards,
        projectionsByCardId: cardProjectionByMonth.get(payment.month)?.entries || {},
        nowIso
      });

      await replaceLedgerEntriesForMonth(uid, payment.month, [...plannedEntries, ...statementEntries]);
    })
  );

  await syncDefaultRecurrenceRules(uid, {
    cards,
    houseBills,
    income,
    shopping,
    myBills,
    adjustments,
    startMonth: timelinePayments[0]?.month || snapshots[0]?.month || monthKeyInTimeZone()
  });

  try {
    await dispatchSmartAlertsForUser(uid, { source: "realtime", now: new Date() });
  } catch (error) {
    console.error("Realtime smart alert dispatch failed", error);
  }
}
