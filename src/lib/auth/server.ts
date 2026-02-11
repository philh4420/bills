import { NextRequest } from "next/server";

import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

export interface AuthContext {
  uid: string;
  email: string;
  isOwner: boolean;
}

function getOwnerConfig() {
  const ownerUid = process.env.OWNER_UID?.trim() || null;
  const ownerEmail = process.env.OWNER_GOOGLE_EMAIL?.trim().toLowerCase() || null;
  return { ownerUid, ownerEmail };
}

function matchesOwner(
  decoded: { uid: string; email?: string },
  ownerConfig: { ownerUid: string | null; ownerEmail: string | null }
) {
  if (ownerConfig.ownerUid && decoded.uid === ownerConfig.ownerUid) {
    return true;
  }

  if (ownerConfig.ownerEmail && decoded.email?.toLowerCase() === ownerConfig.ownerEmail) {
    return true;
  }

  return false;
}

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const token = getBearerToken(request);
  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
  const email = decoded.email || "";
  const ownerConfig = getOwnerConfig();
  const hasOwnerConfig = Boolean(ownerConfig.ownerUid || ownerConfig.ownerEmail);

  if (!hasOwnerConfig) {
    // Local DX fallback: allow authenticated user when owner allowlist is not configured.
    // Production requires explicit OWNER_UID or OWNER_GOOGLE_EMAIL.
    if (process.env.NODE_ENV === "production") {
      throw new Error("OWNER_NOT_CONFIGURED");
    }

    return {
      uid: decoded.uid,
      email,
      isOwner: true
    };
  }

  const isOwner = matchesOwner({ uid: decoded.uid, email: decoded.email || undefined }, ownerConfig);
  if (!isOwner) {
    throw new Error("FORBIDDEN_OWNER_MISMATCH");
  }

  return {
    uid: decoded.uid,
    email,
    isOwner
  };
}
