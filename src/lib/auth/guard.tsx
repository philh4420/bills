"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

import { useAuth } from "@/lib/auth/client";

export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, ownerLoading, isOwner, ownerError } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && !ownerLoading && user && !isOwner) {
      router.replace("/login");
    }
  }, [loading, ownerLoading, user, isOwner, router]);

  if (loading || ownerLoading || !user || !isOwner) {
    return (
      <div className="p-6 text-sm text-neutral-600">
        {ownerError ? `Access check: ${ownerError}` : "Checking session..."}
      </div>
    );
  }

  return <>{children}</>;
}
