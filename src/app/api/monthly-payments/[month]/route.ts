import { NextRequest } from "next/server";

import { monthKeySchema, monthlyPaymentsPutSchema } from "@/lib/api/schemas";
import { withOwnerAuth } from "@/lib/api/handler";
import { assertMonthEditable, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import { listMonthlyPayments, upsertMonthlyPayment } from "@/lib/firestore/repository";
import { normalizeCurrency } from "@/lib/util/numbers";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ month: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { month } = await context.params;
    const monthParsed = monthKeySchema.safeParse(month);

    if (!monthParsed.success) {
      return jsonError(400, "Invalid month route param. Use YYYY-MM.");
    }

    const payload = await request.json();
    const parsed = monthlyPaymentsPutSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(400, "Invalid monthly payments payload", formatZodError(parsed.error));
    }

    const existing = (await listMonthlyPayments(uid)).find((entry) => entry.month === month);
    const now = toIsoNow();
    const total = normalizeCurrency(
      Object.values(parsed.data.byCardId).reduce((acc, value) => acc + value, 0)
    );

    try {
      await assertMonthEditable(uid, month);
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

    await upsertMonthlyPayment(uid, month, {
      byCardId: parsed.data.byCardId,
      total,
      formulaVariantId: parsed.data.formulaVariantId,
      formulaExpression: parsed.data.formulaExpression ?? null,
      inferred: parsed.data.inferred,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });

    await recomputeAndPersistSnapshots(uid);

    return jsonOk({ ok: true, month, total });
  });
}
