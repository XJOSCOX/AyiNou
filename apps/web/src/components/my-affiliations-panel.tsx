"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { loadMyAffiliations, resolveAffiliationInvitation } from "@/lib/affiliation-api";
import { affiliationEventLabels, affiliationMessages } from "@/lib/affiliation-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { institutionError, institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { AffiliationFeedback, OwnAffiliationActions, useAffiliationAction } from "./affiliation-ui";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

export function MyAffiliationsPanel({ managedOrganizations, representativeInvitations }: {
  managedOrganizations: ReactNode;
  representativeInvitations: ReactNode;
}) {
  const [locale] = useLocale();
  const t = affiliationMessages[locale];
  const system = institutionMessages[locale];
  const auth = authMessages[locale];
  const router = useRouter();
  const resource = useInstitutionResource(loadMyAffiliations);
  const action = useAffiliationAction(resource.refresh);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  function findInstitution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const handle = String(data.get("handle") ?? "").trim().toLowerCase();
    if (/^[a-z0-9][a-z0-9-]{2,39}$/.test(handle)) router.push(`/organization/${handle}`);
  }

  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_clamp(18rem,27%,25rem)]">
        <div className="grid min-w-0 gap-4">
          {managedOrganizations}
          <section className={institutionCard + " !p-4 sm:!p-5"}>
            <h2 className="text-xl font-semibold">{t.belong}</h2>
            <p className="mt-2 text-sm text-[var(--theme-body)]">{t.authorityNote}</p>
            <form className="mb-3 mt-4 flex max-w-lg flex-wrap items-end gap-2" onSubmit={findInstitution}>
              <label className="min-w-0 flex-1 text-sm font-semibold">{t.lookup}
                <input name="handle" required minLength={3} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9\-]{2,39}" autoCapitalize="none" spellCheck={false} className={institutionField} />
              </label>
              <button type="submit" className={institutionAction}>{t.view}</button>
            </form>
            {resource.error ? <div className="mt-3 space-y-2">
              <p role="alert" className={institutionErrorBox}>{institutionError(system, resource.error)}</p>
              <button type="button" className={institutionLink} onClick={resource.refresh}>{auth.retry}</button>
            </div> : !resource.data ? <p role="status">{auth.working}</p>
              : resource.data.affiliations.length ? <ul className="divide-y divide-[var(--theme-border)]">
                {resource.data.affiliations.map((item) => <li key={item.id} className="py-3">
                  <Link href={`/organization/${item.handle}`} className="break-words font-semibold text-[var(--theme-link)] hover:underline">{item.organizationName}</Link>
                  <p className="mt-1 text-sm text-[var(--theme-body)]">{t[item.affiliationType]} · {t[item.status]}
                    {item.admission && ` · ${t[item.admission]}`}</p>
                  <OwnAffiliationActions affiliation={item} refresh={resource.refresh} />
                </li>)}
              </ul> : <p className="text-sm text-[var(--theme-body)]">{t.ownEmpty}</p>}
          </section>
        </div>
        <div className="grid min-w-0 gap-4">
          {representativeInvitations}
          <section id="membership-inbox" className={`${institutionCard} scroll-mt-4 !p-4 sm:!p-5`}>
            <h2 className="text-xl font-semibold">{t.invitations}</h2>
            <div className="mt-3 space-y-2"><AffiliationFeedback failure={action.failure} saved={action.saved} /></div>
            {resource.data && (resource.data.invitations.length ? <ul className="divide-y divide-[var(--theme-border)]">
              {resource.data.invitations.map((invitation) => <li key={invitation.id} className="space-y-2 py-3">
                <Link href={`/organization/${invitation.handle}`} className="break-words font-semibold text-[var(--theme-link)] hover:underline">{invitation.organizationName}</Link>
                <p className="text-sm text-[var(--theme-body)]">{t[invitation.affiliationType]} · {system.expires} {date.format(new Date(invitation.expiresAt))}</p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" className={institutionAction} disabled={action.busy} onClick={() => {
                    void action.run(() => resolveAffiliationInvitation(invitation.id, "accept"));
                  }}>{system.accepted}</button>
                  <button type="button" className={institutionLink} disabled={action.busy} onClick={() => {
                    void action.run(() => resolveAffiliationInvitation(invitation.id, "revoke"));
                  }}>{system.decline}</button>
                </div>
              </li>)}
            </ul> : <p className="text-sm text-[var(--theme-body)]">{system.noInvitations}</p>)}
          </section>
          {resource.data && <details className={institutionCard + " !p-4 sm:!p-5"}>
            <summary className="cursor-pointer font-semibold">{t.history}</summary>
            {resource.data.history.length ? <ul className="mt-3 divide-y divide-[var(--theme-border)]">
              {resource.data.history.map((item) => <li key={item.id} className="py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold">{item.organizationName} · {t[affiliationEventLabels[item.event]]}</p>
                  <time dateTime={item.occurredAt} className="text-[var(--theme-body)]">{date.format(new Date(item.occurredAt))}</time>
                </div>
                {item.affiliationType && <p className="mt-1 text-[var(--theme-body)]">{t[item.affiliationType]}</p>}
                {item.reason && <p className="mt-1 whitespace-pre-line break-words text-[var(--theme-body)]">{item.reason}</p>}
              </li>)}
            </ul> : <p className="mt-3 text-sm text-[var(--theme-body)]">{t.historyEmpty}</p>}
          </details>}
        </div>
      </div>
    </div>
  );
}
