import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthKeySchema, monthlyIncomePaydaysPutSchema } from "@/lib/api/schemas";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import { listLineItems, listMonthlyIncomePaydays, upsertMonthlyIncomePaydays } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ month: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { month } = await context.params;
    const parsedMonth = monthKeySchema.safeParse(month);
    if (!parsedMonth.success) {
      return jsonError(400, "Invalid month route param. Use YYYY-MM.");
    }

    const payload = await request.json();
    const parsed = monthlyIncomePaydaysPutSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid income paydays payload", formatZodError(parsed.error));
    }

    const [incomeItems, existingEntry] = await Promise.all([
      listLineItems(uid, "incomeItems"),
      listMonthlyIncomePaydays(uid).then((entries) => entries.find((entry) => entry.month === month) || null)
    ]);
    const validIncomeIds = new Set(incomeItems.map((incomeItem) => incomeItem.id));

    const byIncomeId: Record<string, number[]> = {};
    Object.entries(parsed.data.byIncomeId).forEach(([incomeId, days]) => {
      if (!validIncomeIds.has(incomeId)) {
        return;
      }

      if (days === null) {
        return;
      }

      byIncomeId[incomeId] = Array.from(new Set(days)).sort((a, b) => a - b);
    });

    const now = toIsoNow();
    await upsertMonthlyIncomePaydays(uid, month, {
      byIncomeId,
      createdAt: existingEntry?.createdAt ?? now,
      updatedAt: now
    });

    await recomputeAndPersistSnapshots(uid);

    return jsonOk({ ok: true, month });
  });
}
