import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { bankAccountPatchSchema } from "@/lib/api/schemas";
import { assertNoClosedMonths, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import {
  deleteBankAccount,
  listBankAccounts,
  listBankTransfers,
  updateBankAccount
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

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
    const parsed = bankAccountPatchSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid bank account payload", formatZodError(parsed.error));
    }

    const existing = (await listBankAccounts(uid)).find((account) => account.id === id);
    if (!existing) {
      return jsonError(404, "Bank account not found.");
    }

    try {
      await assertNoClosedMonths(uid);
    } catch (error) {
      const lockedMonth = parseLockedMonthFromError(error);
      if (lockedMonth) {
        return monthLockedResponse(lockedMonth);
      }
      throw error;
    }

    await updateBankAccount(uid, id, {
      ...parsed.data,
      updatedAt: toIsoNow()
    });
    await recomputeAndPersistSnapshots(uid);
    return jsonOk({ ok: true });
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    const accounts = await listBankAccounts(uid);
    const existing = accounts.find((account) => account.id === id);
    if (!existing) {
      return jsonError(404, "Bank account not found.");
    }
    if (accounts.length <= 1) {
      return jsonError(400, "At least one bank account is required.");
    }

    const transferLinked = (await listBankTransfers(uid)).some(
      (transfer) => transfer.fromAccountId === id || transfer.toAccountId === id
    );
    if (transferLinked) {
      return jsonError(400, "This account has linked transfers. Remove transfers first.");
    }

    try {
      await assertNoClosedMonths(uid);
    } catch (error) {
      const lockedMonth = parseLockedMonthFromError(error);
      if (lockedMonth) {
        return monthLockedResponse(lockedMonth);
      }
      throw error;
    }

    await deleteBankAccount(uid, id);
    await recomputeAndPersistSnapshots(uid);
    return jsonOk({ ok: true });
  });
}

