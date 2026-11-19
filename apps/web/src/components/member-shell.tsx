"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authMessages } from "@/lib/auth-i18n";
import { locales } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { SiteBrand } from "./site-brand";
import { ThemeToggle } from "./theme-toggle";

export function MemberShell({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useLocale();
  const t = authMessages[locale];
  const router = useRouter();

  async function logout() {
    await browserSupabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <header className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <SiteBrand href="/dashboard" />
          <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold" aria-label={t.dashboard}>
            <Link href="/dashboard" className="hover:text-[var(--theme-link)]">{t.dashboard}</Link>
            <Link href="/profile" className="hover:text-[var(--theme-link)]">{t.myProfile}</Link>
          </nav>
          <div className="flex items-center gap-3">
            <div className="flex gap-1" role="group" aria-label={t.language}>
              {locales.map((option) => (
                <button key={option} type="button" onClick={() => setLocale(option)} aria-pressed={locale === option}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${locale === option ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]" : "bg-[var(--theme-control)] text-[var(--theme-body)]"}`}>
                  {option}
                </button>
              ))}
            </div>
            <ThemeToggle />
            <button type="button" onClick={logout} className="text-sm font-bold text-[var(--theme-link)] underline underline-offset-4">{t.logout}</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">{children}</main>
    </div>
  );
}
