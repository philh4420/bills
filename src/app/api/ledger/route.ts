import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthKeySchema } from "@/lib/api/schemas";
import { listLedgerEntries } from "@/lib/firestore/repository";
import { jsonError, jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const month = request.nextUrl.searchParams.get("month");
    if (month) {
      const parsedMonth = monthKeySchema.safeParse(month);
      if (!parsedMonth.success) {
        return jsonError(400, "Invalid month query. Use YYYY-MM.");
      }
    }

    const entries = await listLedgerEntries(uid, month || undefined);
    return jsonOk({ entries, month: month || null });
  });
}
