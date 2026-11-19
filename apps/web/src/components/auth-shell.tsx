"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { authMessages } from "@/lib/auth-i18n";
import { locales } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { SiteBrand } from "./site-brand";
import { ThemeToggle } from "./theme-toggle";

export function AuthShell({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useLocale();
  const t = authMessages[locale];
  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <SiteBrand href="/" />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1" role="group" aria-label={t.language}>
            {locales.map((option) => (
              <button key={option} type="button" onClick={() => setLocale(option)} aria-pressed={locale === option}
                className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase ${locale === option ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]" : "bg-[var(--theme-surface)] text-[var(--theme-body)]"}`}>
                {option}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-5 pb-12 pt-4 sm:px-8 md:grid-cols-[0.95fr_1.05fr] md:items-start md:pt-9">
        <div className="hidden overflow-hidden rounded-[2rem] border border-[var(--theme-border)] bg-[var(--theme-hero)] md:block">
          <div className="h-64 bg-[url('/ayinou-coast.webp')] bg-cover bg-center lg:h-80" aria-hidden="true" />
          <div className="px-7 py-8 lg:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--theme-link)]">{t.brandEyebrow}</p>
            <p className="mt-3 text-4xl font-extrabold leading-tight tracking-tight">{t.brandTitle}</p>
          </div>
        </div>
        <div className="w-full max-w-xl rounded-[2rem] border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 shadow-xl shadow-[var(--theme-primary)]/10 sm:p-10">
          {children}
        </div>
      </main>
      <footer className="mx-auto max-w-6xl px-5 pb-10 text-sm text-[var(--theme-body)] sm:px-8">
        <Link href="/" className="underline underline-offset-4">← {t.backHome}</Link>
      </footer>
    </div>
  );
}
