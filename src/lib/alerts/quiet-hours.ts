import { AlertSettings } from "@/types";
import { APP_TIMEZONE } from "@/lib/util/constants";

function hourInTimeZone(now: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[] = [];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: APP_TIMEZONE,
      hour: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
  }
  const raw = parts.find((entry) => entry.type === "hour")?.value || "0";
  const hour = Number.parseInt(raw, 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return 0;
  }
  return hour;
}

export function isWithinQuietHours(settings: Pick<
  AlertSettings,
  "quietHoursEnabled" | "quietHoursStartLocal" | "quietHoursEndLocal" | "quietHoursTimezone"
>,
now: Date): { quiet: boolean; localHour: number; timezone: string } {
  const timezone = settings.quietHoursTimezone?.trim() || APP_TIMEZONE;
  const localHour = hourInTimeZone(now, timezone);

  if (!settings.quietHoursEnabled) {
    return { quiet: false, localHour, timezone };
  }

  const start = Math.max(0, Math.min(23, settings.quietHoursStartLocal));
  const end = Math.max(0, Math.min(23, settings.quietHoursEndLocal));

  if (start === end) {
    return { quiet: false, localHour, timezone };
  }

  const quiet =
    start < end
      ? localHour >= start && localHour < end
      : localHour >= start || localHour < end;

  return { quiet, localHour, timezone };
}
