import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { listRecurrenceRules } from "@/lib/firestore/repository";
import { jsonOk } from "@/lib/util/http";

export async function GET(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid }) => {
    const rules = await listRecurrenceRules(uid);
    return jsonOk({ rules });
  });
}
