import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthKeySchema, reconciliationPutSchema } from "@/lib/api/schemas";
import {
  getReconciliation,
  listMonthSnapshots,
  upsertReconciliation
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { normalizeCurrency } from "@/lib/util/numbers";
import { formatZodError } from "@/lib/util/zod";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ month: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { month } = await context.params;
    const parsedMonth = monthKeySchema.safeParse(month);
    if (!parsedMonth.success) {
      return jsonError(400, "Invalid month route param. Use YYYY-MM.");
    }

    const reconciliation = await getReconciliation(uid, month);
    return jsonOk({ reconciliation });
  });
}

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

    const body = await request.json();
    const parsed = reconciliationPutSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    const snapshots = await listMonthSnapshots(uid);
    const snapshot = snapshots.find((entry) => entry.month === month) || null;
    if (!snapshot) {
      return jsonError(404, "No snapshot found for this month.");
    }

    const expectedBalance = normalizeCurrency(snapshot.moneyInBank);
    const actualBalance = normalizeCurrency(parsed.data.actualBalance);
    const variance = normalizeCurrency(actualBalance - expectedBalance);
    const status = Math.abs(variance) <= 0.01 ? "matched" : "variance";
    const existing = await getReconciliation(uid, month);
    const now = toIsoNow();

    await upsertReconciliation(uid, month, {
      month,
      expectedBalance,
      actualBalance,
      variance,
      status,
      notes: parsed.data.notes?.trim() || undefined,
      reconciledAt: now,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });

    const reconciliation = await getReconciliation(uid, month);
    return jsonOk({ reconciliation });
  });
}
