"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authMessages } from "@/lib/auth-i18n";
import { locales } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";

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
    <div className="min-h-screen bg-[#f4f1e6] text-[#153e35]">
      <header className="border-b border-[#d7dfd3] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/dashboard" className="text-xl font-black tracking-[0.2em]">AYINOU</Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold" aria-label={t.dashboard}>
            <Link href="/dashboard" className="hover:text-[#a3622a]">{t.dashboard}</Link>
            <Link href="/profile" className="hover:text-[#a3622a]">{t.myProfile}</Link>
          </nav>
          <div className="flex items-center gap-3">
            <div className="flex gap-1" role="group" aria-label={t.language}>
              {locales.map((option) => (
                <button key={option} type="button" onClick={() => setLocale(option)} aria-pressed={locale === option}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${locale === option ? "bg-[#155746] text-white" : "bg-[#edf0e7] text-[#365e54]"}`}>
                  {option}
                </button>
              ))}
            </div>
            <button type="button" onClick={logout} className="text-sm font-bold text-[#155746] underline underline-offset-4">{t.logout}</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">{children}</main>
    </div>
  );
}
