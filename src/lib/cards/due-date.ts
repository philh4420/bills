import { APP_LOCALE, APP_TIMEZONE } from "@/lib/util/constants";

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface UpcomingDueDate {
  isoDate: string;
  year: number;
  month: number;
  day: number;
  daysUntil: number;
}

function toInt(part: string): number {
  return Number.parseInt(part, 10);
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getDatePartsInTimeZone(
  value: Date,
  timeZone: string = APP_TIMEZONE
): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(value);
  const year = toInt(parts.find((entry) => entry.type === "year")?.value || "0");
  const month = toInt(parts.find((entry) => entry.type === "month")?.value || "0");
  const day = toInt(parts.find((entry) => entry.type === "day")?.value || "0");
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeDueDay(year: number, month: number, dueDayOfMonth: number): number {
  return Math.min(Math.max(1, dueDayOfMonth), daysInMonth(year, month));
}

export function computeUpcomingDueDate(
  dueDayOfMonth: number,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE
): UpcomingDueDate {
  const current = getDatePartsInTimeZone(now, timeZone);
  const currentOrdinal = Date.UTC(current.year, current.month - 1, current.day);

  let dueYear = current.year;
  let dueMonth = current.month;
  let dueDay = normalizeDueDay(dueYear, dueMonth, dueDayOfMonth);
  let dueOrdinal = Date.UTC(dueYear, dueMonth - 1, dueDay);

  if (dueOrdinal < currentOrdinal) {
    dueMonth += 1;
    if (dueMonth > 12) {
      dueMonth = 1;
      dueYear += 1;
    }
    dueDay = normalizeDueDay(dueYear, dueMonth, dueDayOfMonth);
    dueOrdinal = Date.UTC(dueYear, dueMonth - 1, dueDay);
  }

  const daysUntil = Math.round((dueOrdinal - currentOrdinal) / 86400000);
  return {
    isoDate: toIsoDate(dueYear, dueMonth, dueDay),
    year: dueYear,
    month: dueMonth,
    day: dueDay,
    daysUntil
  };
}

export function formatDueDateLabel(isoDate: string, locale: string = APP_LOCALE): string {
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(parsed);
}
