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
    <section className="panel section-panel overflow-hidden">
      <div className="section-panel-accent" />
      <div className="section-panel-head flex flex-col gap-3 border-b border-[var(--ring)] px-3 py-4 sm:flex-row sm:items-start sm:justify-between md:px-4 md:py-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--ink-main)]">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-[var(--ink-soft)]">{subtitle}</p> : null}
        </div>
        {right ? <div className="w-full sm:w-auto sm:shrink-0">{right}</div> : null}
      </div>
      <div className="section-panel-body px-3 py-4 md:px-4 md:py-5">{children}</div>
    </section>
  );
}
