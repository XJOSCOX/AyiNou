"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { institutionMessages } from "@/lib/institution-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { feedMessages } from "@/lib/feed-i18n";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { projectMessages } from "@/lib/project-i18n";
import { pollMessages } from "@/lib/poll-i18n";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { eventMessages } from "@/lib/events-i18n";
import { impactCopy } from "@/lib/impact-i18n";
import { messages } from "@/lib/i18n";

const sidebarIcons = {
  "/dashboard": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  "/feed": "M6 5h14M6 12h14M6 19h14M3 5h.01M3 12h.01M3 19h.01",
  "/discover": "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1.8 4.2L21 21",
  "/communities": "M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM6 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1M5 7a2.5 2.5 0 0 0 0 5m14-5a2.5 2.5 0 0 1 0 5M3 18v-1a3 3 0 0 1 2-2.8M21 18v-1a3 3 0 0 0-2-2.8",
  "/projects": "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 13h8",
  "/impact": "M4 4v16h16M8 16v-3m4 3V9m4 7V5",
  "/events": "M4 6h16v15H4z M8 3v6m8-6v6M4 11h16m-11 5h2m3 0h2",
  "/polls": "M4 4v16h16M8 16v-4m5 4V7m5 9v-6",
  "/ambassadors": "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  "/institutions": "M3 9l9-5 9 5H3Zm1 11h16M7 10v7m5-7v7m5-7v7",
};

export function MemberSidebar({ id, expanded, toggle, signedIn }: { id: string; expanded: boolean; toggle: () => void; signedIn: boolean }) {
  const [locale] = useLocale();
  const pathname = usePathname();
  const t = authMessages[locale];
  const institution = institutionMessages[locale];
  const links: { href: keyof typeof sidebarIcons; label: string }[] = [
    { href: "/dashboard", label: t.dashboard },
    { href: "/feed", label: feedMessages[locale].feed },
    { href: "/discover", label: discoveryMessages[locale].discover },
    { href: "/communities", label: communityDirectoryMessages[locale].title },
    { href: "/projects", label: projectMessages[locale].title },
    { href: "/impact", label: impactCopy(locale)("title") },
    { href: "/events", label: eventMessages[locale].events },
    { href: "/polls", label: pollMessages[locale].title },
    { href: "/ambassadors", label: ambassadorMessages[locale].title },
    { href: "/institutions", label: institution.institutions },
  ];
  const navigation = signedIn ? links : links.filter(({ href }) => ["/communities", "/projects", "/impact", "/ambassadors"].includes(href));
  const routeFor = (href: string) => !signedIn && href === "/communities" ? "/community-directory" : href;
  const current = navigation.findLast(({ href }) => {
    const route = routeFor(href);
    return pathname === route || pathname.startsWith(route + "/")
      || (href === "/institutions" && pathname.startsWith("/organization/"))
      || (href === "/communities" && pathname.startsWith("/community-directory"));
  })?.href;

  return (
    <aside className="min-w-0 border-b border-[var(--theme-border)] bg-[var(--theme-surface)] lg:border-e lg:border-b-0">
      <div className={`flex px-3 py-1 lg:py-2 ${expanded ? "justify-end" : "justify-end lg:justify-center lg:px-0"}`}>
        <button type="button" onClick={toggle} aria-expanded={expanded} aria-controls={id}
          aria-label={expanded ? messages[locale].hideSidebar : messages[locale].showSidebar}
          className="grid size-10 shrink-0 place-items-center rounded-md text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M9 5v14" />
            <path d={expanded ? "m15 9-3 3 3 3" : "m13 9 3 3-3 3"} />
          </svg>
        </button>
      </div>
      <nav id={id} aria-label={t.dashboard}
        className={`grid gap-1 pb-3 text-sm font-semibold lg:grid-cols-1 ${expanded
          ? "grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] px-4 sm:px-6 lg:px-3 xl:px-4"
          : "grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] justify-items-center px-2 lg:px-1"}`}>
        {navigation.map(({ href, label }) => (
          <Link key={href} href={routeFor(href)} aria-current={current === href ? "page" : undefined}
            title={expanded ? undefined : label} prefetch={expanded ? undefined : false}
            className={`flex min-h-11 min-w-0 items-center justify-center rounded-md leading-tight text-[var(--theme-body)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)] aria-[current=page]:bg-[var(--theme-selected)] aria-[current=page]:text-[var(--theme-link)] ${expanded
              ? "flex-col gap-1 px-2 py-2 text-center lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-start"
              : "size-11"}`}>
            <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
              <path d={sidebarIcons[href]} />
            </svg>
            <span className={expanded ? "min-w-0 wrap-anywhere" : "sr-only"}>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
