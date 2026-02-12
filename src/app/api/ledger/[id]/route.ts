import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { ledgerEntryPatchSchema } from "@/lib/api/schemas";
import { assertMonthEditable, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { getLedgerEntry, updateLedgerEntry } from "@/lib/firestore/repository";
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
    const parsed = ledgerEntryPatchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload", formatZodError(parsed.error));
    }

    const existing = await getLedgerEntry(uid, id);
    if (!existing) {
      return jsonError(404, "Ledger entry not found.");
    }

    try {
      await assertMonthEditable(uid, existing.month);
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

    const now = toIsoNow();
    if (parsed.data.status === "planned") {
      await updateLedgerEntry(uid, id, {
        status: "planned",
        postedAt: undefined,
        paidAt: undefined,
        updatedAt: now
      });
    } else if (parsed.data.status === "posted") {
      await updateLedgerEntry(uid, id, {
        status: "posted",
        postedAt: existing.postedAt || now,
        paidAt: undefined,
        updatedAt: now
      });
    } else {
      await updateLedgerEntry(uid, id, {
        status: "paid",
        postedAt: existing.postedAt || now,
        paidAt: existing.paidAt || now,
        updatedAt: now
      });
    }

    return jsonOk({ ok: true, id, status: parsed.data.status });
  });
}
