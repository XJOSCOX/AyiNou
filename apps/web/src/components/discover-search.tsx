import type { ComponentProps } from "react";
import { institutionAction } from "./institution-ui";

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="10.75" cy="10.75" r="5.75" /><path d="m15 15 4.5 4.5" />
  </svg>;
}

export function DiscoverSearchInput({ label, ...props }: Omit<ComponentProps<"input">, "className" | "type"> & { label: string }) {
  return <label className="relative block min-w-0">
    <span className="sr-only">{label}</span>
    <span className="pointer-events-none absolute inset-y-0 start-3 hidden items-center text-[var(--theme-body)] sm:flex"><SearchIcon /></span>
    <input {...props} type="search" className="min-h-11 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-3 py-2 text-sm text-[var(--theme-text)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)] sm:ps-10" />
  </label>;
}

export function DiscoverSearchButton({ label }: { label: string }) {
  return <button type="submit" className={institutionAction + " min-h-11 shrink-0 gap-2 !px-3"}>
    <SearchIcon /><span className="sr-only sm:not-sr-only">{label}</span>
  </button>;
}
