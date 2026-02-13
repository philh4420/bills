import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { bankTransferCreateSchema, monthKeySchema } from "@/lib/api/schemas";
import { daysInMonth } from "@/lib/cards/due-date";
import { assertMonthEditable, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { createBankTransfer, listBankAccounts, listBankTransfers } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

function toTransferIsoDate(month: string, day: number): string {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number.parseInt(yearRaw || "", 10);
  const monthNumber = Number.parseInt(monthRaw || "", 10);
  const clampedDay = Math.max(1, Math.min(daysInMonth(year, monthNumber), day));
  return `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

function monthLockedResponse(lockedMonth: string) {
  return jsonError(423, `Month ${lockedMonth} is closed. Reopen it in reconciliation before editing.`, {
    code: "MONTH_LOCKED",
    month: lockedMonth
  });
}

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const monthParam = request.nextUrl.searchParams.get("month");
    if (monthParam) {
      const parsedMonth = monthKeySchema.safeParse(monthParam);
      if (!parsedMonth.success) {
        return jsonError(400, "Invalid month query. Use YYYY-MM.");
      }
    }

    const transfers = await listBankTransfers(uid);
    return jsonOk({
      transfers: monthParam ? transfers.filter((transfer) => transfer.month === monthParam) : transfers
    });
  });
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const payload = await request.json();
    const parsed = bankTransferCreateSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid bank transfer payload", formatZodError(parsed.error));
    }

    const accounts = await listBankAccounts(uid);
    const validAccountIds = new Set(accounts.map((account) => account.id));
    if (!validAccountIds.has(parsed.data.fromAccountId) || !validAccountIds.has(parsed.data.toAccountId)) {
      return jsonError(400, "Transfer accounts are invalid.");
    }

    try {
      await assertMonthEditable(uid, parsed.data.month);
    } catch (error) {
      const lockedMonth = parseLockedMonthFromError(error);
      if (lockedMonth) {
        return monthLockedResponse(lockedMonth);
      }
      throw error;
    }

    const now = toIsoNow();
    const transferDay = Number.parseInt(String(parsed.data.day), 10);
    const id = await createBankTransfer(uid, {
      month: parsed.data.month,
      day: transferDay,
      date: toTransferIsoDate(parsed.data.month, transferDay),
      fromAccountId: parsed.data.fromAccountId,
      toAccountId: parsed.data.toAccountId,
      amount: parsed.data.amount,
      note: parsed.data.note,
      createdAt: now,
      updatedAt: now
    });

    return jsonOk({ id }, { status: 201 });
  });
}

