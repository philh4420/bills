import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { loanedOutPatchSchema } from "@/lib/api/schemas";
import { assertMonthRangeEditableWithFuture, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import { deleteLoanedOutItem, listLoanedOutItems, updateLoanedOutItem } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    const payload = await request.json();
    const parsed = loanedOutPatchSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    const existing = (await listLoanedOutItems(uid)).find((entry) => entry.id === id);
    if (!existing) {
      return jsonError(404, "Loaned-out item not found");
    }

    const nextStatus = parsed.data.status ?? existing.status;
    const nextStartMonth = parsed.data.startMonth ?? existing.startMonth;
    const existingPaidBackMonth = existing.paidBackMonth || undefined;
    const nextPaidBackMonth =
      parsed.data.paidBackMonth === undefined
        ? existingPaidBackMonth
        : parsed.data.paidBackMonth || undefined;

    if (nextStatus === "paidBack" && !nextPaidBackMonth) {
      return jsonError(400, "paidBackMonth is required when status is paidBack");
    }

    if (nextPaidBackMonth && nextPaidBackMonth < nextStartMonth) {
      return jsonError(400, "paidBackMonth must be greater than or equal to startMonth");
    }

    try {
      await assertMonthRangeEditableWithFuture(uid, existing.startMonth, existingPaidBackMonth);
      await assertMonthRangeEditableWithFuture(
        uid,
        nextStartMonth,
        nextStatus === "paidBack" ? nextPaidBackMonth : undefined
      );
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

    await updateLoanedOutItem(uid, id, {
      ...parsed.data,
      paidBackMonth: nextStatus === "paidBack" ? nextPaidBackMonth : null,
      updatedAt: toIsoNow()
    });

    await recomputeAndPersistSnapshots(uid);

    return jsonOk({ ok: true });
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    const existing = (await listLoanedOutItems(uid)).find((entry) => entry.id === id);
    if (!existing) {
      return jsonError(404, "Loaned-out item not found");
    }

    try {
      await assertMonthRangeEditableWithFuture(uid, existing.startMonth, existing.paidBackMonth || undefined);
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

    await deleteLoanedOutItem(uid, id);
    await recomputeAndPersistSnapshots(uid);
    return jsonOk({ ok: true });
  });
}
