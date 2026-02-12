import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { createLineItemHandler, listLineItemsHandler } from "@/lib/api/line-items";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => listLineItemsHandler(uid, "incomeItems"));
}

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid, command }) =>
    createLineItemHandler(request, uid, "incomeItems", command)
  );
}
