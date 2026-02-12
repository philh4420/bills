import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { deleteLineItemHandler, patchLineItemHandler } from "@/lib/api/line-items";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid, command }) => {
    const { id } = await context.params;
    return patchLineItemHandler(request, uid, "shoppingItems", id, command);
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid, command }) => {
    const { id } = await context.params;
    return deleteLineItemHandler(uid, "shoppingItems", id, command);
  });
}
