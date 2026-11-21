"use client";

import Link from "next/link";
import { useState } from "react";
import { affiliationMessages } from "@/lib/affiliation-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { loadInstitutionAccounts, resolveInvitation } from "@/lib/institution-api";
import { institutionError, institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { organizationOnboardingMessages } from "@/lib/organization-onboarding-i18n";
import { institutionAction, institutionCard, institutionErrorBox, institutionLink, InstitutionStatus, useInstitutionResource } from "./institution-ui";
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
        <PageHeader title={t.institutions} description={t.institutionsIntro} actions={<>
          <Link className={institutionAction} href="/organization-onboarding">{organizationOnboardingMessages[locale].resume}</Link>
          <Link className={institutionLink} href="/discover?view=institutions">{discoveryMessages[locale].viewAll}</Link>
        </>} />
        {failure !== null && <p role="alert" className={institutionErrorBox}>{institutionError(t, failure)}</p>}
        {accounts.error ? <div className={institutionCard}>
          <p role="alert">{institutionError(t, accounts.error)}</p>
          <button type="button" onClick={accounts.refresh} className={`${institutionLink} mt-2`}>{auth.retry}</button>
        </div> : !accounts.data ? <p role="status">{auth.working}</p> : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(17rem,2fr)]">
            <section className={institutionCard}>
              <h2 className="text-xl font-semibold">{affiliationMessages[locale].manage}</h2>
              {accounts.data.organizations.length === 0 ? <p className="mt-3 text-[var(--theme-body)]">{t.none}</p> : (
                <ul className="mt-3 divide-y divide-[var(--theme-border)]">
                  {accounts.data.organizations.map((org) => <li key={org.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <Link className="break-words font-semibold text-[var(--theme-link)] hover:underline" href={`/institutions/${org.id}`}>{org.name}</Link>
                      <p className="mt-0.5 text-sm text-[var(--theme-body)]">{t[org.role]} · @{org.handle}</p>
                    </div>
                    <InstitutionStatus status={org.verificationStatus} kind={org.kind} />
                  </li>)}
                </ul>
              )}
            </section>
            <section className={institutionCard}>
              <h2 className="text-xl font-semibold">{t.invitations}</h2>
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
