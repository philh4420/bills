"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/lib/auth/client";
import { SyncStatus } from "@/components/sync-status";

const NAV = [
  { href: "/import", label: "Import" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/net-worth", label: "Net Worth" },
  { href: "/history", label: "History" },
  { href: "/reconciliation", label: "Reconcile" },
  { href: "/cards", label: "Cards" },
  { href: "/bills", label: "Bills" },
  { href: "/purchases", label: "Purchases" }
] as const;

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const rawPathname = usePathname();
  const [pathname, setPathname] = useState("");
  const { user, signOut } = useAuth();
  const [compactMoreOpen, setCompactMoreOpen] = useState(false);
  const compactMoreRef = useRef<HTMLDivElement | null>(null);

  const compactPrimary = useMemo(
    () =>
      NAV.filter((item) =>
        ["/dashboard", "/bills", "/cards"].includes(item.href)
      ),
    []
  );
  const compactMore = useMemo(
    () => NAV.filter((item) => !compactPrimary.some((primary) => primary.href === item.href)),
    [compactPrimary]
  );
  const compactMoreActive = compactMore.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  useEffect(() => {
    if (rawPathname) {
      setPathname(rawPathname);
    }
  }, [rawPathname]);

  useEffect(() => {
    setCompactMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!compactMoreOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!compactMoreRef.current) {
        return;
      }
      if (!compactMoreRef.current.contains(event.target as Node)) {
        setCompactMoreOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [compactMoreOpen]);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--ink-main)]">
      <div className="mx-auto grid w-full max-w-[1760px] grid-cols-1 gap-3 px-3 py-3 sm:px-4 sm:py-4 md:gap-4 lg:px-6 xl:px-8 2xl:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="panel sticky top-5 hidden h-[calc(100vh-2.5rem)] min-h-[620px] overflow-hidden 2xl:flex 2xl:flex-col">
          <div className="border-b border-[var(--ring)] p-4">
            <p className="text-[0.62rem] uppercase tracking-[0.24em] text-[var(--ink-soft)]">Bills App v1</p>
            <h1 className="mt-2 text-xl font-semibold text-[var(--ink-main)]">Household Console</h1>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Owner workspace for cards, bills, imports, planning, and alerts.
            </p>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto p-3">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${active ? "tab-active" : "tab-idle"} block w-full text-left`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-[var(--ring)] p-3">
            <p className="truncate text-xs text-[var(--ink-soft)]">{user?.email}</p>
            <button className="button-secondary mt-3 w-full" onClick={() => signOut()} type="button">
              Sign Out
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="panel p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.62rem] uppercase tracking-[0.24em] text-[var(--ink-soft)]">Owner Dashboard</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--ink-main)] md:text-2xl">{title}</h2>
              </div>
              <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                {user?.email ? (
                  <span className="hidden max-w-[300px] truncate rounded-full border border-[var(--ring)] bg-white/70 px-3 py-2 text-xs text-[var(--ink-soft)] lg:inline-block">
                    {user.email}
                  </span>
                ) : null}
                <button className="button-secondary w-full sm:w-auto 2xl:hidden" onClick={() => signOut()} type="button">
                  Sign Out
                </button>
              </div>
            </div>

            <nav className="compact-nav mt-4 flex items-center gap-2 min-[480px]:hidden 2xl:hidden">
              {compactPrimary.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={`compact-${item.href}`}
                    href={item.href}
                    className={`${active ? "tab-active" : "tab-idle"} min-w-[0] flex-1 text-center text-[0.8rem]`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <div className="relative" ref={compactMoreRef}>
                <button
                  type="button"
                  className={`${compactMoreActive ? "tab-active" : "tab-idle"} min-w-[86px]`}
                  onClick={() => setCompactMoreOpen((prev) => !prev)}
                  aria-expanded={compactMoreOpen}
                  aria-haspopup="menu"
                >
                  More
                </button>
                {compactMoreOpen ? (
                  <div className="nav-more-menu panel absolute right-0 top-[calc(100%+0.45rem)] z-30 min-w-[180px] p-2">
                    <p className="px-2 pb-1 text-[0.64rem] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                      Navigate
                    </p>
                    {compactMore.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={`compact-more-${item.href}`}
                          href={item.href}
                          className={`${active ? "tab-active" : "tab-idle"} block w-full text-left`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </nav>

            <nav className="mt-4 hidden grid-cols-2 gap-2 min-[480px]:grid sm:grid-cols-3 lg:flex lg:flex-wrap 2xl:hidden">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${active ? "tab-active" : "tab-idle"} block w-full text-center lg:w-auto lg:text-left`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <div className="pt-3">
            <SyncStatus />
          </div>

          <main className="pt-3 md:pt-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
