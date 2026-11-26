"use client";

import Link from "next/link";
import { FounderVerifiedMark } from "./founder-verified-badge";
import type { Institution } from "@ayinou/shared";
import { useCallback } from "react";
import { loadVerifiedRepresentatives, saveRepresentativeConsent } from "@/lib/institution-api";
import { useFeedMutation } from "@/lib/feed-state";
import { institutionMessages } from "@/lib/institution-i18n";
import { membershipMessages } from "@/lib/membership-i18n";
import { useLocale } from "@/lib/locale-store";
import { trustMessages } from "@/lib/trust-i18n";
import { InstitutionLogo, InstitutionStatus, VerifiedBadge, institutionAction, institutionCard, institutionLink, useInstitutionResource } from "./institution-ui";
import { ApiErrorNotice } from "./api-error-notice";
import { ImpersonationReportForm } from "./trust-workspace";
import { PublicAffiliationPanel } from "./public-affiliation-panel";
import { PublicOpportunityList } from "@/features/opportunities/publication-panels";
import { OrganizationTimeline } from "./organization-timeline";
import { MemberShell } from "./member-shell";
import { ProfileFollowPanel } from "./discovery-accounts";

export function InstitutionPublic({ organization: org, signedIn, activeSection, opportunity }: {
  organization: Institution;
  signedIn: boolean;
  opportunity?: string;
  activeSection: "overview" | "posts" | "opportunities" | "membership";
}) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const trust = trustMessages[locale];
  const country = new Intl.DisplayNames([locale], { type: "region", fallback: "code" }).of(org.countryCode) ?? org.countryCode;
  const location = [org.departmentName, country].filter(Boolean).join(" · ");
  const sections = [
    ["overview", t.profileOverview], ["posts", t.profilePosts], ["opportunities", t.profileOpportunities],
    ["membership", membershipMessages[locale].membership],
  ] as const;
  const profilePath = `/organization/${org.handle}`;
  const claim = signedIn ? `/verification?claim=${org.handle}` : `/login?claim=${org.handle}`;

  return (
    <MemberShell signedIn={signedIn}>
      <div className="grid min-w-0 gap-4 sm:gap-5">
        <header className="min-w-0 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
          <div className="flex min-w-0 flex-wrap items-center gap-4 bg-linear-to-br from-[var(--theme-hero)] to-[var(--theme-control)] p-4 sm:gap-5 sm:p-6">
            <InstitutionLogo organization={org} large />
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 dir="auto" className="min-w-0 [overflow-wrap:anywhere] text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{org.name}</h1>
                <InstitutionStatus status={org.verificationStatus} kind={org.kind} />
              </div>
              <p className="mt-2 break-words text-sm text-[var(--theme-body)]">@{org.handle}</p>
            </div>
          </div>
          <div className="border-t border-[var(--theme-border)] px-4 py-2 sm:px-6">
            <ProfileFollowPanel target={{ kind: "institution", key: org.id }} signedIn={signedIn} inline />
          </div>
          <nav aria-label={t.profileSections} className="flex flex-wrap gap-1 border-t border-[var(--theme-border)] p-2 sm:px-3">
            {sections.map(([section, label]) => <Link key={section}
              href={section === "overview" ? profilePath : profilePath + "?section=" + section}
              aria-current={activeSection === section ? "page" : undefined} scroll={false}
              className="inline-flex min-h-10 max-w-full items-center rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-body)] [overflow-wrap:anywhere] hover:bg-[var(--theme-control)] focus-visible:outline-2 aria-[current=page]:bg-[var(--theme-selected)] aria-[current=page]:text-[var(--theme-link)]">
              {label}
            </Link>)}
          </nav>
        </header>
        {activeSection === "overview" && <div className="grid min-w-0 gap-3">
          <section className={institutionCard + " grid items-start gap-4 [overflow-wrap:anywhere] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"} aria-labelledby="public-institution-about">
            <div className="min-w-0">
              <h2 id="public-institution-about" className="text-xl font-semibold">{t.aboutOrganization}</h2>
              {org.description && <p dir="auto" className="mt-3 max-w-prose whitespace-pre-line leading-relaxed text-[var(--theme-body)]">{org.description}</p>}
              {org.verificationStatus === "verified" && <p className="mt-3 max-w-prose text-xs leading-5 text-[var(--theme-body)]">{trust.noEndorsement}</p>}
            </div>
            <dl className="min-w-0 divide-y divide-[var(--theme-border)] rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] px-3">
              <div className="py-2">
                <dt className="text-sm text-[var(--theme-body)]">{t.kind}</dt>
                <dd className="mt-0.5 break-words font-semibold">{t[org.kind]}</dd>
              </div>
              <div className="py-2">
                <dt className="text-sm text-[var(--theme-body)]">{membershipMessages[locale].location}</dt>
                <dd className="mt-0.5 break-words font-semibold">{location}</dd>
              </div>
              {org.website && <div className="py-2">
                <dt className="text-sm text-[var(--theme-body)]">{trust.listedWebsite}</dt>
                <dd className="mt-0.5">
                  <a href={org.website} target="_blank" rel="noreferrer" dir="ltr" className={`${institutionLink} [overflow-wrap:anywhere]`}>
                    {org.website} <span aria-hidden="true">↗</span>
                  </a>
                </dd>
              </div>}
            </dl>
          </section>
          {org.verificationStatus !== "verified" && <div className={institutionCard}>
            <Link href={claim} className={institutionLink}>{t.claimProfile}</Link>
            {!signedIn && <p className="mt-2 text-sm text-[var(--theme-body)]">{t.claimInstructions}</p>}
          </div>}
          {signedIn && <ImpersonationReportForm institutionHandle={org.handle} />}
        </div>}
        {activeSection === "posts" && <OrganizationTimeline handle={org.handle} signedIn={signedIn} />}
        {activeSection === "opportunities" && <PublicOpportunityList organization={org.id} signedIn={signedIn} opportunity={opportunity} />}
        {activeSection === "membership" && <div className="grid min-w-0 items-start gap-4 [overflow-wrap:anywhere] xl:grid-cols-[repeat(auto-fit,minmax(min(100%,25rem),1fr))]">
          <PublicAffiliationPanel organization={org} signedIn={signedIn} />
          {signedIn && <VerifiedRepresentativePanel organizationId={org.id} />}
        </div>}
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
