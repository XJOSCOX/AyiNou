"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { authMessages } from "@/lib/auth-i18n";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { LanguageSwitch } from "./language-switch";
import { SiteBrand } from "./site-brand";
import { ThemeToggle } from "./theme-toggle";

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHash() {
  return window.location.hash;
}

function initialHash() {
  return "";
}

export function Navbar() {
  const [locale] = useLocale();
  const hash = useSyncExternalStore(subscribeToHash, readHash, initialHash);
  const t = messages[locale];
  const auth = authMessages[locale];
  const aboutIsCurrent = hash === "#about";
  const sections = [
    { href: "#top", label: t.home, current: !aboutIsCurrent },
    { href: "#about", label: t.about, current: aboutIsCurrent },
  ];

  return (
    <header className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)] lg:sticky lg:top-0 lg:z-30">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 px-4 py-2 sm:px-8 lg:min-h-18 lg:grid-cols-[1fr_auto_1fr] lg:gap-x-4">
        <div className="flex min-w-0 justify-self-start">
          <SiteBrand href="#top" />
        </div>
        <nav aria-label="AyiNou" className="flex items-center justify-end gap-0.5 lg:justify-center lg:gap-1">
          {sections.map(({ href, label, current }) => (
            <a
              key={href}
              href={href}
              aria-current={current ? "location" : undefined}
              className="inline-flex min-h-10 items-center rounded-md px-1.5 text-xs font-semibold leading-tight text-[var(--theme-body)] transition-colors hover:bg-[var(--theme-control)] hover:text-[var(--theme-link)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)] aria-[current=location]:bg-[var(--theme-selected)] aria-[current=location]:text-[var(--theme-link)] min-[360px]:text-sm sm:px-3"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-[var(--theme-border)] pt-2 lg:col-span-1 lg:flex-nowrap lg:justify-self-end lg:border-t-0 lg:pt-0">
          <LanguageSwitch />
          <ThemeToggle />
          <Link href="/login" className="ml-auto inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--theme-primary)] px-3 text-sm font-bold text-[var(--theme-on-primary)] transition-colors hover:bg-[var(--theme-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)] sm:px-4 lg:ml-1">
            {auth.login}
            <span aria-hidden="true" className="hidden min-[360px]:inline">→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
