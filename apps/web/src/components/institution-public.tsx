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

export function InstitutionPublic({ organization: org, signedIn }: { organization: Institution; signedIn: boolean }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const trust = trustMessages[locale];
  const country = new Intl.DisplayNames([locale], { type: "region", fallback: "code" }).of(org.countryCode) ?? org.countryCode;
  const location = [org.departmentName, country].filter(Boolean).join(" · ");
  const claim = signedIn ? `/verification?claim=${org.handle}` : `/login?claim=${org.handle}`;

  return (
    <MemberShell signedIn={signedIn}>
      <div className="grid min-w-0 gap-5 sm:gap-6">
        <header className="min-w-0 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
          <div className="flex min-w-0 flex-wrap items-center gap-4 bg-linear-to-br from-[var(--theme-hero)] to-[var(--theme-control)] p-5 sm:gap-6 sm:p-7">
            <InstitutionLogo organization={org} large />
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 dir="auto" className="min-w-0 break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{org.name}</h1>
                <InstitutionStatus status={org.verificationStatus} kind={org.kind} />
              </div>
              <p className="mt-2 break-words text-sm text-[var(--theme-body)]">@{org.handle}</p>
            </div>
          </div>
          <div className="border-t border-[var(--theme-border)] px-5 py-3 sm:px-7">
            <ProfileFollowPanel target={{ kind: "institution", key: org.id }} signedIn={signedIn} inline />
          </div>
        </header>
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(18rem,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-6">
          <section className={institutionCard} aria-labelledby="public-institution-about">
            <h2 id="public-institution-about" className="text-xl font-semibold">{t.aboutOrganization}</h2>
            <dl className="mt-4 divide-y divide-[var(--theme-border)] rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] px-3">
              <div className="py-3">
                <dt className="text-sm text-[var(--theme-body)]">{t.kind}</dt>
                <dd className="mt-0.5 break-words font-semibold">{t[org.kind]}</dd>
              </div>
              <div className="py-3">
                <dt className="text-sm text-[var(--theme-body)]">{membershipMessages[locale].location}</dt>
                <dd className="mt-0.5 break-words font-semibold">{location}</dd>
              </div>
              {org.website && <div className="py-3">
                <dt className="text-sm text-[var(--theme-body)]">{trust.listedWebsite}</dt>
                <dd className="mt-0.5">
                  <a href={org.website} target="_blank" rel="noreferrer" dir="ltr" className={`${institutionLink} [overflow-wrap:anywhere]`}>
                    {org.website} <span aria-hidden="true">↗</span>
                  </a>
                </dd>
              </div>}
            </dl>
            {org.description && <p dir="auto" className="mt-4 whitespace-pre-line break-words leading-relaxed text-[var(--theme-body)]">{org.description}</p>}
            {org.verificationStatus === "verified" && <p className="mt-4 text-xs leading-5 text-[var(--theme-body)]">{trust.noEndorsement}</p>}
          </section>
          <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <OrganizationTimeline handle={org.handle} signedIn={signedIn} />
            <PublicOpportunityList organization={org.id} signedIn={signedIn} />
          </div>
          <aside className="grid min-w-0 gap-4 lg:col-start-1">
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
