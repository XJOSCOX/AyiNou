"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authMessages } from "@/lib/auth-i18n";
import { messages } from "@/lib/i18n";
import { groupMessages } from "@/lib/groups-i18n";
import { projectMessages } from "@/lib/project-i18n";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { useLocale } from "@/lib/locale-store";
import { DisplayControls } from "./display-controls";
import { SiteBrand } from "./site-brand";

const navLink = "inline-flex min-h-10 items-center rounded-md px-2 text-xs font-semibold leading-tight text-[var(--theme-body)] transition-colors hover:bg-[var(--theme-control)] hover:text-[var(--theme-link)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)] [&[aria-current]]:bg-[var(--theme-selected)] [&[aria-current]]:text-[var(--theme-link)] min-[360px]:text-sm sm:px-3";

export function Navbar() {
  const [locale] = useLocale();
  const pathname = usePathname();
  const t = messages[locale];
  const auth = authMessages[locale];
  const home = pathname === "/";
  const sections = [
    { href: home ? "#top" : "/", label: t.home, current: home },
    { href: "/about", label: t.about, current: pathname === "/about" },
    { href: "/community-directory", label: groupMessages[locale].groups, current: pathname.startsWith("/community-directory") },
    { href: "/projects", label: projectMessages[locale].title, current: pathname === "/projects" || pathname.startsWith("/projects/") },
    { href: "/ambassadors", label: ambassadorMessages[locale].title, current: pathname === "/ambassadors" },
  ];

  return (
    <header className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)] lg:sticky lg:top-0 lg:z-30">
      <div className="public-container grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 py-2 lg:min-h-18 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-4">
        <div className="flex min-w-0 justify-self-start">
          <SiteBrand href={home ? "#top" : "/"} />
        </div>
        <nav aria-label="AyiNou" className="order-last col-span-2 flex flex-wrap items-center gap-0.5 border-t border-[var(--theme-border)] pt-1 lg:order-none lg:col-span-1 lg:justify-center lg:gap-1 lg:border-t-0 lg:pt-0">
          {sections.map(({ href, label, current }) => href.startsWith("#")
            ? <a key={href} href={href} aria-current={current ? "location" : undefined} className={navLink}>{label}</a>
            : <Link key={href} href={href} aria-current={current ? "page" : undefined} className={navLink}>{label}</Link>)}
        </nav>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2 lg:flex-nowrap">
          <DisplayControls />
          <Link href="/login" className="ml-auto inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--theme-primary)] px-3 text-sm font-bold text-[var(--theme-on-primary)] transition-colors hover:bg-[var(--theme-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)] sm:px-4 lg:ml-1">
            {auth.login}
            <span aria-hidden="true" className="hidden min-[360px]:inline">→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
