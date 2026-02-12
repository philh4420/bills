import { AlertSettings } from "@/types";

export const DEFAULT_LOW_MONEY_LEFT_THRESHOLD = 100;
export const DEFAULT_CARD_UTILIZATION_THRESHOLD = 80;
export const DEFAULT_DUE_REMINDER_OFFSETS = [7, 3, 1];
export const DEFAULT_DELIVERY_HOURS_LOCAL = [8];
export const DEFAULT_PUSH_COOLDOWN_MINUTES = 60;

function toUniqueSorted(values: number[], order: "asc" | "desc"): number[] {
  const unique = Array.from(new Set(values));
  return unique.sort((a, b) => (order === "asc" ? a - b : b - a));
}

function toDayOffsets(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const parsed = value
    .map((entry) => Number.parseInt(String(entry), 10))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 31);

  return parsed.length > 0 ? toUniqueSorted(parsed, "desc") : fallback;
}

function toHourList(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const parsed = value
    .map((entry) => Number.parseInt(String(entry), 10))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 23);

  return parsed.length > 0 ? toUniqueSorted(parsed, "asc") : fallback;
}

export function parseReminderOffsets(raw?: string | null): number[] {
  const source = raw?.trim();
  if (!source) {
    return DEFAULT_DUE_REMINDER_OFFSETS;
  }

  const parsed = source
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 31);

  if (parsed.length === 0) {
    return DEFAULT_DUE_REMINDER_OFFSETS;
  }

  return toUniqueSorted(parsed, "desc");
}

export function parseDeliveryHours(raw?: string | null): number[] {
  const source = raw?.trim();
  if (!source) {
    return DEFAULT_DELIVERY_HOURS_LOCAL;
  }

  const parsed = source
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23);

  if (parsed.length === 0) {
    return DEFAULT_DELIVERY_HOURS_LOCAL;
  }

  return toUniqueSorted(parsed, "asc");
}

export function normalizeAlertSettings(
  input: Partial<AlertSettings> | null | undefined,
  dueReminderOffsets: number[] = DEFAULT_DUE_REMINDER_OFFSETS,
  deliveryHoursLocal: number[] = DEFAULT_DELIVERY_HOURS_LOCAL
): AlertSettings {
  const fallbackOffsets = toDayOffsets(dueReminderOffsets, DEFAULT_DUE_REMINDER_OFFSETS);
  const fallbackHours = toHourList(deliveryHoursLocal, DEFAULT_DELIVERY_HOURS_LOCAL);

  return {
    lowMoneyLeftThreshold:
      typeof input?.lowMoneyLeftThreshold === "number" && Number.isFinite(input.lowMoneyLeftThreshold)
        ? Math.max(0, input.lowMoneyLeftThreshold)
        : DEFAULT_LOW_MONEY_LEFT_THRESHOLD,
    utilizationThresholdPercent:
      typeof input?.utilizationThresholdPercent === "number" && Number.isFinite(input.utilizationThresholdPercent)
        ? Math.min(1000, Math.max(0, input.utilizationThresholdPercent))
        : DEFAULT_CARD_UTILIZATION_THRESHOLD,
    dueReminderOffsets: toDayOffsets(input?.dueReminderOffsets, fallbackOffsets),
    deliveryHoursLocal: toHourList(input?.deliveryHoursLocal, fallbackHours),
    cooldownMinutes:
      typeof input?.cooldownMinutes === "number" && Number.isFinite(input.cooldownMinutes)
        ? Math.min(1440, Math.max(0, Math.round(input.cooldownMinutes)))
        : DEFAULT_PUSH_COOLDOWN_MINUTES,
    realtimePushEnabled:
      typeof input?.realtimePushEnabled === "boolean" ? input.realtimePushEnabled : true,
    cronPushEnabled: typeof input?.cronPushEnabled === "boolean" ? input.cronPushEnabled : true,
    enabledTypes: {
      lowMoneyLeft:
        typeof input?.enabledTypes?.lowMoneyLeft === "boolean" ? input.enabledTypes.lowMoneyLeft : true,
      cardUtilization:
        typeof input?.enabledTypes?.cardUtilization === "boolean"
          ? input.enabledTypes.cardUtilization
          : true,
      cardDue: typeof input?.enabledTypes?.cardDue === "boolean" ? input.enabledTypes.cardDue : true,
      billDue: typeof input?.enabledTypes?.billDue === "boolean" ? input.enabledTypes.billDue : true
    },
    lastPushSentAt:
      typeof input?.lastPushSentAt === "string" && input.lastPushSentAt.trim().length > 0
        ? input.lastPushSentAt
        : undefined,
    lastPushFingerprint:
      typeof input?.lastPushFingerprint === "string" && input.lastPushFingerprint.trim().length > 0
        ? input.lastPushFingerprint
        : undefined,
    createdAt:
      typeof input?.createdAt === "string" && input.createdAt.trim().length > 0
        ? input.createdAt
        : undefined,
    updatedAt:
      typeof input?.updatedAt === "string" && input.updatedAt.trim().length > 0
        ? input.updatedAt
        : undefined
  };
}
