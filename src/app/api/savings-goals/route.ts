import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { savingsGoalCreateSchema } from "@/lib/api/schemas";
import { assertMonthRangeEditableWithFuture, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import { createSavingsGoal, listSavingsGoals } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const goals = await listSavingsGoals(uid);
    return jsonOk({ goals });
  });
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const payload = await request.json();
    const parsed = savingsGoalCreateSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid savings goal payload", formatZodError(parsed.error));
    }

    try {
      await assertMonthRangeEditableWithFuture(uid, parsed.data.startMonth, parsed.data.targetMonth);
    } catch (error) {
      const lockedMonth = parseLockedMonthFromError(error);
      if (lockedMonth) {
        return jsonError(423, `Month ${lockedMonth} is closed. Reopen it in reconciliation before editing.`, {
          code: "MONTH_LOCKED",
          month: lockedMonth
        });
      }
      throw error;
    }

    const now = toIsoNow();
    const id = await createSavingsGoal(uid, {
      name: parsed.data.name,
      targetAmount: parsed.data.targetAmount,
      currentAmount: parsed.data.currentAmount ?? 0,
      monthlyContribution: parsed.data.monthlyContribution,
      startMonth: parsed.data.startMonth,
      targetMonth: parsed.data.targetMonth,
      status: parsed.data.status,
      createdAt: now,
      updatedAt: now
    });

    await recomputeAndPersistSnapshots(uid);

    return jsonOk({ id }, { status: 201 });
  });
}

