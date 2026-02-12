import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthKeySchema } from "@/lib/api/schemas";
import { getReconciliation, listReconciliations } from "@/lib/firestore/repository";
import { jsonError, jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const month = request.nextUrl.searchParams.get("month");
    if (month) {
      const parsedMonth = monthKeySchema.safeParse(month);
      if (!parsedMonth.success) {
        return jsonError(400, "Invalid month query. Use YYYY-MM.");
      }
      const reconciliation = await getReconciliation(uid, month);
      return jsonOk({ reconciliation });
    }

    const reconciliations = await listReconciliations(uid);
    return jsonOk({ reconciliations });
  });
}
