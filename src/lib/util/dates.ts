import dayjs from "dayjs";

import { APP_TIMEZONE } from "@/lib/util/constants";

export function toIsoNow(): string {
  return new Date().toISOString();
}

export function monthKeyFromDate(value: Date): string {
  return dayjs(value).format("YYYY-MM");
}

export function monthKeyFromExcelValue(value: unknown): string | null {
  if (value instanceof Date) {
    return monthKeyFromDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const base = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(base.getTime() + value * 24 * 60 * 60 * 1000);
    return monthKeyFromDate(date);
  }

  if (typeof value === "string") {
    const parsed = dayjs(value);
    if (parsed.isValid()) {
      return parsed.format("YYYY-MM");
    }
  }

  return null;
}

export function monthRangeInclusive(startMonth: string, endMonth: string): string[] {
  const start = dayjs(`${startMonth}-01`);
  const end = dayjs(`${endMonth}-01`);
  const out: string[] = [];

  let cursor = start;
  while (cursor.isSame(end) || cursor.isBefore(end)) {
    out.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }

  return out;
}

export function monthKeyInTimeZone(value: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit"
  });
  const parts = formatter.formatToParts(value);
  const year = parts.find((entry) => entry.type === "year")?.value || "0000";
  const month = parts.find((entry) => entry.type === "month")?.value || "01";
  return `${year}-${month}`;
}
