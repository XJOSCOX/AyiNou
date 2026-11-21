"use client";

import Link from "next/link";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { publicContactEmail } from "@/lib/public-contact";

const footerLink = "inline-flex min-h-11 items-center font-semibold text-[var(--theme-link)] underline-offset-4 hover:underline focus-visible:underline";

export function SiteFooter({ member = false }: { member?: boolean }) {
  const [locale] = useLocale();
  const t = messages[locale];
  const layout = member ? "px-4 sm:px-6 xl:px-10" : "public-container";

  return (
    <footer className="border-t border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text)]">
      <div className={`flex w-full flex-wrap items-center justify-between gap-x-8 gap-y-2 py-5 sm:py-6 ${layout}`}>
        <div className="min-w-0">
          <p className="font-bold tracking-tight">AyiNou</p>
          <p className="mt-1 max-w-[60ch] text-sm text-[var(--theme-body)]">{t.footer}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 text-sm">
          <Link href="/about" className={footerLink}>{t.about}</Link>
          <a href={`mailto:${publicContactEmail}`} className={footerLink}>{publicContactEmail}</a>
        </div>
      </div>
    </footer>
  );
}
