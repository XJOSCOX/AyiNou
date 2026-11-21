"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { type Locale, governmentKinds, verificationKinds, type InstitutionAccounts, type VerificationApplication, type VerificationKind } from "@ayinou/shared";
import { authMessages } from "@/lib/auth-i18n";
import { apiErrorCode } from "@/lib/api-errors";
import { loadApplications, loadInstitutionAccounts, submitVerification } from "@/lib/institution-api";
import { institutionError, institutionMessages, type InstitutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { trustMessages } from "@/lib/trust-i18n";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource, VerifiedBadge } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { FounderIdentityPanel } from "./founder-identity";
import { PageHeader } from "./page-header";
import { MyVerificationAppeals } from "./trust-workspace";

export function VerificationScreen({ initialKind, institution }: {
  initialKind: VerificationKind; institution: string;
}) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const trust = trustMessages[locale];
  const auth = authMessages[locale];
  const accounts = useInstitutionResource(loadInstitutionAccounts);
  const applications = useInstitutionResource(loadApplications);

  return (
    <MemberShell>
      <div className="grid gap-5">
        <PageHeader title={t.verification} description={t.verificationIntro}
          actions={accounts.data?.canReview && <Link className={institutionLink} href="/verification/review">{t.review}</Link>} />
        <div className={`${institutionCard} grid gap-2 text-sm`}>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 font-semibold">
            {(["identity", "notable_person", "organization", "representative"] as const).map((kind) => <li key={kind}>{trust[kind]}</li>)}
          </ul>
          <p className="text-[var(--theme-body)]">{trust.noEndorsement}</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(17rem,2fr)]">
          <section className={institutionCard}>
            <h2 className="mb-4 text-xl font-semibold">{t.request}</h2>
            {accounts.error ? <>
              <p role="alert" className={institutionErrorBox}>{institutionError(t, accounts.error)}</p>
              <button type="button" className={`${institutionLink} mt-3`} onClick={accounts.refresh}>{auth.retry}</button>
            </> : accounts.data ? <ApplicationForm accounts={accounts.data} initialKind={initialKind} initialOrg={institution}
              refresh={applications.refresh} /> : <p role="status">{auth.working}</p>}
          </section>
          <section className={institutionCard}>
            <h2 className="text-xl font-semibold">{t.applications}</h2>
            {applications.error ? <div className="mt-3">
              <p role="alert" className={institutionErrorBox}>{institutionError(t, applications.error)}</p>
              <button type="button" className={`${institutionLink} mt-3`} onClick={applications.refresh}>{auth.retry}</button>
            </div> : !applications.data ? <p role="status" className="mt-3">{auth.working}</p>
              : <ApplicationHistory applications={applications.data} locale={locale} messages={t} />}
          </section>
        </div>
        <FounderIdentityPanel />
        {applications.data && <MyVerificationAppeals applications={applications.data} />}
      </div>
    </MemberShell>
  );
}

function ApplicationHistory({ applications, locale, messages: t }: {
  applications: VerificationApplication[]; locale: Locale; messages: InstitutionMessages;
}) {
  if (applications.length === 0) return <p className="mt-3 text-[var(--theme-body)]">{t.noApplications}</p>;
  const pending = applications.filter((app) => app.status === "pending");
  const history = applications.filter((app) => app.status !== "pending");

  function renderApplication(app: VerificationApplication) {
    return <li key={app.id} className="grid gap-1 py-3 text-sm">
      <p className="break-words font-semibold">{t[app.kind]}{app.organizationName && ` · ${app.organizationName}`}</p>
      <p className="text-[var(--theme-link)]">
        {app.status === "approved" ? <VerifiedBadge label={t.approved} /> : t[app.status]}
      </p>
      <p>{t.applicationSubmitted} <time dateTime={app.createdAt}>{new Date(app.createdAt).toLocaleString(locale)}</time></p>
      {app.decidedAt && <p>{t.applicationResolved} <time dateTime={app.decidedAt}>{new Date(app.decidedAt).toLocaleString(locale)}</time></p>}
      {app.status === "pending" && app.eligibleApprovals != null && <p>
        {trustMessages[locale].approvalProgress.replace("{count}", String(app.eligibleApprovals))}
      </p>}
      {app.status === "closed" && <p className="text-[var(--theme-body)]">{t.founderClosureReason}</p>}
      {app.rationale && <p className="whitespace-pre-line break-words text-[var(--theme-body)]">{app.rationale}</p>}
    </li>;
  }

  return <>
    {pending.length > 0 && <ol className="mt-3 divide-y divide-[var(--theme-border)]">{pending.map(renderApplication)}</ol>}
    {history.length > 0 && <details className="mt-3 border-t border-[var(--theme-border)] pt-3">
      <summary className="cursor-pointer font-semibold">{t.applicationHistory}</summary>
      <ol className="mt-2 divide-y divide-[var(--theme-border)]">{history.map(renderApplication)}</ol>
    </details>}
  </>;
}

function ApplicationForm({ accounts, initialKind, initialOrg, refresh }: {
  accounts: InstitutionAccounts; initialKind: VerificationKind; initialOrg: string; refresh: () => void;
}) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const auth = authMessages[locale];
  const [kind, setKind] = useState(initialKind);
  const [organization, setOrganization] = useState(initialOrg);
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const needsOrganization = kind === "organization" || kind === "government" || kind === "representative";
  const eligible = accounts.organizations.filter((org) => {
    if (kind === "representative") return true;
    return org.role === "owner" && org.verificationStatus !== "verified" && (kind === "government") === governmentKinds.includes(org.kind);
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaved(false);
    setFailed(null);
    try {
      const references = evidence.split("\n").map((value) => value.trim()).filter(Boolean);
      if (needsOrganization && references.length < 2) throw new Error("INSTITUTION_EVIDENCE_REQUIRED");
      if (references.length < (kind === "notable_person" ? 2 : 1) || references.length > 3) throw new Error("INVALID_INPUT");
      let id: string | null = null;
      if (needsOrganization) {
        if (!eligible.some((org) => org.id === organization)) throw new Error("INVALID_INPUT");
        id = organization;
      }
      await submitVerification(kind, id, references);
      setEvidence("");
      setSaved(true);
      refresh();
    } catch (cause) { setFailed(cause); }
    finally { setBusy(false); }
  }

  return (
    <form className="space-y-4" onSubmit={submit} aria-busy={busy}>
      <label className="block text-sm font-semibold">{t.applicationType}
        <select className={institutionField} value={kind} disabled={busy} onChange={(event) => {
          const value = verificationKinds.find((item) => item === event.target.value);
          if (value) { setKind(value); setOrganization(""); setSaved(false); }
        }}>
          {verificationKinds.filter((item) => item !== "claim").map((item) => <option key={item} value={item}>{t[item]}</option>)}
        </select>
      </label>
      {needsOrganization && <label className="block text-sm font-semibold">{t.institutions}
        <select className={institutionField} value={eligible.some((org) => org.id === organization) ? organization : ""}
          onChange={(event) => setOrganization(event.target.value)} required disabled={busy || !eligible.length}>
          <option value="">{eligible.length ? "—" : t.none}</option>
          {eligible.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
        </select>
      </label>}
      <label className="block text-sm font-semibold">{t.evidence}
        <textarea className={institutionField} value={evidence} rows={4} maxLength={905} required disabled={busy}
          onChange={(event) => setEvidence(event.target.value)} aria-describedby="verification-evidence-hint" />
      </label>
      <p id="verification-evidence-hint" className="text-sm text-[var(--theme-body)]">{t.evidenceHelp} {trustMessages[locale].evidenceStandard}</p>
      {kind === "notable_person" && <p className="text-sm text-[var(--theme-body)]">{trustMessages[locale].notabilityReferences}</p>}
      {kind !== "identity" && kind !== "notable_person" && <p className="text-sm text-[var(--theme-body)]">
        {trustMessages[locale].institutionEvidenceRequired} {trustMessages[locale].institutionEvidenceHelp}
      </p>}
      {failed !== null && <p role="alert" className={institutionErrorBox}>{apiErrorCode(failed) === "INSTITUTION_EVIDENCE_REQUIRED"
        ? trustMessages[locale].institutionEvidenceRequired : institutionError(t, failed)}</p>}
      {saved && <p role="status" className="text-sm text-[var(--theme-link)]">{t.submitted}</p>}
      <button type="submit" className={institutionAction} disabled={busy || (needsOrganization && !eligible.length)}>{busy ? auth.working : t.submit}</button>
    </form>
  );
}
