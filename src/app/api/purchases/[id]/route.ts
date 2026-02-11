import { NextRequest } from "next/server";

import { purchasePatchSchema } from "@/lib/api/schemas";
import { withOwnerAuth } from "@/lib/api/handler";
import { updatePurchasePlan } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = purchasePatchSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    await updatePurchasePlan(uid, id, {
      ...parsed.data,
      updatedAt: toIsoNow()
    });

    return jsonOk({ ok: true });
  });
}
