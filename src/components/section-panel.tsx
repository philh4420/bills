import { ReactNode } from "react";

export function SectionPanel({
  title,
  subtitle,
  children,
  right
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--ring)] bg-gradient-to-r from-white/70 to-transparent px-4 py-4 md:px-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--ink-main)]">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-[var(--ink-soft)]">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="px-4 py-4 md:px-5 md:py-5">
        {children}
      </div>
    </section>
  );
}
