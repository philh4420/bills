import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { calendarDueDayUpdateSchema } from "@/lib/api/schemas";
import { assertMonthEditable, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import {
  listCardAccounts,
  listLineItems,
  listMonthlyAdjustments,
  updateLineItem,
  updateMonthlyAdjustment,
  upsertCardAccount
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const payload = await request.json();
    const parsed = calendarDueDayUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid due-day payload", formatZodError(parsed.error));
    }

    try {
      await assertMonthEditable(uid, parsed.data.month);
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
    if (parsed.data.sourceType === "cardAccount") {
      const card = (await listCardAccounts(uid)).find((entry) => entry.id === parsed.data.sourceId);
      if (!card) {
        return jsonError(404, "Card not found.");
      }

      await upsertCardAccount(uid, card.id, {
        ...card,
        dueDayOfMonth: parsed.data.dueDayOfMonth,
        updatedAt: now
      });
    } else if (parsed.data.sourceType === "monthlyAdjustment") {
      const adjustment = (await listMonthlyAdjustments(uid)).find((entry) => entry.id === parsed.data.sourceId);
      if (!adjustment) {
        return jsonError(404, "Adjustment not found.");
      }
      await updateMonthlyAdjustment(uid, adjustment.id, {
        dueDayOfMonth: parsed.data.dueDayOfMonth,
        updatedAt: now
      });
    } else {
      const collection =
        parsed.data.sourceType === "houseBill"
          ? "houseBills"
          : parsed.data.sourceType === "shoppingItem"
            ? "shoppingItems"
            : "myBills";
      const item = (await listLineItems(uid, collection)).find((entry) => entry.id === parsed.data.sourceId);
      if (!item) {
        return jsonError(404, "Bill item not found.");
      }
      await updateLineItem(uid, collection, item.id, {
        dueDayOfMonth: parsed.data.dueDayOfMonth,
        updatedAt: now
      });
    }

    await recomputeAndPersistSnapshots(uid);
    return jsonOk({
      ok: true,
      month: parsed.data.month,
      sourceType: parsed.data.sourceType,
      sourceId: parsed.data.sourceId,
      dueDayOfMonth: parsed.data.dueDayOfMonth
    });
  });
}

