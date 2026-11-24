"use client";

import Link from "next/link";
import { useState } from "react";
import type { InstitutionAccounts } from "@ayinou/shared";
import { loadFollowedInstitutions } from "@/lib/discovery-api";
import { affiliationMessages } from "@/lib/affiliation-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { loadInstitutionAccounts, resolveInvitation } from "@/lib/institution-api";
import { institutionError, institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionAction, institutionCard, institutionErrorBox, institutionLink, InstitutionLogo, InstitutionStatus, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { MyAffiliationsPanel } from "./my-affiliations-panel";
import { OperationalOrganizations } from "./organization-roles";
import { DiscoveryResults } from "./discovery-accounts";

const institutionSecondaryAction = "inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2";
const institutionTab = "inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-body)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-[var(--theme-selected)] aria-[current=page]:text-[var(--theme-link)]";

export function InstitutionHub({ following }: { following: boolean }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];

  return (
    <MemberShell>
      <div className="grid gap-5">
        <div className="min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
          <PageHeader className="!rounded-none !border-0 !bg-transparent" title={t.institutions} description={t.institutionHubIntro} actions={
            <div className="flex min-w-0 flex-wrap gap-2">
              <Link className={`${institutionAction} min-h-11 gap-2 border border-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)]`}
                href="/organization-onboarding">
                <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t.createOrganization}
              </Link>
              <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--theme-border)] px-4 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)]"
                href="/discover?view=institutions">
                <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="10.5" cy="10.5" r="5.5" />
                  <path d="m15 15 4 4" />
                </svg>
                {t.browseInstitutions}
              </Link>
            </div>
          } />
          <nav aria-label={t.institutions} className="flex flex-wrap gap-1 border-t border-[var(--theme-border)] p-2">
            <Link href="/institutions" className={institutionTab} aria-current={!following ? "page" : undefined}>{t.myInstitutions}</Link>
            <Link href="/institutions?view=following" className={institutionTab} aria-current={following ? "page" : undefined}>{t.followingInstitutions}</Link>
          </nav>
        </div>
        {following ? <section aria-labelledby="followed-institutions" className={institutionCard + " grid gap-4"}>
          <h2 id="followed-institutions" className="text-xl font-semibold">{t.followedInstitutionsTitle}</h2>
          <DiscoveryResults load={loadFollowedInstitutions} empty={t.noFollowedInstitutions} removeUnfollowed directory />
        </section> : <InstitutionManagementPanels />}
      </div>
    </MemberShell>
  );
}

function ManagedInstitutionCard({ organization }: { organization: InstitutionAccounts["organizations"][number] }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const country = new Intl.DisplayNames([locale], { type: "region", fallback: "code" }).of(organization.countryCode);
  const location = [organization.departmentName, country].filter(Boolean).join(" · ");
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const href = `/organization/${organization.handle}`;

  return <li className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-[var(--theme-border)] p-3">
    <div className="flex min-w-0 flex-[1_1_13rem] items-start gap-3">
      <InstitutionLogo organization={organization} />
      <div className="min-w-0">
        <h3 className="break-words font-semibold" dir="auto">{organization.name}</h3>
        <p className="break-words text-xs text-[var(--theme-body)]">@{organization.handle} · {t[organization.role]}</p>
        <div className="mt-1.5"><InstitutionStatus status={organization.verificationStatus} kind={organization.kind} /></div>
      </div>
    </div>
    <div className="min-w-0 flex-[2_1_14rem] text-sm leading-snug text-[var(--theme-body)]">
      <p className="flex flex-wrap gap-x-1.5"><span>{t[organization.kind]}</span><span aria-hidden="true">·</span><span>{location}</span></p>
      {organization.website && <a href={organization.website} target="_blank" rel="noreferrer" dir="ltr" className={institutionLink + " mt-1 inline-block [overflow-wrap:anywhere]"}>
        {organization.website} <span aria-hidden="true">↗</span>
      </a>}
      {organization.description && <p dir="auto" className="mt-1 line-clamp-2 whitespace-pre-line break-words">{organization.description}</p>}
      {organization.expiresAt && <p className="mt-1">{t.expires} <time dateTime={organization.expiresAt}>{date.format(new Date(organization.expiresAt))}</time></p>}
    </div>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Link className={institutionAction + " gap-2 !px-3 text-start leading-snug focus-visible:outline-2 focus-visible:outline-offset-2"}
        href={`/institutions/${organization.id}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></svg>
        {t.manageOrganization}
      </Link>
      <Link className={institutionSecondaryAction + " gap-2 text-start leading-snug"} href={href}>
        {t.publicProfile}
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </Link>
    </div>
  </li>;
}

function InstitutionManagementPanels() {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const auth = authMessages[locale];
  const accounts = useInstitutionResource(loadInstitutionAccounts);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function answer(id: string, action: "accept" | "revoke") {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try { await resolveInvitation(id, action); accounts.refresh(); }
    catch (cause) { setFailure(cause); }
    finally { setBusy(false); }
  }

  return <>
    <MyAffiliationsPanel managedOrganizations={<section className={institutionCard + " !p-4 sm:!p-5"}>
      <h2 className="text-xl font-semibold">{affiliationMessages[locale].manage}</h2>
      {accounts.error ? <div className="mt-3 space-y-2">
        <p role="alert" className={institutionErrorBox}>{institutionError(t, accounts.error)}</p>
        <button type="button" onClick={accounts.refresh} className={institutionLink}>{auth.retry}</button>
      </div> : !accounts.data ? <p role="status" className="mt-3">{auth.working}</p> :
        accounts.data.organizations.length === 0 ? <p className="mt-3 text-[var(--theme-body)]">{t.none}</p> :
          <ul className="mt-3 grid gap-2">
            {accounts.data.organizations.map((organization) => <ManagedInstitutionCard key={organization.id} organization={organization} />)}
          </ul>}
    </section>} representativeInvitations={<section className={institutionCard + " !p-4 sm:!p-5"}>
      <h2 className="text-xl font-semibold">{t.representativeInvitations}</h2>
      {failure !== null && <p role="alert" className={institutionErrorBox + " mt-3"}>{institutionError(t, failure)}</p>}
      {accounts.data?.invitations.length === 0 && <p className="mt-3 text-sm text-[var(--theme-body)]">{t.noInvitations}</p>}
      {!!accounts.data?.invitations.length && <ul className="mt-3 divide-y divide-[var(--theme-border)]">
        {accounts.data.invitations.map((invite) => <li key={invite.id} className="space-y-2 py-3">
          <p className="break-words font-semibold">{invite.organizationName}</p>
          <p className="text-sm text-[var(--theme-body)]">{t[invite.role]} · {t.expires} {new Date(invite.expiresAt).toLocaleDateString(locale)}</p>
          {invite.termDays !== null && <p className="text-sm text-[var(--theme-body)]">{t.term} · {invite.termDays}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={institutionAction} onClick={() => { void answer(invite.id, "accept"); }}>{t.accepted}</button>
            <button type="button" disabled={busy} className={institutionSecondaryAction} onClick={() => { void answer(invite.id, "revoke"); }}>{t.decline}</button>
          </div>
        </li>)}
      </ul>}
    </section>} />
    <OperationalOrganizations />
  </>;
}
