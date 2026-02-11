import { AlertSettings } from "@/types";

export const DEFAULT_LOW_MONEY_LEFT_THRESHOLD = 100;
export const DEFAULT_CARD_UTILIZATION_THRESHOLD = 80;
export const DEFAULT_DUE_REMINDER_OFFSETS = [7, 3, 1];

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

  return Array.from(new Set(parsed)).sort((a, b) => b - a);
}

export function normalizeAlertSettings(
  input: Partial<AlertSettings> | null | undefined,
  dueReminderOffsets: number[] = DEFAULT_DUE_REMINDER_OFFSETS
): AlertSettings {
  return {
    lowMoneyLeftThreshold:
      typeof input?.lowMoneyLeftThreshold === "number" && Number.isFinite(input.lowMoneyLeftThreshold)
        ? Math.max(0, input.lowMoneyLeftThreshold)
        : DEFAULT_LOW_MONEY_LEFT_THRESHOLD,
    utilizationThresholdPercent:
      typeof input?.utilizationThresholdPercent === "number" && Number.isFinite(input.utilizationThresholdPercent)
        ? Math.min(1000, Math.max(0, input.utilizationThresholdPercent))
        : DEFAULT_CARD_UTILIZATION_THRESHOLD,
    dueReminderOffsets:
      Array.isArray(input?.dueReminderOffsets) && input?.dueReminderOffsets.length > 0
        ? input.dueReminderOffsets
        : dueReminderOffsets
  };
}
