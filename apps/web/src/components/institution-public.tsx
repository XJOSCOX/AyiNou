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
import { PublicAffiliationPanel } from "./public-affiliation-panel";
import { OrganizationTimeline } from "./organization-timeline";
import { MemberShell } from "./member-shell";
import { ProfileFollowPanel } from "./discovery-accounts";

export function InstitutionPublic({ organization: org, signedIn }: { organization: Institution; signedIn: boolean }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const country = new Intl.DisplayNames([locale], { type: "region", fallback: "code" }).of(org.countryCode);
  const claim = signedIn ? `/verification?claim=${org.handle}` : `/login?claim=${org.handle}`;

  return (
    <MemberShell signedIn={signedIn}>
      <div className="min-w-0 space-y-5 sm:space-y-6">
        <header className="overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
          <div aria-hidden="true" className="h-16 border-b border-[var(--theme-border)] bg-linear-to-r from-[var(--theme-selected)] via-[var(--theme-control)] to-[var(--theme-surface)] sm:h-24" />
          <div className="px-5 pb-5 sm:px-7 sm:pb-6">
            <div className="relative -mt-7 flex flex-wrap items-end gap-x-4 gap-y-3">
              <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1">
                <InstitutionLogo organization={org} />
              </div>
              <InstitutionStatus status={org.verificationStatus} kind={org.kind} />
            </div>
            <h1 className="mt-3 break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{org.name}</h1>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--theme-body)]">
              <span className="break-all">@{org.handle}</span>
              <span>{t[org.kind]}</span>
              <span>{[org.departmentName, country].filter(Boolean).join(" · ")}</span>
            </p>
            <div className="mt-4">
              <ProfileFollowPanel target={{ kind: "institution", key: org.id }} signedIn={signedIn} inline />
            </div>
          </div>
        </header>
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
          <OrganizationTimeline handle={org.handle} signedIn={signedIn} />
          <aside className="grid min-w-0 gap-4">
            <section className={institutionCard} aria-label={t.institutionProfile}>
              <h2 className="text-lg font-semibold">{t.institutionProfile}</h2>
              {org.description && <p dir="auto" className="mt-2 whitespace-pre-line break-words leading-6 text-[var(--theme-body)]">{org.description}</p>}
              {org.website && <a href={org.website} target="_blank" rel="noreferrer" className={`${institutionLink} mt-3 inline-block text-sm`}>{trustMessages[locale].listedWebsite} <span aria-hidden="true">↗</span></a>}
              {org.verificationStatus === "verified" && <p className="mt-3 border-t border-[var(--theme-border)] pt-3 text-xs leading-5 text-[var(--theme-body)]">{trustMessages[locale].noEndorsement}</p>}
            </section>
            <PublicAffiliationPanel organization={org} signedIn={signedIn} />
            {signedIn && <VerifiedRepresentativePanel organizationId={org.id} />}
            {org.verificationStatus !== "verified" && <div className={institutionCard}>
              <Link href={claim} className={institutionLink}>{t.claimProfile}</Link>
              {!signedIn && <p className="mt-2 text-sm text-[var(--theme-body)]">{t.claimInstructions}</p>}
            </div>}
            {signedIn && <ImpersonationReportForm institutionHandle={org.handle} />}
          </aside>
        </div>
      </div>
    </MemberShell>
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
