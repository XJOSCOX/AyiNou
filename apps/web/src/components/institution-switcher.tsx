"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { InstitutionAccounts } from "@ayinou/shared";
import { loadInstitutionAccounts } from "@/lib/institution-api";
import { institutionMessages } from "@/lib/institution-i18n";
import { trustMessages } from "@/lib/trust-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { PersonalClaimChecks, VerifiedCheck } from "./institution-ui";

export function InstitutionSwitcher() {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const { claims } = useMemberIdentity();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<InstitutionAccounts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    loadInstitutionAccounts(controller.signal).then((result) => {
      if (!controller.signal.aborted) { setAccounts(result); setFailed(false); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [open]);

  const selectedId = pathname.split("/")[2];
  const selected = pathname.startsWith("/institutions/") ? accounts?.organizations.find((org) => org.id === selectedId) : undefined;
  const item = "block break-words rounded px-3 py-2 text-sm text-[var(--theme-link)] hover:bg-[var(--theme-control)]";

  return (
    <details className="relative min-w-0" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="max-w-52 cursor-pointer truncate rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] marker:text-[var(--theme-link)]">
        {selected?.name ?? t.switchAccount}
        {selected?.verificationStatus === "verified" && <>{" "}<VerifiedCheck label={trustMessages[locale].organization} /></>}
      </summary>
      <div className="absolute end-0 z-20 mt-2 max-h-80 w-56 overflow-auto rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1.5 shadow-lg max-sm:fixed max-sm:inset-x-4 max-sm:w-auto">
        <Link href="/dashboard" className={item}>{t.personalAccount} <PersonalClaimChecks claims={claims} /></Link>
        {failed ? <p role="alert" className="px-3 py-2 text-sm text-[var(--theme-body)]">{t.unavailable}</p>
          : !accounts ? <p role="status" className="px-3 py-2 text-sm">{authMessages[locale].working}</p>
          : accounts.organizations.map((org) => <Link key={org.id} className={item} href={`/institutions/${org.id}`}
            aria-current={org.id === selected?.id ? "page" : undefined}>
            {org.name}{org.verificationStatus === "verified" && <>{" "}<VerifiedCheck label={trustMessages[locale].organization} /></>}
          </Link>)}
        <Link href="/institutions" className={`${item} border-t border-[var(--theme-border)]`}>{t.institutions}</Link>
      </div>
    </details>
  );
}
