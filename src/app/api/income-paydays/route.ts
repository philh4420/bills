import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { monthKeySchema } from "@/lib/api/schemas";
import { getDatePartsInTimeZone } from "@/lib/cards/due-date";
import { extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import {
  getPaydayModeSettings,
  listLineItems,
  listMonthlyIncomePaydays,
  listMonthlyPayments
} from "@/lib/firestore/repository";
import { incomeUsesPaydayMode, resolveIncomePaydaysForMonth } from "@/lib/payday/mode";
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

    const [incomeItems, paydays, monthlyPayments, paydayModeSettings] = await Promise.all([
      listLineItems(uid, "incomeItems"),
      listMonthlyIncomePaydays(uid),
      listMonthlyPayments(uid),
      getPaydayModeSettings(uid)
    ]);

    const months = extendMonthlyPaymentsToYearEnd(monthlyPayments).map((entry) => entry.month);
    const now = getDatePartsInTimeZone(new Date(), APP_TIMEZONE);
    const currentMonth = `${String(now.year).padStart(4, "0")}-${String(now.month).padStart(2, "0")}`;
    const fallbackMonth = months.includes(currentMonth) ? currentMonth : months[0] || currentMonth;
    const selectedMonth = monthParam || fallbackMonth;
    const selectedOverride = paydays.find((entry) => entry.month === selectedMonth) || null;

    const byIncomeId = resolveIncomePaydaysForMonth({
      month: selectedMonth,
      incomeItems,
      incomePaydayOverridesByIncomeId: selectedOverride?.byIncomeId || {},
      paydayModeSettings
    });
    const defaultByIncomeId = resolveIncomePaydaysForMonth({
      month: selectedMonth,
      incomeItems,
      incomePaydayOverridesByIncomeId: {},
      paydayModeSettings
    });

    return jsonOk({
      months,
      selectedMonth,
      incomes: incomeItems.map((incomeItem) => ({
        id: incomeItem.id,
        name: incomeItem.name,
        amount: incomeItem.amount,
        defaultPayDays: defaultByIncomeId[incomeItem.id] || [incomeItem.dueDayOfMonth ?? 1],
        modeSource: incomeUsesPaydayMode(paydayModeSettings, incomeItem.id)
          ? "payday-mode"
          : "line-item-default"
      })),
      byIncomeId,
      hasOverrides: Boolean(selectedOverride),
      paydayMode: paydayModeSettings
        ? {
            enabled: paydayModeSettings.enabled,
            anchorDate: paydayModeSettings.anchorDate,
            cycleDays: paydayModeSettings.cycleDays,
            incomeIds: paydayModeSettings.incomeIds || []
          }
        : {
            enabled: false,
            anchorDate: "",
            cycleDays: 28,
            incomeIds: []
          }
    });
  });
}
