import { normalizeCurrency } from "@/lib/util/numbers";
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
