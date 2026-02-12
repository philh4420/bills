import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { paydayModePutSchema } from "@/lib/api/schemas";
import { assertNoClosedMonths, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import {
  getPaydayModeSettings,
  listLineItems,
  upsertPaydayModeSettings
} from "@/lib/firestore/repository";
import { getDatePartsInTimeZone } from "@/lib/cards/due-date";
import { APP_TIMEZONE } from "@/lib/util/constants";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

function fallbackAnchorDate(): string {
  const parts = getDatePartsInTimeZone(new Date(), APP_TIMEZONE);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const existing = await getPaydayModeSettings(uid);
    return jsonOk({
      settings: existing || {
        id: "primary",
        enabled: false,
        anchorDate: fallbackAnchorDate(),
        cycleDays: 28,
        incomeIds: [],
        createdAt: "",
        updatedAt: ""
      }
    });
  });
}

export async function PUT(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const payload = await request.json();
    const parsed = paydayModePutSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "Invalid payday mode payload", formatZodError(parsed.error));
    }

    const [existing, incomeItems] = await Promise.all([getPaydayModeSettings(uid), listLineItems(uid, "incomeItems")]);
    const validIncomeIds = new Set(incomeItems.map((item) => item.id));
    const incomeIds = Array.from(new Set(parsed.data.incomeIds || []));
    const invalidIncomeIds = incomeIds.filter((id) => !validIncomeIds.has(id));
    if (invalidIncomeIds.length > 0) {
      return jsonError(400, "Invalid payday mode payload", {
        incomeIds: `Unknown income IDs: ${invalidIncomeIds.join(", ")}`
      });
    }

    try {
      await assertNoClosedMonths(uid);
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
    await upsertPaydayModeSettings(uid, {
      enabled: parsed.data.enabled,
      anchorDate: parsed.data.anchorDate,
      cycleDays: parsed.data.cycleDays,
      incomeIds,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });

    await recomputeAndPersistSnapshots(uid);

    return jsonOk({
      ok: true,
      settings: {
        id: "primary",
        enabled: parsed.data.enabled,
        anchorDate: parsed.data.anchorDate,
        cycleDays: parsed.data.cycleDays,
        incomeIds,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      }
    });
  });
}

