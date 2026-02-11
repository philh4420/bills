import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { bankBalancePutSchema } from "@/lib/api/schemas";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import { getBankBalance, upsertBankBalance } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const bankBalance = await getBankBalance(uid);
    return jsonOk({ bankBalance });
  });
}

export async function PUT(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const payload = await request.json();
    const parsed = bankBalancePutSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    const existing = await getBankBalance(uid);
    const now = toIsoNow();

    await upsertBankBalance(
      uid,
      {
        amount: parsed.data.amount,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      },
      "primary"
    );

    await recomputeAndPersistSnapshots(uid);

    return jsonOk({ id: "primary" });
  });
}
