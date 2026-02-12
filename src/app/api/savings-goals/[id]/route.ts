import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { savingsGoalPatchSchema } from "@/lib/api/schemas";
import { assertMonthRangeEditableWithFuture, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import {
  deleteSavingsGoal,
  listSavingsGoals,
  updateSavingsGoal
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

function monthLockedResponse(month: string) {
  return jsonError(423, `Month ${month} is closed. Reopen it in reconciliation before editing.`, {
    code: "MONTH_LOCKED",
    month
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    const payload = await request.json();
    const parsed = savingsGoalPatchSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid savings goal payload", formatZodError(parsed.error));
    }

    const existing = (await listSavingsGoals(uid)).find((goal) => goal.id === id);
    if (!existing) {
      return jsonError(404, "Savings goal not found.");
    }

    const nextStartMonth = parsed.data.startMonth || existing.startMonth;
    const nextTargetMonth =
      parsed.data.targetMonth === undefined
        ? existing.targetMonth
        : parsed.data.targetMonth === null
          ? undefined
          : parsed.data.targetMonth;
    const nextTargetAmount = parsed.data.targetAmount ?? existing.targetAmount;
    const nextCurrentAmount = parsed.data.currentAmount ?? existing.currentAmount;

    if (nextTargetMonth && nextTargetMonth < nextStartMonth) {
      return jsonError(400, "targetMonth must be greater than or equal to startMonth");
    }
    if (nextCurrentAmount > nextTargetAmount) {
      return jsonError(400, "currentAmount cannot be greater than targetAmount");
    }

    try {
      await assertMonthRangeEditableWithFuture(uid, existing.startMonth, existing.targetMonth);
      await assertMonthRangeEditableWithFuture(uid, nextStartMonth, nextTargetMonth);
    } catch (error) {
      const lockedMonth = parseLockedMonthFromError(error);
      if (lockedMonth) {
        return monthLockedResponse(lockedMonth);
      }
      throw error;
    }

    await updateSavingsGoal(uid, id, {
      ...parsed.data,
      targetMonth: parsed.data.targetMonth === null ? undefined : parsed.data.targetMonth,
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
    const existing = (await listSavingsGoals(uid)).find((goal) => goal.id === id);
    if (!existing) {
      return jsonError(404, "Savings goal not found.");
    }

    try {
      await assertMonthRangeEditableWithFuture(uid, existing.startMonth, existing.targetMonth);
    } catch (error) {
      const lockedMonth = parseLockedMonthFromError(error);
      if (lockedMonth) {
        return monthLockedResponse(lockedMonth);
      }
      throw error;
    }

    await deleteSavingsGoal(uid, id);
    await recomputeAndPersistSnapshots(uid);
    return jsonOk({ ok: true });
  });
}

