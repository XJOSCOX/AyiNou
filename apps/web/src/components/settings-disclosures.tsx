import type { ReactNode } from "react";

export const settingsDisclosureSummary = "flex min-h-10 min-w-0 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden";

export function SettingsOptions({ title, children }: { title: string; children: ReactNode }) {
  return <details className="group/options min-w-0 rounded-md border border-[var(--theme-border)]">
    <summary className={settingsDisclosureSummary}>
      <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
      <span aria-hidden="true" className="size-2 shrink-0 rotate-45 border-e border-b group-open/options:rotate-[225deg]" />
    </summary>
    <fieldset className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-x-3 gap-y-1 border-t border-[var(--theme-border)] px-3 py-2 text-sm">
      <legend className="sr-only">{title}</legend>
      {children}
    </fieldset>
  </details>;
}

export function SettingsHistory({ title, children }: { title: string; children: ReactNode }) {
  return <details className="group/history min-w-0 rounded-md border border-[var(--theme-border)]">
    <summary className={settingsDisclosureSummary}>
      <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
      <span aria-hidden="true" className="size-2 shrink-0 rotate-45 border-e border-b group-open/history:rotate-[225deg]" />
    </summary>
    <div className="border-t border-[var(--theme-border)] p-3 text-sm">{children}</div>
  </details>;
}
