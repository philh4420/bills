import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthlyAdjustmentCreateSchema } from "@/lib/api/schemas";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import {
  createMonthlyAdjustment,
  listMonthlyAdjustments
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const adjustments = await listMonthlyAdjustments(uid);
    return jsonOk({ adjustments });
  });
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const payload = await request.json();
    const parsed = monthlyAdjustmentCreateSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    if (parsed.data.endMonth && parsed.data.endMonth < parsed.data.startMonth) {
      return jsonError(400, "endMonth must be greater than or equal to startMonth");
    }

    const now = toIsoNow();
    const id = await createMonthlyAdjustment(uid, {
      name: parsed.data.name,
      amount: parsed.data.amount,
      category: parsed.data.category,
      sourceType: parsed.data.sourceType ?? (parsed.data.category === "income" ? "other" : undefined),
      startMonth: parsed.data.startMonth,
      endMonth: parsed.data.endMonth,
      dueDayOfMonth:
        parsed.data.dueDayOfMonth === undefined ? 1 : parsed.data.dueDayOfMonth,
      createdAt: now,
      updatedAt: now
    });

    await recomputeAndPersistSnapshots(uid);

    return jsonOk({ id }, { status: 201 });
  });
}
