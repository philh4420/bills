import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { loanedOutCreateSchema } from "@/lib/api/schemas";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import { createLoanedOutItem, listLoanedOutItems } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const items = await listLoanedOutItems(uid);
    return jsonOk({ items });
  });
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const payload = await request.json();
    const parsed = loanedOutCreateSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    const now = toIsoNow();
    const id = await createLoanedOutItem(uid, {
      name: parsed.data.name,
      amount: parsed.data.amount,
      startMonth: parsed.data.startMonth,
      status: parsed.data.status,
      paidBackMonth: parsed.data.status === "paidBack" ? parsed.data.paidBackMonth : undefined,
      createdAt: now,
      updatedAt: now
    });

    await recomputeAndPersistSnapshots(uid);

    return jsonOk({ id }, { status: 201 });
  });
}
