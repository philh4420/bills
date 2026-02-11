import { NextRequest } from "next/server";

import { lineItemCreateSchema, lineItemPatchSchema } from "@/lib/api/schemas";
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

export async function listLineItemsHandler(uid: string, collection: LineItemCollection) {
  const items = await listLineItems(uid, collection);
  return jsonOk({ items });
}

export async function createLineItemHandler(
  request: NextRequest,
  uid: string,
  collection: LineItemCollection
) {
  const body = await request.json();
  const parsed = lineItemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid payload", formatZodError(parsed.error));
  }

  const now = toIsoNow();
  const defaultDueDay = collection === "incomeItems" ? null : 1;
  const id = await createLineItem(uid, collection, {
    name: parsed.data.name,
    amount: parsed.data.amount,
    dueDayOfMonth:
      parsed.data.dueDayOfMonth === undefined ? defaultDueDay : parsed.data.dueDayOfMonth,
    createdAt: now,
    updatedAt: now
  });

  await recomputeAndPersistSnapshots(uid);

  return jsonOk({ id }, { status: 201 });
}

export async function patchLineItemHandler(
  request: NextRequest,
  uid: string,
  collection: LineItemCollection,
  id: string
) {
  const body = await request.json();
  const parsed = lineItemPatchSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(400, "Invalid payload", formatZodError(parsed.error));
  }

  await updateLineItem(uid, collection, id, {
    ...parsed.data,
    updatedAt: toIsoNow()
  });

  await recomputeAndPersistSnapshots(uid);

  return jsonOk({ ok: true });
}

export async function deleteLineItemHandler(uid: string, collection: LineItemCollection, id: string) {
  await deleteLineItem(uid, collection, id);
  await recomputeAndPersistSnapshots(uid);
  return jsonOk({ ok: true });
}
