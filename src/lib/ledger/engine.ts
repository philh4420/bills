import { normalizeCurrency } from "@/lib/util/numbers";
import { CardMonthProjectionEntry } from "@/lib/formulas/engine";
import { LedgerEntry, MonthTimelineEvent } from "@/types";

function sourceTypeForEvent(event: MonthTimelineEvent): LedgerEntry["sourceType"] {
  if (event.category === "income") {
    return "income";
  }
  if (event.category === "loanedOut") {
    return "loaned-out";
  }
  if (event.type === "card-due") {
    return "card-due";
  }
  if (event.type === "bill-due") {
    return "bill-due";
  }
  return "adjustment";
}

export function buildPlannedLedgerEntriesForMonth(params: {
  month: string;
  events: MonthTimelineEvent[];
  nowIso?: string;
}): Omit<LedgerEntry, "id">[] {
  const nowIso = params.nowIso || new Date().toISOString();

  return params.events.map((event) => ({
    month: params.month,
    date: event.date,
    day: event.day,
    title: event.title,
    subtitle: event.subtitle,
    category: event.category,
    amount: normalizeCurrency(event.amount),
    status: "planned" as const,
    sourceType: sourceTypeForEvent(event),
    sourceId: event.id,
    createdAt: nowIso,
    updatedAt: nowIso
  }));
}

function parseMonthKey(month: string): { year: number; monthNumber: number } {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number.parseInt(yearRaw || "", 10);
  const monthNumber = Number.parseInt(monthRaw || "", 10);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid month key: ${month}`);
  }
  return { year, monthNumber };
}

function clampDay(year: number, monthNumber: number, maybeDay: number | null | undefined): number {
  const max = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  if (!maybeDay || !Number.isInteger(maybeDay)) {
    return 1;
  }
  return Math.max(1, Math.min(max, maybeDay));
}

function toIsoDate(year: number, monthNumber: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatAmount(value: number): string {
  return `£${normalizeCurrency(value).toFixed(2)}`;
}

function calculateDueDay(params: {
  year: number;
  monthNumber: number;
  dueDayOfMonth?: number | null;
  statementDay?: number | null;
  interestFreeDays?: number | null;
}): number {
  if (params.dueDayOfMonth) {
    return clampDay(params.year, params.monthNumber, params.dueDayOfMonth);
  }

  const statementDay = clampDay(params.year, params.monthNumber, params.statementDay ?? 1);
  const graceDays = Math.max(0, params.interestFreeDays ?? 0);
  return clampDay(params.year, params.monthNumber, statementDay + graceDays);
}

export function buildCardStatementLedgerEntriesForMonth(params: {
  month: string;
  cards: Array<{
    id: string;
    name: string;
    dueDayOfMonth?: number | null;
    statementDay?: number | null;
    interestFreeDays?: number | null;
    minimumPaymentRule?: { type: "fixed" | "percent"; value: number } | null;
    lateFeeRule?: { type: "fixed"; value: number } | null;
  }>;
  projectionsByCardId: Record<string, CardMonthProjectionEntry>;
  nowIso?: string;
}): Omit<LedgerEntry, "id">[] {
  const nowIso = params.nowIso || new Date().toISOString();
  const { year, monthNumber } = parseMonthKey(params.month);
  const entries: Omit<LedgerEntry, "id">[] = [];

  params.cards.forEach((card) => {
    const projection = params.projectionsByCardId[card.id];
    if (!projection) {
      return;
    }

    const statementDay = clampDay(year, monthNumber, card.statementDay ?? null);
    const dueDay = calculateDueDay({
      year,
      monthNumber,
      dueDayOfMonth: card.dueDayOfMonth,
      statementDay: card.statementDay ?? null,
      interestFreeDays: card.interestFreeDays ?? null
    });
    const hasStatementRules = Boolean(
      card.statementDay || card.minimumPaymentRule || (card.interestFreeDays ?? 0) > 0 || card.lateFeeRule
    );

    if (!hasStatementRules) {
      return;
    }

    entries.push(
      {
        month: params.month,
        date: toIsoDate(year, monthNumber, statementDay),
        day: statementDay,
        title: `${card.name} statement balance`,
        subtitle: formatAmount(projection.statementBalance),
        category: "cards",
        amount: 0,
        status: "planned",
        sourceType: "card-statement-balance",
        sourceId: `card-statement-balance-${card.id}-${params.month}`,
        createdAt: nowIso,
        updatedAt: nowIso
      },
      {
        month: params.month,
        date: toIsoDate(year, monthNumber, dueDay),
        day: dueDay,
        title: `${card.name} due amount`,
        subtitle: formatAmount(projection.paymentAmount),
        category: "cards",
        amount: 0,
        status: "planned",
        sourceType: "card-due-amount",
        sourceId: `card-due-amount-${card.id}-${params.month}`,
        createdAt: nowIso,
        updatedAt: nowIso
      },
      {
        month: params.month,
        date: toIsoDate(year, monthNumber, dueDay),
        day: dueDay,
        title: `${card.name} minimum payment`,
        subtitle: formatAmount(projection.minimumPaymentAmount),
        category: "cards",
        amount: 0,
        status: "planned",
        sourceType: "card-minimum-payment",
        sourceId: `card-minimum-payment-${card.id}-${params.month}`,
        createdAt: nowIso,
        updatedAt: nowIso
      },
      {
        month: params.month,
        date: toIsoDate(year, monthNumber, statementDay),
        day: statementDay,
        title: `${card.name} interest accrual`,
        subtitle: formatAmount(projection.interestAdded),
        category: "cards",
        amount: 0,
        status: "planned",
        sourceType: "card-interest-accrual",
        sourceId: `card-interest-accrual-${card.id}-${params.month}`,
        createdAt: nowIso,
        updatedAt: nowIso
      }
    );

    if (projection.lateFeeAdded > 0) {
      const lateFeeDay = clampDay(year, monthNumber, dueDay + 1);
      entries.push({
        month: params.month,
        date: toIsoDate(year, monthNumber, lateFeeDay),
        day: lateFeeDay,
        title: `${card.name} late fee`,
        subtitle: formatAmount(projection.lateFeeAdded),
        category: "cards",
        amount: 0,
        status: "planned",
        sourceType: "card-late-fee",
        sourceId: `card-late-fee-${card.id}-${params.month}`,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }
  });

  return entries;
}

export function sumLedgerMovement(
  entries: Array<Pick<LedgerEntry, "day" | "amount" | "status">>,
  options: { cutoffDay?: number; statuses?: LedgerEntry["status"][] } = {}
): number {
  const { cutoffDay, statuses } = options;
  const allowed = statuses ? new Set(statuses) : null;

  return normalizeCurrency(
    entries
      .filter((entry) => (cutoffDay ? entry.day <= cutoffDay : true))
      .filter((entry) => (allowed ? allowed.has(entry.status) : true))
      .reduce((acc, entry) => acc + entry.amount, 0)
  );
}
