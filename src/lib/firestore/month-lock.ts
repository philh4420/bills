import { monthRangeInclusive } from "@/lib/util/dates";
import { getMonthClosure, listMonthClosures } from "@/lib/firestore/repository";

export function toMonthLockedError(month: string): Error {
  return new Error(`MONTH_LOCKED:${month}`);
}

export function parseLockedMonthFromError(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (!error.message.startsWith("MONTH_LOCKED:")) {
    return null;
  }

  const [, month] = error.message.split(":");
  return month || null;
}

export async function isMonthClosed(uid: string, month: string): Promise<boolean> {
  const closure = await getMonthClosure(uid, month);
  return Boolean(closure?.closed);
}

export async function assertMonthEditable(uid: string, month: string): Promise<void> {
  if (await isMonthClosed(uid, month)) {
    throw toMonthLockedError(month);
  }
}

export async function assertMonthRangeEditable(
  uid: string,
  startMonth: string,
  endMonth?: string
): Promise<void> {
  const months = endMonth ? monthRangeInclusive(startMonth, endMonth) : [startMonth];
  for (const month of months) {
    await assertMonthEditable(uid, month);
  }
}

async function listClosedMonths(uid: string): Promise<string[]> {
  const closures = await listMonthClosures(uid);
  return closures
    .filter((entry) => entry.closed)
    .map((entry) => entry.month)
    .sort((a, b) => a.localeCompare(b));
}

export async function assertNoClosedMonths(uid: string): Promise<void> {
  const closedMonths = await listClosedMonths(uid);
  const lockedMonth = closedMonths[0];
  if (lockedMonth) {
    throw toMonthLockedError(lockedMonth);
  }
}

export async function assertMonthRangeEditableWithFuture(
  uid: string,
  startMonth: string,
  endMonth?: string
): Promise<void> {
  if (endMonth) {
    await assertMonthRangeEditable(uid, startMonth, endMonth);
    return;
  }

  const closedMonths = await listClosedMonths(uid);
  const lockedMonth = closedMonths.find((month) => month >= startMonth);
  if (lockedMonth) {
    throw toMonthLockedError(lockedMonth);
  }
}
