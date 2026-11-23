"use client";

import Link from "next/link";
import { FounderVerifiedMark } from "./founder-verified-badge";
import type { Institution } from "@ayinou/shared";
import { useCallback } from "react";
import { loadVerifiedRepresentatives, saveRepresentativeConsent } from "@/lib/institution-api";
import { useFeedMutation } from "@/lib/feed-state";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { trustMessages } from "@/lib/trust-i18n";
import { InstitutionLogo, InstitutionStatus, VerifiedBadge, institutionAction, institutionCard, institutionLink, useInstitutionResource } from "./institution-ui";
import { ApiErrorNotice } from "./api-error-notice";
import { ImpersonationReportForm } from "./trust-workspace";
import { DisplayControls } from "./display-controls";
import { SiteBrand } from "./site-brand";
import { SiteFooter } from "./site-footer";
import { PublicAffiliationPanel } from "./public-affiliation-panel";
import { OrganizationTimeline } from "./organization-timeline";
import { ProfileFollowPanel } from "./discovery-accounts";

export function InstitutionPublic({ organization: org, signedIn }: { organization: Institution; signedIn: boolean }) {
  const layout = signedIn ? "w-full px-4 sm:px-8" : "public-container";
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const country = new Intl.DisplayNames([locale], { type: "region", fallback: "code" }).of(org.countryCode);
  const claim = signedIn ? `/verification?claim=${org.handle}` : `/login?claim=${org.handle}`;

  return (
    <div id="top" className="flex min-h-dvh flex-col">
      <header className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)]">
        <div className={`flex flex-wrap items-center justify-between gap-3 py-3 ${layout}`}>
          <SiteBrand />
          <DisplayControls />
        </div>
      </header>
      <main className={`grid flex-1 content-start gap-4 py-5 sm:py-8 ${layout}`}>
        <header className={`${institutionCard} flex flex-wrap items-center justify-between gap-4`}>
          <div className="flex min-w-0 items-center gap-4">
            <InstitutionLogo organization={org} />
            <div className="min-w-0">
              <p className="text-sm text-[var(--theme-body)]">{t[org.kind]}</p>
              <h1 className="break-words text-3xl font-semibold leading-tight tracking-tight">{org.name}</h1>
              <p className="mt-1 break-all text-sm text-[var(--theme-body)]">@{org.handle}</p>
            </div>
          </div>
          <InstitutionStatus status={org.verificationStatus} kind={org.kind} />
        </header>
        <section className={institutionCard} aria-label={t.institutionProfile}>
          <p className="font-semibold">{[org.departmentName, country].filter(Boolean).join(" · ")}</p>
          {org.verificationStatus === "verified" && <p className="mt-2 text-sm text-[var(--theme-body)]">{trustMessages[locale].noEndorsement}</p>}
          {org.description && <p className="mt-3 max-w-4xl whitespace-pre-line break-words leading-7 text-[var(--theme-body)]">{org.description}</p>}
          {org.website && <a href={org.website} target="_blank" rel="noreferrer" className={`${institutionLink} mt-4 inline-block`}>{trustMessages[locale].listedWebsite} <span aria-hidden="true">↗</span></a>}
        </section>
        <PublicAffiliationPanel organization={org} signedIn={signedIn} />
        {signedIn && <VerifiedRepresentativePanel organizationId={org.id} />}
        <ProfileFollowPanel target={{ kind: "institution", key: org.id }} signedIn={signedIn} />
        <OrganizationTimeline handle={org.handle} signedIn={signedIn} />
        {signedIn && <ImpersonationReportForm institutionHandle={org.handle} />}
        {org.verificationStatus !== "verified" && <div>
          <Link href={claim} className={institutionAction}>{t.claimProfile}</Link>
          {!signedIn && <p className="mt-2 text-sm text-[var(--theme-body)]">{t.claimInstructions}</p>}
        </div>}
      </main>
      <SiteFooter member={signedIn} />
    </div>
  );
}

function VerifiedRepresentativePanel({ organizationId }: { organizationId: string }) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadVerifiedRepresentatives(organizationId, signal), [organizationId]);
  const { data, error, refresh } = useInstitutionResource(load);
  const mutation = useFeedMutation();
  const ownConsent = data?.ownConsent;
  if (error === null && !mutation.error && !data?.representatives.length && ownConsent == null) return null;
  return <section className={institutionCard}>
    <h2 className="text-lg font-semibold">{t.verifiedRepresentatives}</h2>
    <p className="mt-1 text-sm text-[var(--theme-body)]">{t.representativeMeaning}</p>
    {error !== null && <ApiErrorNotice error={error} retry={refresh} />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {!!data?.representatives.length && <ul className="mt-3 grid gap-2">
      {data.representatives.map((person) => <li key={person.username} className="flex flex-wrap items-center gap-2">
        <Link className={`${institutionLink} break-all`} href={`/members/${encodeURIComponent(person.username)}`}>{person.displayName}</Link>
        {person.founderVerified && <FounderVerifiedMark compact />}
        <VerifiedBadge label={t.representative} />
      </li>)}
    </ul>}
    {ownConsent != null && <button type="button" aria-pressed={ownConsent} className={`${institutionAction} mt-3`}
      disabled={mutation.busy} onClick={() => { void mutation.run(async () => {
        await saveRepresentativeConsent(organizationId, !ownConsent);
        refresh();
      }); }}>{ownConsent ? t.hideRepresentation : t.showRepresentation}</button>}
  </section>;
}
