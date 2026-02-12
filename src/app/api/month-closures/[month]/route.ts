import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthClosurePutSchema, monthKeySchema } from "@/lib/api/schemas";
import { getMonthClosure, upsertMonthClosure } from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
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

    const closure = await getMonthClosure(uid, month);
    return jsonOk({ closure });
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ month: string }> }
) {
  return withOwnerAuth(request, async ({ uid, email }) => {
    const { month } = await context.params;
    const parsedMonth = monthKeySchema.safeParse(month);
    if (!parsedMonth.success) {
      return jsonError(400, "Invalid month route param. Use YYYY-MM.");
    }

    const body = await request.json();
    const parsed = monthClosurePutSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    const existing = await getMonthClosure(uid, month);
    const now = toIsoNow();
    await upsertMonthClosure(uid, month, {
      month,
      closed: parsed.data.closed,
      reason: parsed.data.reason?.trim() || undefined,
      closedAt: parsed.data.closed ? now : undefined,
      closedBy: parsed.data.closed ? email : undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });

    const closure = await getMonthClosure(uid, month);
    return jsonOk({ closure });
  });
}
