"use client";

import Link from "next/link";
import type { Institution } from "@ayinou/shared";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { InstitutionLogo, InstitutionStatus, institutionAction, institutionCard, institutionLink } from "./institution-ui";
import { LanguageSwitch } from "./language-switch";
import { SiteBrand } from "./site-brand";
import { SiteFooter } from "./site-footer";
import { ThemeToggle } from "./theme-toggle";

export function InstitutionPublic({ organization: org, signedIn }: { organization: Institution; signedIn: boolean }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const country = new Intl.DisplayNames([locale], { type: "region", fallback: "code" }).of(org.countryCode);
  const claim = signedIn ? `/verification?claim=${org.handle}` : `/login?claim=${org.handle}`;

  return (
    <div id="top" className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 sm:px-8">
        <SiteBrand />
        <div className="flex gap-2"><LanguageSwitch /><ThemeToggle /></div>
      </header>
      <main className="grid flex-1 content-start gap-4 px-4 py-5 sm:px-8 sm:py-8">
        <header className={`${institutionCard} flex flex-wrap items-center justify-between gap-4`}>
          <div className="flex min-w-0 items-center gap-4">
            <InstitutionLogo organization={org} />
            <div className="min-w-0">
              <p className="text-sm text-[var(--theme-body)]">{t[org.kind]}</p>
              <h1 className="break-words text-3xl font-semibold leading-tight tracking-tight">{org.name}</h1>
              <p className="mt-1 break-all text-sm text-[var(--theme-body)]">@{org.handle}</p>
            </div>
          </div>
          <InstitutionStatus status={org.verificationStatus} />
        </header>
        <section className={institutionCard} aria-label={t.institutionProfile}>
          <p className="font-semibold">{[org.departmentName, country].filter(Boolean).join(" · ")}</p>
          {org.description && <p className="mt-3 max-w-4xl whitespace-pre-line break-words leading-7 text-[var(--theme-body)]">{org.description}</p>}
          {org.website && <a href={org.website} target="_blank" rel="noreferrer" className={`${institutionLink} mt-4 inline-block`}>{t.website} <span aria-hidden="true">↗</span></a>}
        </section>
        {org.verificationStatus !== "verified" && <div>
          <Link href={claim} className={institutionAction}>{t.claimProfile}</Link>
          {!signedIn && <p className="mt-2 text-sm text-[var(--theme-body)]">{t.claimInstructions}</p>}
        </div>}
      </main>
      <SiteFooter />
    </div>
  );
}
