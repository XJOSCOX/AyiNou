"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { AffiliationType, Institution, MembershipPolicy } from "@ayinou/shared";
import { affiliationMessages } from "@/lib/affiliation-i18n";
import { joinAffiliation, loadMyAffiliations, readAffiliationDirectory } from "@/lib/affiliation-api";
import { authMessages } from "@/lib/auth-i18n";
import { institutionError, institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { AffiliationFeedback, AffiliationTypeSelect, OwnAffiliationActions, useAffiliationAction } from "./affiliation-ui";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

export function PublicAffiliationPanel({ organization, signedIn }: {
  organization: Pick<Institution, "id" | "handle">;
  signedIn: boolean;
}) {
  const [locale] = useLocale();
  const t = affiliationMessages[locale];
  const load = useCallback((signal: AbortSignal) => readAffiliationDirectory(organization.handle, signal), [organization.handle]);
  const directory = useInstitutionResource(load);

  return (
    <div className="grid min-w-0 gap-4">
      <section className={institutionCard}>
        <h2 className="text-xl font-semibold">{t.membership}</h2>
        {directory.error ? <div className="mt-3 space-y-2">
          <p role="alert" className={institutionErrorBox}>{institutionError(institutionMessages[locale], directory.error)}</p>
          <button type="button" className={institutionLink} onClick={directory.refresh}>{authMessages[locale].retry}</button>
        </div> : !directory.data ? <p role="status" className="mt-2">{authMessages[locale].working}</p> : (
          <>
            <p className="mt-2 font-semibold text-[var(--theme-link)]">{t[directory.data.membershipPolicy]}</p>
            <p className="mt-2 text-sm text-[var(--theme-body)]">{directory.data.membershipPolicy === "open" ? t.openHelp
              : directory.data.membershipPolicy === "approval_required" ? t.reviewHelp : t.invitationHelp}</p>
            {signedIn ? <JoinMembership id={organization.id} policy={directory.data.membershipPolicy} refreshDirectory={directory.refresh} />
              : directory.data.membershipPolicy !== "invitation_only" && <Link href={`/login?join=${organization.handle}`} className={`${institutionAction} mt-4`}>{t.signIn}</Link>}
          </>
        )}
      </section>
      {directory.data?.directoryEnabled && <section className={institutionCard}>
        <h2 className="text-xl font-semibold">{t.directory}</h2>
        <p className="mt-2 text-sm text-[var(--theme-body)]">{t.directoryHelp}</p>
        {directory.data.members.length ? <ul className="mt-3 divide-y divide-[var(--theme-border)]">
          {directory.data.members.map((person, index) => <li key={index} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 break-words font-semibold">{person.displayName}</span>
            <span className="text-[var(--theme-body)]">{t[person.affiliationType]}</span>
          </li>)}
        </ul> : <p className="mt-3 text-sm text-[var(--theme-body)]">{t.directoryEmpty}</p>}
      </section>}
    </div>
  );
}

function JoinMembership({ id, policy, refreshDirectory }: { id: string; policy: MembershipPolicy; refreshDirectory: () => void }) {
  const [locale] = useLocale();
  const t = affiliationMessages[locale];
  const own = useInstitutionResource(loadMyAffiliations);
  const [type, setType] = useState<AffiliationType>("member");
  const [message, setMessage] = useState("");
  const refresh = () => { own.refresh(); refreshDirectory(); };
  const action = useAffiliationAction(refresh);
  const affiliation = own.data?.affiliations.find((item) => item.organizationId === id);
  const request = policy === "approval_required" || type === "staff";

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(() => joinAffiliation(id, type, request ? message : undefined));
  }

  if (own.error) return <p role="alert" className={`${institutionErrorBox} mt-3`}>{institutionError(institutionMessages[locale], own.error)}</p>;
  if (!own.data) return <p role="status" className="mt-3">{authMessages[locale].working}</p>;
  if (affiliation) return (
    <div className="mt-4">
      <p className="font-semibold">{t[affiliation.affiliationType]} · {t[affiliation.status]}</p>
      <p className="mt-1 text-sm text-[var(--theme-body)]">{affiliation.admission ? t[affiliation.admission] : t.requestSent}</p>
      <OwnAffiliationActions affiliation={affiliation} refresh={refresh} />
    </div>
  );
  if (policy === "invitation_only") return <Link href="/institutions#membership-inbox" className={`${institutionLink} mt-3 inline-block`}>{t.invitations}</Link>;

  return (
    <form className="mt-4 grid gap-3" onSubmit={join} aria-busy={action.busy}>
      <AffiliationTypeSelect value={type} onChange={(event) => setType(event.target.value as AffiliationType)} disabled={action.busy} />
      {request && <label className="text-sm font-semibold">{t.message}
        <textarea className={institutionField} maxLength={500} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} disabled={action.busy} />
      </label>}
      <p className="text-sm text-[var(--theme-body)]">{t.authorityNote}</p>
      <AffiliationFeedback failure={action.failure} saved={action.saved} />
      <button type="submit" className={`${institutionAction} justify-self-start`} disabled={action.busy}>{request ? t.request : t.join}</button>
    </form>
  );
}
