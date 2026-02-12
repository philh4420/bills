import { LineItem, PaydayModeSettings } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeDayList(input: unknown): number[] {
  const values = Array.isArray(input) ? input : [];
  return Array.from(
    new Set(
      values
        .map((value) => Number.parseInt(String(value), 10))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 31)
    )
  ).sort((a, b) => a - b);
}

function parseMonthKey(month: string): { year: number; monthNumber: number } | null {
  const match = month.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const monthNumber = Number.parseInt(match[2], 10);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    return null;
  }

  return { year, monthNumber };
}

function parseIsoDate(isoDate: string): number | null {
  const match = isoDate.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const monthNumber = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, monthNumber - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthNumber - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.getTime();
}

export function incomeUsesPaydayMode(
  settings: Pick<PaydayModeSettings, "enabled" | "incomeIds"> | null | undefined,
  incomeId: string
): boolean {
  if (!settings?.enabled) {
    return false;
  }

  const scopedIncomeIds = settings.incomeIds || [];
  if (scopedIncomeIds.length === 0) {
    return true;
  }

  return scopedIncomeIds.includes(incomeId);
}

export function generateCyclePaydaysForMonth(params: {
  month: string;
  anchorDate: string;
  cycleDays: number;
}): number[] {
  const monthParts = parseMonthKey(params.month);
  if (!monthParts) {
    return [];
  }

  const anchorTime = parseIsoDate(params.anchorDate);
  if (anchorTime === null) {
    return [];
  }

  const cycleDays = Number.isFinite(params.cycleDays) ? Math.max(1, Math.round(params.cycleDays)) : 28;
  const monthStart = Date.UTC(monthParts.year, monthParts.monthNumber - 1, 1);
  const monthEnd = Date.UTC(monthParts.year, monthParts.monthNumber, 0);
  const diffDays = Math.floor((monthStart - anchorTime) / DAY_MS);
  let cycleIndex = Math.floor(diffDays / cycleDays);
  let candidate = anchorTime + cycleIndex * cycleDays * DAY_MS;

  while (candidate < monthStart) {
    cycleIndex += 1;
    candidate = anchorTime + cycleIndex * cycleDays * DAY_MS;
  }

  const out: number[] = [];
  while (candidate <= monthEnd) {
    out.push(new Date(candidate).getUTCDate());
    cycleIndex += 1;
    candidate = anchorTime + cycleIndex * cycleDays * DAY_MS;
  }

  return normalizeDayList(out);
}

export function resolveIncomePaydaysForMonth(params: {
  month: string;
  incomeItems: Array<Pick<LineItem, "id" | "dueDayOfMonth">>;
  incomePaydayOverridesByIncomeId: Record<string, number[]>;
  paydayModeSettings?: Pick<PaydayModeSettings, "enabled" | "anchorDate" | "cycleDays" | "incomeIds"> | null;
}): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const modeDays = params.paydayModeSettings?.enabled
    ? generateCyclePaydaysForMonth({
        month: params.month,
        anchorDate: params.paydayModeSettings.anchorDate,
        cycleDays: params.paydayModeSettings.cycleDays
      })
    : [];

  params.incomeItems.forEach((incomeItem) => {
    const manualDays = normalizeDayList(params.incomePaydayOverridesByIncomeId[incomeItem.id]);
    if (manualDays.length > 0) {
      out[incomeItem.id] = manualDays;
      return;
    }

    if (incomeUsesPaydayMode(params.paydayModeSettings, incomeItem.id) && modeDays.length > 0) {
      out[incomeItem.id] = modeDays;
      return;
    }

    const fallback = normalizeDayList([incomeItem.dueDayOfMonth ?? 1]);
    out[incomeItem.id] = fallback.length > 0 ? fallback : [1];
  });

  return out;
}

