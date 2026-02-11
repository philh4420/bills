import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { listCardAccounts } from "@/lib/firestore/repository";
import { jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const cards = await listCardAccounts(uid);
    return jsonOk({ cards });
  });
}
