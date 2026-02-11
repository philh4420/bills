import { NextRequest } from "next/server";

import { purchaseCreateSchema } from "@/lib/api/schemas";
import { withOwnerAuth } from "@/lib/api/handler";
import { createPurchasePlan, listPurchasePlans } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const purchases = await listPurchasePlans(uid);
    return jsonOk({ purchases });
  });
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const body = await request.json();
    const parsed = purchaseCreateSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    const now = toIsoNow();
    const id = await createPurchasePlan(uid, {
      name: parsed.data.name,
      price: parsed.data.price,
      alias: parsed.data.alias,
      link: parsed.data.link,
      status: parsed.data.status,
      createdAt: now,
      updatedAt: now
    });

    return jsonOk({ id }, { status: 201 });
  });
}
