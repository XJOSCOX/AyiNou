"use client";

import Link from "next/link";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import { pollMessages } from "@/lib/poll-i18n";
import { institutionAction } from "./institution-ui";
import { PageHeader } from "./page-header";

const tabs = [
  { href: "/polls", label: "title", area: "browse" },
  { href: "/polls/mine", label: "mine", area: "mine" },
  { href: "/polls/nominations", label: "nominations", area: "nominations" },
] as const;

export function PollsHeader({ area }: { area: (typeof tabs)[number]["area"] | "new" | "detail" }) {
  const [locale] = useLocale();
  const t = pollMessages[locale];
  const title = area === "new" ? t.create : area === "mine" ? t.mine : area === "nominations" ? t.nominations : t.title;
  const description = area === "nominations" ? t.consentHelp : t.rules;
  const showCreate = area === "browse" || area === "mine";

  return <div className="min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
    <PageHeader title={title} titleAs={area === "detail" ? "p" : "h1"} description={description}
      className="!border-0 !bg-transparent sm:!py-4 [&>div:first-child]:!border-0 [&>div:first-child]:!ps-0 [&>div+div]:ms-auto"
      actions={showCreate ? <Link href="/polls/new" className={institutionAction + " gap-2"}>
        <span aria-hidden="true">+</span>{t.create}
      </Link> : <Link href="/polls" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2">
        <span aria-hidden="true">←</span>{membershipMessages[locale].back}
      </Link>} />
    <nav aria-label={t.title} className="flex flex-wrap gap-1 border-t border-[var(--theme-border)] p-2 sm:px-3">
      {tabs.map((tab) => <Link key={tab.href} href={tab.href} aria-current={tab.area === area ? "page" : undefined}
        className="inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-body)] hover:bg-[var(--theme-control)] focus-visible:outline-2 aria-[current=page]:bg-[var(--theme-selected)] aria-[current=page]:text-[var(--theme-link)]">
        {t[tab.label]}
      </Link>)}
    </nav>
  </div>;
}
