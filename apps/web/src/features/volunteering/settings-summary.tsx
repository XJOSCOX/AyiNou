import type { ReactNode } from "react";

export function VolunteerSettingsSummary({ values }: { values: readonly (readonly [string, number])[] }) {
  return <dl className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2">
    {values.map(([label, value]) => <div key={label} className="flex min-w-0 items-baseline justify-between gap-2 rounded-md bg-[var(--theme-control)] px-3 py-2">
      <dt className="text-sm leading-snug text-[var(--theme-body)]">{label}</dt>
      <dd className="shrink-0 text-sm font-semibold tabular-nums">{value}</dd>
    </div>)}
  </dl>;
}

export function VolunteerSettingsHeading({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
    <h3 className="min-w-0 text-lg font-semibold">{title}</h3>
    {children && <span className="rounded-md bg-[var(--theme-control)] px-2 py-1 text-xs font-medium text-[var(--theme-body)]">{children}</span>}
  </header>;
}

export const volunteerNumberGrid = "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-2";
export const volunteerOptionLabel = "flex min-w-0 items-start gap-2 py-1 [&>input]:mt-0.5 [&>input]:shrink-0";
