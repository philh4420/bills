import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { deleteLineItemHandler, patchLineItemHandler } from "@/lib/api/line-items";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    return patchLineItemHandler(request, uid, "myBills", id);
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withOwnerAuth(request, async ({ uid }) => {
    const { id } = await context.params;
    return deleteLineItemHandler(uid, "myBills", id);
  });
}
