"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { accountMessages } from "@/lib/account-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";

export function MemberSidebar() {
  const [locale] = useLocale();
  const pathname = usePathname();
  const t = authMessages[locale];
  const account = accountMessages[locale];
  const institution = institutionMessages[locale];
  const links = [
    { href: "/dashboard", label: t.dashboard },
    { href: "/profile", label: t.myProfile },
    { href: "/institutions", label: institution.institutions },
    { href: "/verification", label: institution.verification },
    { href: "/settings", label: account.settings },
  ];

  return (
    <aside className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-2 sm:px-6 lg:border-e lg:border-b-0 lg:px-3 lg:py-5 xl:px-4">
      <nav aria-label={t.dashboard} className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-1 text-sm font-semibold lg:grid-cols-1">
        {links.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
            className="flex min-h-10 min-w-0 items-center justify-center rounded-md px-1.5 py-2 text-center leading-tight text-[var(--theme-body)] hover:bg-[var(--theme-control)] aria-[current=page]:bg-[var(--theme-selected)] aria-[current=page]:text-[var(--theme-link)] sm:px-3 lg:justify-start lg:px-4 lg:text-start">
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
