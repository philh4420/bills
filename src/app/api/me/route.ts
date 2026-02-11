import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid, email }) => {
    return jsonOk({ uid, email, role: "owner" });
  });
}
