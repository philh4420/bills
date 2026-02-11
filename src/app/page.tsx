import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 md:px-6">
      <div className="grid w-full gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="panel p-8 md:p-10">
          <p className="text-[0.68rem] uppercase tracking-[0.24em] text-[var(--ink-soft)]">Bills App v1</p>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--ink-main)] md:text-5xl">Household finances, redesigned.</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--ink-soft)] md:text-base">
            Import workbook data once, track monthly outcomes with formula parity, manage cards and bill collections,
            and plan future purchases in one place.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="button-primary" href="/login">
              Open Login
            </Link>
            <Link className="button-secondary" href="/dashboard">
              Open Dashboard
            </Link>
          </div>
        </section>

        <section className="panel p-6 md:p-7">
          <p className="label">Included in v1</p>
          <ul className="mt-4 space-y-3 text-sm text-[var(--ink-main)]">
            <li className="rounded-xl border border-[var(--ring)] bg-white/70 px-3 py-2">One-time XLSX import and snapshot seeding</li>
            <li className="rounded-xl border border-[var(--ring)] bg-white/70 px-3 py-2">Cards with APR and month-level payment projections</li>
            <li className="rounded-xl border border-[var(--ring)] bg-white/70 px-3 py-2">Bills, income, shopping, my bills, and monthly adjustments</li>
            <li className="rounded-xl border border-[var(--ring)] bg-white/70 px-3 py-2">Purchase planner with statuses, aliases, and links</li>
          </ul>
          <p className="mt-5 text-xs text-[var(--ink-soft)]">Locale: GBP · Timezone: Europe/London · Single owner access</p>
        </section>
      </div>
    </main>
  );
}
