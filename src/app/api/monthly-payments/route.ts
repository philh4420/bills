import { NextRequest } from "next/server";

import { monthKeySchema } from "@/lib/api/schemas";
import { withOwnerAuth } from "@/lib/api/handler";
import { extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import { listMonthlyPayments } from "@/lib/firestore/repository";
import { jsonError, jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const monthParam = request.nextUrl.searchParams.get("month");
    const payments = extendMonthlyPaymentsToYearEnd(await listMonthlyPayments(uid));

    if (!monthParam) {
      return jsonOk({ payments });
    }

    const parsed = monthKeySchema.safeParse(monthParam);
    if (!parsed.success) {
      return jsonError(400, "Invalid month query. Use YYYY-MM.");
    }

    return jsonOk({ payment: payments.find((entry) => entry.month === monthParam) || null });
  });
}
