import { daysInMonth } from "@/lib/cards/due-date";
import { normalizeCurrency } from "@/lib/util/numbers";
import { CardAccount, LineItem, MonthTimeline, MonthTimelineEvent, MonthlyAdjustment, MonthlyCardPayments } from "@/types";

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

export function buildMonthTimeline(params: {
  selectedMonth: string;
  cards: Array<Pick<CardAccount, "id" | "name" | "dueDayOfMonth">>;
  monthlyPayments: Pick<MonthlyCardPayments, "byCardId"> | null;
  houseBills: Array<Pick<LineItem, "id" | "name" | "amount" | "dueDayOfMonth">>;
  shopping: Array<Pick<LineItem, "id" | "name" | "amount" | "dueDayOfMonth">>;
  myBills: Array<Pick<LineItem, "id" | "name" | "amount" | "dueDayOfMonth">>;
  adjustments: Array<
    Pick<MonthlyAdjustment, "id" | "name" | "amount" | "category" | "startMonth" | "endMonth" | "dueDayOfMonth">
  >;
}): MonthTimeline {
  const { selectedMonth, cards, monthlyPayments, houseBills, shopping, myBills, adjustments } = params;
  const { year, monthNumber } = parseMonthKey(selectedMonth);
  const events: MonthTimelineEvent[] = [];

  cards.forEach((card) => {
    events.push(
      toEvent({
        id: `card-${card.id}-${selectedMonth}`,
        type: "card-due",
        title: `${card.name} due`,
        subtitle: "Card payment",
        category: "cards",
        year,
        monthNumber,
        dueDayOfMonth: card.dueDayOfMonth ?? null,
        amount: -Math.max(0, monthlyPayments?.byCardId[card.id] ?? 0)
      })
    );
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
    .filter((adjustment) => adjustment.startMonth === selectedMonth && adjustment.endMonth === selectedMonth)
    .forEach((adjustment) => {
      const sign = adjustment.category === "income" ? 1 : -1;
      events.push(
        toEvent({
          id: `adjustment-${adjustment.id}-${selectedMonth}`,
          type: "adjustment",
          title: adjustment.name,
          subtitle: `One-off ${adjustment.category} adjustment`,
          category: adjustment.category,
          year,
          monthNumber,
          dueDayOfMonth: adjustment.dueDayOfMonth ?? 1,
          amount: sign * Math.max(0, adjustment.amount)
        })
      );
    });

  return {
    month: selectedMonth,
    events: events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount || a.title.localeCompare(b.title))
  };
}
