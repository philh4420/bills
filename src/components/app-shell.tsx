"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { useAuth } from "@/lib/auth/client";

const NAV = [
  { href: "/import", label: "Import" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/reconciliation", label: "Reconcile" },
  { href: "/cards", label: "Cards" },
  { href: "/bills", label: "Bills" },
  { href: "/purchases", label: "Purchases" }
] as const;

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--ink-main)]">
      <div className="mx-auto flex w-full max-w-[1880px] gap-3 px-2 py-3 sm:px-3 md:gap-4 md:px-4 md:py-5 lg:px-6 xl:px-8">
        <aside className="panel sticky top-6 hidden h-fit w-60 shrink-0 p-4 xl:block">
          <p className="text-[0.62rem] uppercase tracking-[0.24em] text-[var(--ink-soft)]">Bills App v1</p>
          <h1 className="mt-2 text-xl font-semibold text-[var(--ink-main)]">Household Console</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Owner workspace for cards, bills, imports, and purchases.</p>

          <nav className="mt-5 flex flex-col gap-2">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={`${active ? "tab-active" : "tab-idle"} block w-full`}>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-5 border-t border-[var(--ring)] pt-4">
            <p className="truncate text-xs text-[var(--ink-soft)]">{user?.email}</p>
            <button className="button-secondary mt-3 w-full" onClick={() => signOut()} type="button">
              Sign Out
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="panel p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div>
                <p className="text-[0.62rem] uppercase tracking-[0.24em] text-[var(--ink-soft)]">Owner Dashboard</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--ink-main)] md:text-2xl">{title}</h2>
              </div>
              <div className="w-full sm:w-auto lg:hidden">
                <button className="button-secondary w-full sm:w-auto" onClick={() => signOut()} type="button">
                  Sign Out
                </button>
              </div>
            </div>

            <nav className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:hidden">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${active ? "tab-active" : "tab-idle"} block w-full text-center sm:w-auto sm:text-left sm:whitespace-nowrap`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <main className="pt-3 md:pt-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
