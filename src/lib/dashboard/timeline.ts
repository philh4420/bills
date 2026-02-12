import { daysInMonth } from "@/lib/cards/due-date";
import { resolveIncomePaydaysForMonth } from "@/lib/payday/mode";
import { normalizeCurrency } from "@/lib/util/numbers";
import {
  CardAccount,
  LineItem,
  LoanedOutItem,
  MonthTimeline,
  MonthTimelineEvent,
  MonthlyAdjustment,
  MonthlyCardPayments,
  PaydayModeSettings
} from "@/types";

function parseMonthKey(month: string): { year: number; monthNumber: number } {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number.parseInt(yearRaw || "", 10);
  const monthNumber = Number.parseInt(monthRaw || "", 10);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid month key: ${month}`);
  }
  return { year, monthNumber };
}

function clampDay(year: number, monthNumber: number, dueDayOfMonth?: number | null): number {
  const max = daysInMonth(year, monthNumber);
  if (!dueDayOfMonth || !Number.isInteger(dueDayOfMonth)) {
    return 1;
  }
  return Math.min(max, Math.max(1, dueDayOfMonth));
}

function toIsoDate(year: number, monthNumber: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toEvent(params: {
  id: string;
  type: MonthTimelineEvent["type"];
  title: string;
  subtitle?: string;
  category: string;
  year: number;
  monthNumber: number;
  dueDayOfMonth?: number | null;
  amount: number;
}): MonthTimelineEvent {
  const day = clampDay(params.year, params.monthNumber, params.dueDayOfMonth);
  return {
    id: params.id,
    type: params.type,
    title: params.title,
    subtitle: params.subtitle,
    category: params.category,
    day,
    date: toIsoDate(params.year, params.monthNumber, day),
    amount: normalizeCurrency(params.amount)
  };
}

function isMonthInRange(month: string, startMonth: string, endMonth?: string): boolean {
  if (month < startMonth) {
    return false;
  }
  if (endMonth && month > endMonth) {
    return false;
  }
  return true;
}

export function buildMonthTimeline(params: {
  selectedMonth: string;
  cards: Array<Pick<CardAccount, "id" | "name" | "dueDayOfMonth" | "statementDay" | "interestFreeDays">>;
  monthlyPayments: Pick<MonthlyCardPayments, "byCardId"> | null;
  income: Array<Pick<LineItem, "id" | "name" | "amount" | "dueDayOfMonth">>;
  incomePaydayOverridesByIncomeId: Record<string, number[]>;
  paydayModeSettings?: Pick<PaydayModeSettings, "enabled" | "anchorDate" | "cycleDays" | "incomeIds"> | null;
  houseBills: Array<Pick<LineItem, "id" | "name" | "amount" | "dueDayOfMonth">>;
  shopping: Array<Pick<LineItem, "id" | "name" | "amount" | "dueDayOfMonth">>;
  myBills: Array<Pick<LineItem, "id" | "name" | "amount" | "dueDayOfMonth">>;
  adjustments: Array<
    Pick<MonthlyAdjustment, "id" | "name" | "amount" | "category" | "startMonth" | "endMonth" | "dueDayOfMonth">
  >;
  loanedOutItems: Array<Pick<LoanedOutItem, "id" | "name" | "amount" | "startMonth" | "status" | "paidBackMonth">>;
}): MonthTimeline {
  const {
    selectedMonth,
    cards,
    monthlyPayments,
    income,
    incomePaydayOverridesByIncomeId,
    paydayModeSettings,
    houseBills,
    shopping,
    myBills,
    adjustments,
    loanedOutItems
  } = params;
  const { year, monthNumber } = parseMonthKey(selectedMonth);
  const events: MonthTimelineEvent[] = [];

  cards.forEach((card) => {
    const derivedDueDay =
      card.dueDayOfMonth ??
      (card.statementDay
        ? clampDay(year, monthNumber, (card.statementDay ?? 1) + Math.max(0, card.interestFreeDays ?? 0))
        : null);

    events.push(
      toEvent({
        id: `card-${card.id}-${selectedMonth}`,
        type: "card-due",
        title: `${card.name} due`,
        subtitle: "Card payment",
        category: "cards",
        year,
        monthNumber,
        dueDayOfMonth: derivedDueDay,
        amount: -Math.max(0, monthlyPayments?.byCardId[card.id] ?? 0)
      })
    );
  });

  const paydaysByIncomeId = resolveIncomePaydaysForMonth({
    month: selectedMonth,
    incomeItems: income,
    incomePaydayOverridesByIncomeId,
    paydayModeSettings
  });

  income.forEach((item) => {
    const paydays = paydaysByIncomeId[item.id] || [item.dueDayOfMonth ?? 1];
    paydays.forEach((payday, index) => {
      events.push(
        toEvent({
          id: `income-${item.id}-${selectedMonth}-${payday}-${index}`,
          type: "adjustment",
          title: item.name,
          subtitle: "Income paid",
          category: "income",
          year,
          monthNumber,
          dueDayOfMonth: payday,
          amount: Math.max(0, item.amount)
        })
      );
    });
  });

  const billCollections = [
    { key: "houseBills", items: houseBills, subtitle: "House bill" },
    { key: "shopping", items: shopping, subtitle: "Shopping" },
    { key: "myBills", items: myBills, subtitle: "My bill" }
  ] as const;

  billCollections.forEach((collection) => {
    collection.items.forEach((item) => {
      events.push(
        toEvent({
          id: `${collection.key}-${item.id}-${selectedMonth}`,
          type: "bill-due",
          title: item.name,
          subtitle: collection.subtitle,
          category: collection.key,
          year,
          monthNumber,
          dueDayOfMonth: item.dueDayOfMonth ?? 1,
          amount: -Math.max(0, item.amount)
        })
      );
    });
  });

  adjustments
    .filter((adjustment) => isMonthInRange(selectedMonth, adjustment.startMonth, adjustment.endMonth))
    .forEach((adjustment) => {
      const sign = adjustment.category === "income" ? 1 : -1;
      const isOneOff = Boolean(adjustment.endMonth && adjustment.endMonth === adjustment.startMonth);
      events.push(
        toEvent({
          id: `adjustment-${adjustment.id}-${selectedMonth}`,
          type: "adjustment",
          title: adjustment.name,
          subtitle: isOneOff
            ? `One-off ${adjustment.category} adjustment`
            : `${adjustment.category} adjustment`,
          category: adjustment.category,
          year,
          monthNumber,
          dueDayOfMonth: adjustment.dueDayOfMonth ?? 1,
          amount: sign * Math.max(0, adjustment.amount)
        })
      );
    });

  loanedOutItems
    .filter((loan) => loan.startMonth === selectedMonth)
    .forEach((loan) => {
      events.push(
        toEvent({
          id: `loaned-out-${loan.id}-${selectedMonth}`,
          type: "adjustment",
          title: `${loan.name} (loaned out)`,
          subtitle: "Money loaned out",
          category: "loanedOut",
          year,
          monthNumber,
          dueDayOfMonth: 1,
          amount: -Math.max(0, loan.amount)
        })
      );
    });

  loanedOutItems
    .filter((loan) => loan.status === "paidBack" && loan.paidBackMonth === selectedMonth)
    .forEach((loan) => {
      events.push(
        toEvent({
          id: `loan-paid-back-${loan.id}-${selectedMonth}`,
          type: "adjustment",
          title: `${loan.name} (paid back)`,
          subtitle: "Loan repayment received",
          category: "loanedOut",
          year,
          monthNumber,
          dueDayOfMonth: 1,
          amount: Math.max(0, loan.amount)
        })
      );
    });

  return {
    month: selectedMonth,
    events: events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount || a.title.localeCompare(b.title))
  };
}
