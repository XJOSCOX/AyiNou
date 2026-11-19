"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { authMessages } from "@/lib/auth-i18n";
import { locales } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";

export function AuthShell({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useLocale();
  const t = authMessages[locale];
  return (
    <div className="min-h-screen bg-[#f4f1e6] text-[#153e35]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Link href="/" className="text-xl font-black tracking-[0.2em]">AYINOU</Link>
        <div className="flex items-center gap-2" role="group" aria-label={t.language}>
          {locales.map((option) => (
            <button key={option} type="button" onClick={() => setLocale(option)} aria-pressed={locale === option}
              className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase ${locale === option ? "bg-[#155746] text-white" : "bg-white text-[#365e54]"}`}>
              {option}
            </button>
          ))}
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-10 sm:px-8 md:grid-cols-[0.9fr_1.1fr] md:items-center md:pt-20">
        <div className="hidden md:block">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a3622a]">{t.brandEyebrow}</p>
          <h1 className="mt-5 font-serif text-6xl leading-tight">{t.brandTitle}</h1>
          <div className="mt-10 h-2 w-32 rounded-full bg-[#e1a64d]" />
        </div>
        <div className="w-full max-w-xl rounded-[2rem] border border-[#d8dfd1] bg-white p-6 shadow-xl shadow-[#174e41]/10 sm:p-10">
          {children}
        </div>
      </main>
      <footer className="mx-auto max-w-6xl px-5 pb-10 text-sm text-[#587067] sm:px-8">
        <Link href="/" className="underline underline-offset-4">← {t.backHome}</Link>
      </footer>
    </div>
  );
}
