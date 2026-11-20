"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { accountMessages } from "@/lib/account-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { feedMessages } from "@/lib/feed-i18n";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { useMemberIdentity } from "@/lib/member-display-name";
import { adminMessages } from "@/lib/admin-i18n";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { projectMessages } from "@/lib/project-i18n";
import { pollMessages } from "@/lib/poll-i18n";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { messages } from "@/lib/i18n";

export function MemberSidebar({ id, expanded, toggle }: { id: string; expanded: boolean; toggle: () => void }) {
  const [locale] = useLocale();
  const pathname = usePathname();
  const t = authMessages[locale];
  const account = accountMessages[locale];
  const institution = institutionMessages[locale];
  const { administrator, reviewer } = useMemberIdentity();
  const links = [
    { href: "/dashboard", label: t.dashboard },
    { href: "/feed", label: feedMessages[locale].feed },
    { href: "/discover", label: discoveryMessages[locale].discover },
    { href: "/communities", label: communityDirectoryMessages[locale].title },
    { href: "/projects", label: projectMessages[locale].title },
    { href: "/polls", label: pollMessages[locale].title },
    { href: "/ambassadors", label: ambassadorMessages[locale].title },
    { href: "/profile", label: t.myProfile },
    { href: "/institutions", label: institution.institutions },
    { href: "/verification", label: institution.verification },
    { href: "/settings", label: account.settings },
  ];
  if (administrator) links.push({ href: "/admin", label: adminMessages[locale].administration });
  if (reviewer) links.push({ href: "/verification/review", label: institution.review });
  const current = links.findLast(({ href }) => pathname === href || pathname.startsWith(`${href}/`))?.href;

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
      <nav id={id} hidden={!expanded} aria-label={t.dashboard}
        className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-1 px-4 pb-3 text-sm font-semibold sm:px-6 lg:grid-cols-1 lg:px-3 xl:px-4">
        {links.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={current === href ? "page" : undefined}
            className="flex min-h-10 min-w-0 items-center justify-center rounded-md px-1.5 py-2 text-center leading-tight text-[var(--theme-body)] hover:bg-[var(--theme-control)] aria-[current=page]:bg-[var(--theme-selected)] aria-[current=page]:text-[var(--theme-link)] sm:px-3 lg:justify-start lg:px-4 lg:text-start">
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
