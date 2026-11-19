"use client";

import Link from "next/link";
import { authMessages } from "@/lib/auth-i18n";
import { locales, messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { SiteBrand } from "./site-brand";
import { ThemeToggle } from "./theme-toggle";

export function Navbar() {
  const [locale, setLocale] = useLocale();
  const t = messages[locale];
  const auth = authMessages[locale];
  return (
    <header className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className="mx-auto w-full max-w-[1500px] px-5 sm:px-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3 sm:py-4">
        <SiteBrand href="#top" />
        <nav aria-label="AyiNou" className="order-last flex w-full gap-5 text-sm font-semibold text-[var(--theme-link)] sm:order-none sm:w-auto">
          <a href="#top" className="underline underline-offset-4">{t.home}</a>
          <a href="#about" className="hover:underline">{t.about}</a>
        </nav>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div role="group" aria-label={t.languageLabel} className="flex rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] p-0.5">
            {locales.map((option) => (
              <button key={option} type="button" onClick={() => setLocale(option)} aria-pressed={locale === option}
                className={`rounded-md px-2 py-2 text-xs font-bold uppercase ${locale === option ? "bg-[var(--theme-selected)] underline underline-offset-4" : "hover:bg-[var(--theme-selected)]"}`}>
                {option}
              </button>
            ))}
          </div>
          <ThemeToggle />
          <Link href="/login" className="rounded-lg border border-[var(--theme-button-border)] bg-[var(--theme-button)] px-3 py-2.5 text-sm font-bold hover:bg-[var(--theme-button-hover)] sm:px-4">{auth.login}</Link>
        </div>
      </div>
    </header>
  );
}
