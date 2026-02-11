import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthKeySchema } from "@/lib/api/schemas";
import { getDatePartsInTimeZone } from "@/lib/cards/due-date";
import { extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import { listLineItems, listMonthlyIncomePaydays, listMonthlyPayments } from "@/lib/firestore/repository";
import { APP_TIMEZONE } from "@/lib/util/constants";
import { jsonError, jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const monthParam = request.nextUrl.searchParams.get("month");
    if (monthParam) {
      const parsed = monthKeySchema.safeParse(monthParam);
      if (!parsed.success) {
        return jsonError(400, "Invalid month query. Use YYYY-MM.");
      }
    }

    const [incomeItems, paydays, monthlyPayments] = await Promise.all([
      listLineItems(uid, "incomeItems"),
      listMonthlyIncomePaydays(uid),
      listMonthlyPayments(uid)
    ]);

    const months = extendMonthlyPaymentsToYearEnd(monthlyPayments).map((entry) => entry.month);
    const now = getDatePartsInTimeZone(new Date(), APP_TIMEZONE);
    const currentMonth = `${String(now.year).padStart(4, "0")}-${String(now.month).padStart(2, "0")}`;
    const fallbackMonth = months.includes(currentMonth) ? currentMonth : months[0] || currentMonth;
    const selectedMonth = monthParam || fallbackMonth;
    const selectedOverride = paydays.find((entry) => entry.month === selectedMonth) || null;

    const byIncomeId: Record<string, number[]> = {};
    incomeItems.forEach((incomeItem) => {
      const overrideDays = selectedOverride?.byIncomeId[incomeItem.id] || [];
      byIncomeId[incomeItem.id] =
        overrideDays.length > 0 ? overrideDays : [incomeItem.dueDayOfMonth ?? 1];
    });

    return jsonOk({
      months,
      selectedMonth,
      incomes: incomeItems.map((incomeItem) => ({
        id: incomeItem.id,
        name: incomeItem.name,
        amount: incomeItem.amount,
        defaultPayDay: incomeItem.dueDayOfMonth ?? 1
      })),
      byIncomeId,
      hasOverrides: Boolean(selectedOverride)
    });
  });
}
