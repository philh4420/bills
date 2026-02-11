"use client";

import { ReactNode } from "react";

import { RequireAuth } from "@/lib/auth/guard";
import { AppShell } from "@/components/app-shell";

export function ProtectedPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell title={title}>{children}</AppShell>
    </RequireAuth>
  );
}
