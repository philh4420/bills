import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthlyAdjustmentPatchSchema } from "@/lib/api/schemas";
import { assertMonthRangeEditableWithFuture, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import {
  deleteMonthlyAdjustment,
  listMonthlyAdjustments,
  updateMonthlyAdjustment
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    const payload = await request.json();
    const parsed = monthlyAdjustmentPatchSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    if (
      parsed.data.startMonth &&
      parsed.data.endMonth &&
      parsed.data.endMonth !== null &&
      parsed.data.endMonth < parsed.data.startMonth
    ) {
      return jsonError(400, "endMonth must be greater than or equal to startMonth");
    }

    const existing = (await listMonthlyAdjustments(uid)).find((entry) => entry.id === id);
    if (!existing) {
      return jsonError(404, "Monthly adjustment not found.");
    }

    const startMonth = parsed.data.startMonth || existing.startMonth;
    const endMonth =
      parsed.data.endMonth === undefined
        ? existing.endMonth
        : parsed.data.endMonth === null
          ? undefined
          : parsed.data.endMonth;

    try {
      await assertMonthRangeEditableWithFuture(uid, startMonth, endMonth);
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

    await updateMonthlyAdjustment(uid, id, {
      ...parsed.data,
      endMonth: parsed.data.endMonth === null ? undefined : parsed.data.endMonth,
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
    const existing = (await listMonthlyAdjustments(uid)).find((entry) => entry.id === id);
    if (!existing) {
      return jsonError(404, "Monthly adjustment not found.");
    }

    try {
      await assertMonthRangeEditableWithFuture(uid, existing.startMonth, existing.endMonth);
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

    await deleteMonthlyAdjustment(uid, id);
    await recomputeAndPersistSnapshots(uid);
    return jsonOk({ ok: true });
  });
}
