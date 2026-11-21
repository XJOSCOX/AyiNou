"use client";

import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";

export function FounderVerifiedBadge() {
  const [locale] = useLocale();
  const t = founderMessages[locale];
  return <div className="mt-3 grid gap-2 text-sm">
    <span className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-2.5 py-1 font-semibold text-[var(--theme-text)]">
      <span aria-hidden="true" className="size-2.5 rotate-45 rounded-xs bg-[var(--theme-chart-secondary)]" />
      {t.badge}
    </span>
    <p className="text-[var(--theme-body)]">{t.badgeMeaning}</p>
  </div>;
}
