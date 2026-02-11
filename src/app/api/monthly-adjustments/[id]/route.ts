import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthlyAdjustmentPatchSchema } from "@/lib/api/schemas";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import {
  deleteMonthlyAdjustment,
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
    await deleteMonthlyAdjustment(uid, id);
    await recomputeAndPersistSnapshots(uid);
    return jsonOk({ ok: true });
  });
}
