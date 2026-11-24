"use client";

import { useId, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/locale-store";
import { messages } from "@/lib/i18n";
import { institutionCard } from "./institution-ui";

export function FilterPanel({ children, leading, actions, search, submit, wideSearch = false, active = 0, summary, label, className = "" }: {
  children: ReactNode; leading?: ReactNode; actions?: ReactNode; search?: ReactNode; submit?: ReactNode; wideSearch?: boolean; active?: number; summary?: ReactNode; label?: string; className?: string;
}) {
  const [locale] = useLocale();
  const t = messages[locale];
  const [open, setOpen] = useState(false);
  const panel = useId();
  const searchRow = Boolean(submit || wideSearch);
  const button = <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-1.5 text-start text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round"><path d="M4 6h16M7 12h10m-7 6h4" /></svg>
        <span>{label ?? t.filters}</span>
        {active > 0 && <span className="rounded bg-[var(--theme-selected)] px-1.5 py-0.5 text-xs">
          {t.activeFilters.replace("{count}",new Intl.NumberFormat(locale).format(active))}
        </span>}
        {summary && <span className="min-w-0 break-words text-xs font-medium text-[var(--theme-body)]">{summary}</span>}
        <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" className={open ? "rotate-180" : ""}><path d="m6 9 6 6 6-6" /></svg>
      </button>;
  return <div className={"min-w-0 " + className}>
    <div className={searchRow ? "flex min-w-0 items-center gap-2" : leading ? "flex flex-wrap items-center justify-between gap-2" : "flex flex-wrap items-end gap-3"}>
      {leading}
      {actions ? <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-1">{actions}{button}</div> : button}
      {search && <div className={searchRow ? "min-w-0 flex-1" : "min-w-0 grow basis-48 sm:max-w-xl"}>{search}</div>}
      {submit}
    </div>
    <div hidden={!open} id={panel}>
      <div className={institutionCard + " mt-2 !p-4"}>{children}</div>
    </div>
  </div>;
}
