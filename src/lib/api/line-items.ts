import { NextRequest } from "next/server";

import { WriteCommandContext } from "@/lib/audit/context";
import { lineItemCreateSchema, lineItemPatchSchema } from "@/lib/api/schemas";
import { assertNoClosedMonths, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { recomputeAndPersistSnapshots } from "@/lib/firestore/recompute";
import {
  createLineItem,
  deleteLineItem,
  listLineItems,
  updateLineItem
} from "@/lib/firestore/repository";
import { toIsoNow } from "@/lib/util/dates";
import { jsonError, jsonOk } from "@/lib/util/http";
import { formatZodError } from "@/lib/util/zod";

export type LineItemCollection = "houseBills" | "incomeItems" | "shoppingItems" | "myBills";

function monthLockedResponse(lockedMonth: string) {
  return jsonError(
    423,
    `Month ${lockedMonth} is closed. Reopen it in reconciliation before editing.`,
    {
      code: "MONTH_LOCKED",
      month: lockedMonth
    }
  );
}

export async function listLineItemsHandler(uid: string, collection: LineItemCollection) {
  const items = await listLineItems(uid, collection);
  return jsonOk({ items });
}

export async function createLineItemHandler(
  request: NextRequest,
  uid: string,
  collection: LineItemCollection,
  command?: WriteCommandContext
) {
  const body = await request.json();
  const parsed = lineItemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid payload", formatZodError(parsed.error));
  }

  const now = toIsoNow();
  const defaultDueDay = 1;
  try {
    await assertNoClosedMonths(uid);
  } catch (error) {
    const lockedMonth = parseLockedMonthFromError(error);
    if (lockedMonth) {
      return monthLockedResponse(lockedMonth);
    }
    throw error;
  }

  const id = await createLineItem(uid, collection, {
    name: parsed.data.name,
    amount: parsed.data.amount,
    dueDayOfMonth:
      parsed.data.dueDayOfMonth === undefined ? defaultDueDay : parsed.data.dueDayOfMonth,
    createdAt: now,
    updatedAt: now
  });

  command?.setUndo({
    kind: "line-item-create",
    payload: {
      collection,
      id
    }
  });
  command?.setMutation({
    entityType: collection,
    entityId: id,
    before: null,
    after: {
      id,
      name: parsed.data.name,
      amount: parsed.data.amount,
      dueDayOfMonth:
        parsed.data.dueDayOfMonth === undefined ? defaultDueDay : parsed.data.dueDayOfMonth
    },
    message: `Created ${collection} item.`
  });

  await recomputeAndPersistSnapshots(uid);

  return jsonOk({ id }, { status: 201 });
}

export async function patchLineItemHandler(
  request: NextRequest,
  uid: string,
  collection: LineItemCollection,
  id: string,
  command?: WriteCommandContext
) {
  const body = await request.json();
  const parsed = lineItemPatchSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(400, "Invalid payload", formatZodError(parsed.error));
  }

  try {
    await assertNoClosedMonths(uid);
  } catch (error) {
    const lockedMonth = parseLockedMonthFromError(error);
    if (lockedMonth) {
      return monthLockedResponse(lockedMonth);
    }
    throw error;
  }

  const currentItems = await listLineItems(uid, collection);
  const existing = currentItems.find((item) => item.id === id) || null;

  await updateLineItem(uid, collection, id, {
    ...parsed.data,
    updatedAt: toIsoNow()
  });

  if (existing) {
    command?.setUndo({
      kind: "line-item-update",
      payload: {
        collection,
        id,
        before: existing
      }
    });
    command?.setMutation({
      entityType: collection,
      entityId: id,
      before: existing,
      after: {
        ...existing,
        ...parsed.data
      },
      message: `Updated ${collection} item.`
    });
  }

  await recomputeAndPersistSnapshots(uid);

  return jsonOk({ ok: true });
}

export async function deleteLineItemHandler(
  uid: string,
  collection: LineItemCollection,
  id: string,
  command?: WriteCommandContext
) {
  try {
    await assertNoClosedMonths(uid);
  } catch (error) {
    const lockedMonth = parseLockedMonthFromError(error);
    if (lockedMonth) {
      return monthLockedResponse(lockedMonth);
    }
    throw error;
  }

  const currentItems = await listLineItems(uid, collection);
  const existing = currentItems.find((item) => item.id === id) || null;

  await deleteLineItem(uid, collection, id);

  if (existing) {
    command?.setUndo({
      kind: "line-item-delete",
      payload: {
        collection,
        id,
        before: existing
      }
    });
    command?.setMutation({
      entityType: collection,
      entityId: id,
      before: existing,
      after: null,
      message: `Deleted ${collection} item.`
    });
  }

  await recomputeAndPersistSnapshots(uid);
  return jsonOk({ ok: true });
}
