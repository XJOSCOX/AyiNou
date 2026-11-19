"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { accountMessages } from "@/lib/account-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { LanguageSwitch } from "./language-switch";
import { SiteBrand } from "./site-brand";
import { ThemeToggle } from "./theme-toggle";

export function MemberNavbar() {
  const [locale] = useLocale();
  const router = useRouter();

  async function logout() {
    await browserSupabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 xl:px-10">
        <SiteBrand href="/dashboard" />
        <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
          <LanguageSwitch />
          <ThemeToggle />
          <Link href="/settings" aria-label={accountMessages[locale].settings}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-selected)] text-[var(--theme-link)] hover:bg-[var(--theme-button-hover)]">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="12" cy="8" r="3.4" />
              <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
            </svg>
          </Link>
          <button type="button" onClick={logout} className="min-h-9 px-1 text-sm font-semibold text-[var(--theme-link)] hover:underline">
            {authMessages[locale].logout}
          </button>
        </div>
      </div>
    </header>
  );
}
