"use client";

import type { ReactNode } from "react";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { MemberNavbar } from "./member-navbar";
import { MemberSidebar } from "./member-sidebar";
import { SiteFooter } from "./site-footer";

export function MemberShell({ children }: { children: ReactNode }) {
  const [locale] = useLocale();

  return (
    <div id="top" className="flex min-h-dvh flex-col text-[var(--theme-text)]">
      <a href="#member-main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-[var(--theme-surface)] focus:p-4">
        {messages[locale].skip}
      </a>
      <MemberNavbar />
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[clamp(12rem,16vw,16rem)_minmax(0,1fr)]">
        <MemberSidebar />
        <main id="member-main" tabIndex={-1} className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 xl:px-10 xl:py-9">
          {children}
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
