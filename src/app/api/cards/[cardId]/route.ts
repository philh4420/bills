import { NextRequest } from "next/server";

import { cardPatchSchema } from "@/lib/api/schemas";
import { withOwnerAuth } from "@/lib/api/handler";
import { assertNoClosedMonths, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import { listCardAccounts, upsertCardAccount } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ cardId: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { cardId } = await context.params;
    const body = await request.json();
    const parsed = cardPatchSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(400, "Invalid card payload", formatZodError(parsed.error));
    }

    const existing = (await listCardAccounts(uid)).find((entry) => entry.id === cardId);
    if (!existing) {
      return jsonError(404, "Card not found.");
    }

    const now = toIsoNow();

    try {
      await assertNoClosedMonths(uid);
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

    await upsertCardAccount(uid, cardId, {
      name: existing.name,
      limit: parsed.data.limit ?? existing.limit,
      usedLimit: parsed.data.usedLimit ?? existing.usedLimit,
      interestRateApr: parsed.data.interestRateApr ?? existing.interestRateApr ?? 0,
      dueDayOfMonth:
        parsed.data.dueDayOfMonth === undefined
          ? (existing.dueDayOfMonth ?? null)
          : parsed.data.dueDayOfMonth,
      createdAt: existing.createdAt,
      updatedAt: now
    });

    await recomputeAndPersistSnapshots(uid);

    return jsonOk({ ok: true });
  });
}
