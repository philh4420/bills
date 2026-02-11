import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/server";
import { jsonError } from "@/lib/util/http";

export async function withOwnerAuth<T>(
  request: NextRequest,
  fn: (context: { uid: string; email: string }) => Promise<T>
) {
  try {
    const auth = await requireAuth(request);
    return await fn({ uid: auth.uid, email: auth.email });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return jsonError(401, "Unauthorized");
      }
      if (error.message === "FORBIDDEN" || error.message === "FORBIDDEN_OWNER_MISMATCH") {
        return jsonError(403, "Access denied: this app is private to a single owner account.");
      }
      if (error.message === "OWNER_NOT_CONFIGURED") {
        return jsonError(
          500,
          "Owner lock is not configured. Set OWNER_UID or OWNER_GOOGLE_EMAIL."
        );
      }
    }

    return jsonError(500, "Authentication failure", error instanceof Error ? error.message : error);
  }
}
