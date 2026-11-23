"use client";

import Link from "next/link";
import { useState } from "react";
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

export function InstitutionHub() {
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

  return (
    <MemberShell>
      <div className="grid gap-5">
        <PageHeader title={t.institutions} description={t.institutionHubIntro} actions={
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
        {failure !== null && <p role="alert" className={institutionErrorBox}>{institutionError(t, failure)}</p>}
        {accounts.error ? <div className={institutionCard}>
          <p role="alert">{institutionError(t, accounts.error)}</p>
          <button type="button" onClick={accounts.refresh} className={`${institutionLink} mt-2`}>{auth.retry}</button>
        </div> : !accounts.data ? <p role="status">{auth.working}</p> : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] lg:items-start">
            <section className={institutionCard}>
              <h2 className="text-xl font-semibold">{affiliationMessages[locale].manage}</h2>
              {accounts.data.organizations.length === 0 ? <p className="mt-3 text-[var(--theme-body)]">{t.none}</p> : (
                <ul className="mt-4 grid gap-3">
                  {accounts.data.organizations.map((org) => <li key={org.id} className="grid min-w-0 gap-3 rounded-lg border border-[var(--theme-border)] p-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <InstitutionLogo organization={org} />
                      <div className="min-w-0">
                        <Link className={`${institutionLink} break-words`} href={`/organization/${org.handle}`}>{org.name}</Link>
                        <p className="mt-0.5 break-words text-sm text-[var(--theme-body)]">@{org.handle} · {t[org.role]}</p>
                      </div>
                      <InstitutionStatus status={org.verificationStatus} kind={org.kind} />
                    </div>
                    <Link className="inline-flex min-h-11 items-center justify-self-start rounded-md border border-[var(--theme-border)] px-3 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2"
                      href={`/institutions/${org.id}`}>{t.manageOrganization}</Link>
                  </li>)}
                </ul>
              )}
            </section>
            <section className={institutionCard}>
              <h2 className="text-xl font-semibold">{t.representativeInvitations}</h2>
              {accounts.data.invitations.length === 0 ? <p className="mt-3 text-[var(--theme-body)]">{t.noInvitations}</p> : (
                <ul className="mt-3 divide-y divide-[var(--theme-border)]">
                  {accounts.data.invitations.map((invite) => <li key={invite.id} className="space-y-2 py-3">
                    <p className="break-words font-semibold">{invite.organizationName}</p>
                    <p className="text-sm text-[var(--theme-body)]">{t[invite.role]} · {t.expires} {new Date(invite.expiresAt).toLocaleDateString(locale)}</p>
                    {invite.termDays !== null && <p className="text-sm text-[var(--theme-body)]">{t.term} · {invite.termDays}</p>}
                    <div className="flex flex-wrap gap-3">
                      <button type="button" disabled={busy} className={institutionAction} onClick={() => { void answer(invite.id, "accept"); }}>{t.accepted}</button>
                      <button type="button" disabled={busy} className={institutionLink} onClick={() => { void answer(invite.id, "revoke"); }}>{t.decline}</button>
                    </div>
                  </li>)}
                </ul>
              )}
            </section>
          </div>
        )}
        <MyAffiliationsPanel />
        <OperationalOrganizations />
      </div>
    </MemberShell>
  );
}
