"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { InstitutionInput } from "@ayinou/shared";
import { accountMessages } from "@/lib/account-i18n";
import { affiliationMessages } from "@/lib/affiliation-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { createInstitution, loadInstitutionAccounts, resolveInvitation } from "@/lib/institution-api";
import { institutionError, institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { InstitutionForm } from "./institution-form";
import { institutionAction, institutionCard, institutionErrorBox, institutionLink, InstitutionStatus, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { MyAffiliationsPanel } from "./my-affiliations-panel";

export function InstitutionHub() {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const auth = authMessages[locale];
  const router = useRouter();
  const accounts = useInstitutionResource(loadInstitutionAccounts);
  const [creating, setCreating] = useState(false);
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
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.institutions}</h1>
            <p className="mt-2 max-w-3xl text-[var(--theme-body)]">{t.institutionsIntro}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link className={institutionLink} href="/discover?view=institutions">{discoveryMessages[locale].viewAll}</Link>
            {!creating && <button type="button" className={institutionAction} onClick={() => setCreating(true)}>{t.create}</button>}
          </div>
        </header>
        {creating && <section className={institutionCard}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t.create}</h2>
            <button type="button" className={institutionLink} onClick={() => setCreating(false)}>{accountMessages[locale].cancel}</button>
          </div>
          <p className="mb-5 text-sm text-[var(--theme-body)]">{t.newIntro}</p>
          <InstitutionForm creating onSave={async (input) => {
            const { id } = await createInstitution(input as InstitutionInput);
            router.push(`/institutions/${id}`);
          }} />
        </section>}
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
                    <InstitutionStatus status={org.verificationStatus} />
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
      </div>
    </MemberShell>
  );
}
