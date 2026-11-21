"use client";

import Image from "next/image";
import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";

export function FounderVerifiedBadge() {
  const [locale] = useLocale();
  const t = founderMessages[locale];
  return <div className="mt-3 grid gap-2 text-sm">
    <span className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-2.5 py-1 font-semibold text-[var(--theme-text)]">
      <Image src="/founder-verified.png" width={18} height={18} alt="" unoptimized className="size-[18px] shrink-0" />
      {t.badge}
    </span>
    <p className="text-[var(--theme-body)]">{t.badgeMeaning}</p>
  </div>;
}
