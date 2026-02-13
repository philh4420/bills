import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { bankTransferPatchSchema } from "@/lib/api/schemas";
import { daysInMonth } from "@/lib/cards/due-date";
import { assertMonthEditable, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import {
  deleteBankTransfer,
  listBankAccounts,
  listBankTransfers,
  updateBankTransfer
} from "@/lib/firestore/repository";
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    const payload = await request.json();
    const parsed = bankTransferPatchSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid bank transfer payload", formatZodError(parsed.error));
    }

    const existing = (await listBankTransfers(uid)).find((transfer) => transfer.id === id);
    if (!existing) {
      return jsonError(404, "Bank transfer not found.");
    }

    const nextMonth = parsed.data.month || existing.month;
    const nextFromAccountId = parsed.data.fromAccountId || existing.fromAccountId;
    const nextToAccountId = parsed.data.toAccountId || existing.toAccountId;
    if (nextFromAccountId === nextToAccountId) {
      return jsonError(400, "Transfer accounts must be different.");
    }

    const accounts = await listBankAccounts(uid);
    const validAccountIds = new Set(accounts.map((account) => account.id));
    if (!validAccountIds.has(nextFromAccountId) || !validAccountIds.has(nextToAccountId)) {
      return jsonError(400, "Transfer accounts are invalid.");
    }

    try {
      await assertMonthEditable(uid, existing.month);
      if (nextMonth !== existing.month) {
        await assertMonthEditable(uid, nextMonth);
      }
    } catch (error) {
      const lockedMonth = parseLockedMonthFromError(error);
      if (lockedMonth) {
        return monthLockedResponse(lockedMonth);
      }
      throw error;
    }

    const nextDay = parsed.data.day ?? existing.day;
    await updateBankTransfer(uid, id, {
      ...parsed.data,
      date: toTransferIsoDate(nextMonth, nextDay),
      updatedAt: toIsoNow()
    });
    return jsonOk({ ok: true });
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    const existing = (await listBankTransfers(uid)).find((transfer) => transfer.id === id);
    if (!existing) {
      return jsonError(404, "Bank transfer not found.");
    }

    try {
      await assertMonthEditable(uid, existing.month);
    } catch (error) {
      const lockedMonth = parseLockedMonthFromError(error);
      if (lockedMonth) {
        return monthLockedResponse(lockedMonth);
      }
      throw error;
    }

    await deleteBankTransfer(uid, id);
    return jsonOk({ ok: true });
  });
}

