import { EPSILON } from "@/lib/util/constants";

export function normalizeCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const snapped = Math.abs(value) < EPSILON ? 0 : value;
  return Math.round(snapped * 100) / 100;
}

export function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,£\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
