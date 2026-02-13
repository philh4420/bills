import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { bankAccountCreateSchema } from "@/lib/api/schemas";
import { sumBankAccountBalances } from "@/lib/bank/accounts";
import { assertNoClosedMonths, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import { createBankAccount, listBankAccounts } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

function monthLockedResponse(lockedMonth: string) {
  return jsonError(423, `Month ${lockedMonth} is closed. Reopen it in reconciliation before editing.`, {
    code: "MONTH_LOCKED",
    month: lockedMonth
  });
}

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const accounts = await listBankAccounts(uid);
    return jsonOk({
      accounts,
      totalBalance: sumBankAccountBalances(accounts)
    });
  });
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const payload = await request.json();
    const parsed = bankAccountCreateSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid bank account payload", formatZodError(parsed.error));
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

    const now = toIsoNow();
    const id = await createBankAccount(uid, {
      name: parsed.data.name,
      accountType: parsed.data.accountType,
      balance: parsed.data.balance,
      includeInNetWorth: parsed.data.includeInNetWorth,
      createdAt: now,
      updatedAt: now
    });

    await recomputeAndPersistSnapshots(uid);
    return jsonOk({ id }, { status: 201 });
  });
}

