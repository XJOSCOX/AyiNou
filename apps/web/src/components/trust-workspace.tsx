"use client";

import { impersonationKinds, personalClaims, verificationAppealOutcomes, type ImpersonationKind, type ImpersonationReview,
  type VerificationAppeal, type VerificationApplication } from "@ayinou/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { adminMessages } from "@/lib/admin-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { apiErrorCode } from "@/lib/api-errors";
import { useFeedMutation } from "@/lib/feed-state";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { assignVerificationAppeal, assignVerificationApplication, decideImpersonation, decideVerificationAppeal, loadAppealQueue,
  loadImpersonationQueue, loadVerificationAppeals, loadVerificationAssignments, submitImpersonationReport, submitVerificationAppeal } from "@/lib/trust-api";
import { trustMessages } from "@/lib/trust-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

const fields = (event: FormEvent<HTMLFormElement>) => new FormData(event.currentTarget);
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const links = (form: FormData) => field(form, "references").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const assignedAppeals = (signal: AbortSignal) => loadAppealQueue("assigned", signal);
const assignmentAppeals = (signal: AbortSignal) => loadAppealQueue("assign", signal);

function TrustError({ error, retry, returnTo }: { error: unknown; retry?: () => void; returnTo?: "/admin" | "/verification/review" }) {
  const [locale] = useLocale();
  return <>
    <ApiErrorNotice error={error} retry={retry} signIn />
    {returnTo && apiErrorCode(error) === "MFA_REQUIRED" && <Link className={institutionLink}
      href={`/mfa?next=${encodeURIComponent(returnTo)}`}>{adminMessages[locale].verifyNow}</Link>}
  </>;
}

function ExplanationFields() {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  return <>
    <label className="text-sm font-semibold">{t.explanation}
      <textarea name="explanation" className={institutionField} rows={3} minLength={10} maxLength={1000} required />
    </label>
    <label className="text-sm font-semibold">{t.references}
      <textarea name="references" className={institutionField} rows={2} maxLength={905} />
    </label>
  </>;
}

function PublicReferences({ references }: { references: string[] }) {
  const [locale] = useLocale();
  if (!references.length) return null;
  return <div><p className="text-sm font-semibold">{trustMessages[locale].references}</p>
    <ul className="space-y-1">
      {references.map((url) => <li key={url} className="break-all">
        <a className={institutionLink} href={url} target="_blank" rel="noreferrer">{url}</a>
      </li>)}
    </ul>
  </div>;
}

export function ImpersonationReportForm({ username }: { username: string }) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const [kind, setKind] = useState<ImpersonationKind>("profile");
  const [saved, setSaved] = useState(false);
  const mutation = useFeedMutation();
  return <details className={institutionCard}>
    <summary className="cursor-pointer font-semibold">{t.report}</summary>
    {saved ? <p role="status" className="mt-3">{t.reportSent}</p> : <form className="mt-3 grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const form = fields(event);
      void mutation.run(async () => {
        await submitImpersonationReport(username, kind, kind === "affiliation" ? field(form, "institution") : null,
          field(form, "explanation"), links(form));
        setSaved(true);
      });
    }}>
      <label className="text-sm font-semibold">{t.reason}
        <select className={institutionField} value={kind} onChange={(event) => setKind(event.target.value as ImpersonationKind)}>
          {impersonationKinds.map((value) => <option key={value} value={value}>{t[value]}</option>)}
        </select>
      </label>
      {kind === "affiliation" && <label className="text-sm font-semibold">{t.institutionHandle}
        <input name="institution" className={institutionField} minLength={3} maxLength={40} required />
      </label>}
      <ExplanationFields />
      {mutation.error !== null && <TrustError error={mutation.error} />}
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.report}</button>
    </form>}
  </details>;
}

export function MyVerificationAppeals({ applications }: { applications: VerificationApplication[] }) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const statuses = institutionMessages[locale];
  const resource = useInstitutionResource(loadVerificationAppeals);
  const [selected, setSelected] = useState("");
  const mutation = useFeedMutation();
  const appealIds = new Set(resource.data?.appeals.map(({ applicationId }) => applicationId));
  const eligible = applications.filter((item) => item.canAppeal && item.decidedAt && !appealIds.has(item.id));
  const currentSelection = eligible.some(({ id }) => id === selected) ? selected : "";
  return <section className={`${institutionCard} grid gap-3`}>
    <h2 className="text-xl font-semibold">{t.appeals}</h2>
    <p className="text-sm text-[var(--theme-body)]">{t.appealWindow}</p>
    {resource.error !== null && <TrustError error={resource.error} retry={resource.refresh} />}
    {resource.data && <ul className="grid gap-2">
      {resource.data.appeals.map((appeal) => <li key={appeal.id} className="break-words border-b border-[var(--theme-border)] pb-2">
        <p className="font-semibold">{t[appeal.outcome]}</p>
        <time dateTime={appeal.createdAt} className="text-sm">{new Date(appeal.createdAt).toLocaleDateString(locale)}</time>
        {appeal.rationale && <p className="whitespace-pre-wrap">{appeal.rationale}</p>}
        {appeal.outcome === "reconsideration" && <p className="text-sm">{t.appealEvidence}</p>}
      </li>)}
    </ul>}
    {resource.data && !resource.data.appeals.length && <p className="text-sm">{t.noAppeals}</p>}
    {resource.data && eligible.length > 0 && <form className="grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const form = fields(event);
      const element = event.currentTarget;
      if (!currentSelection) return;
      void mutation.run(async () => {
        await submitVerificationAppeal(currentSelection, field(form, "explanation"), links(form));
        element.reset(); setSelected(""); resource.refresh();
      });
    }}>
      <label className="text-sm font-semibold">{t.appeal}
        <select className={institutionField} value={currentSelection} required onChange={(event) => setSelected(event.target.value)}>
          <option value="">—</option>
          {eligible.map((item) => <option key={item.id} value={item.id}>
            {statuses[item.kind]} · {statuses[item.status]} · {new Date(item.decidedAt!).toLocaleDateString(locale)}
          </option>)}
        </select>
      </label>
      <ExplanationFields />
      {mutation.error !== null && <TrustError error={mutation.error} />}
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.submitAppeal}</button>
    </form>}
  </section>;
}

function AssignmentForm({ save, canRelease = false }: { save(handle: string, reason: string, assign: boolean): Promise<void>; canRelease?: boolean }) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const mutation = useFeedMutation();
  return <form className="grid gap-3" onSubmit={(event) => {
    event.preventDefault();
    const form = fields(event);
    const element = event.currentTarget;
    void mutation.run(async () => {
      await save(field(form, "reviewer"), field(form, "reason"), field(form, "assignment") !== "release");
      element.reset();
    });
  }}>
    <label className="text-sm font-semibold">{t.reviewer}
      <input name="reviewer" autoCapitalize="none" className={institutionField} minLength={3} maxLength={24} required />
    </label>
    {canRelease && <select name="assignment" aria-label={t.applicationAssignments} className={institutionField}>
      <option value="assign">{t.assign}</option><option value="release">{t.unassign}</option>
    </select>}
    <label className="text-sm font-semibold">{t.reason}
      <textarea name="reason" className={institutionField} rows={2} required minLength={10} maxLength={500} />
    </label>
    {mutation.error !== null && <TrustError error={mutation.error} returnTo="/admin" />}
    <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.assign}</button>
  </form>;
}

export function TrustAdministration() {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const labels = institutionMessages[locale];
  const applications = useInstitutionResource(loadVerificationAssignments);
  const appeals = useInstitutionResource(assignmentAppeals);
  const reports = useInstitutionResource(loadImpersonationQueue);
  return <div className="grid gap-4 lg:grid-cols-2">
    <section className={`${institutionCard} grid content-start gap-3`}>
      <h2 className="text-xl font-semibold">{t.applicationAssignments}</h2>
      {applications.error !== null && <TrustError error={applications.error} retry={applications.refresh} returnTo="/admin" />}
      {applications.data?.applications.length === 0 && <p>{t.emptyAssignments}</p>}
      {applications.data?.applications.map((application) => <details className="break-words border-t border-[var(--theme-border)] pt-2" key={application.id}>
        <summary className="cursor-pointer font-semibold">{labels[application.kind]} {application.applicantUsername && `· @${application.applicantUsername}`}</summary>
        {application.eligibleReviewers < 2 && <p className="my-2 text-sm">{t.reviewersNeeded}</p>}
        {application.assigned.length > 0 && <p className="my-2 text-sm">{t.assignedReviewers} · {application.assigned
          .filter(({ eligible }) => eligible).map(({ handle }) => handle).join(", ") || "—"}</p>}
        <AssignmentForm canRelease save={async (handle, reason, assign) => {
          await assignVerificationApplication(application.id, handle, reason, assign);
          applications.refresh();
        }} />
      </details>)}
    </section>
    <section className={`${institutionCard} grid content-start gap-3`}>
      <h2 className="text-xl font-semibold">{t.appeals}</h2>
      {appeals.error !== null && <TrustError error={appeals.error} retry={appeals.refresh} returnTo="/admin" />}
      {appeals.data?.appeals.length === 0 && <p>{t.noAppeals}</p>}
      {appeals.data?.appeals.map((appeal) => <details className="break-words border-t border-[var(--theme-border)] pt-2" key={appeal.id}>
        <summary className="cursor-pointer font-semibold">{new Date(appeal.createdAt).toLocaleString(locale)} · {appeal.assigned ? t.assignedReviewers : t.pending}</summary>
        <p className="my-2 text-sm">{t.appealEvidence}</p>
        <AssignmentForm save={async (handle, reason) => { await assignVerificationAppeal(appeal.id, handle, reason); appeals.refresh(); }} />
      </details>)}
    </section>
    <section className={`${institutionCard} grid gap-3 lg:col-span-2`}>
      <h2 className="text-xl font-semibold">{t.impersonation}</h2>
      {reports.error !== null && <TrustError error={reports.error} retry={reports.refresh} returnTo="/admin" />}
      {reports.data?.reports.length === 0 && <p>{t.noReports}</p>}
      {reports.data?.reports.map((item) => <ImpersonationReviewCard key={item.id} item={item} refresh={reports.refresh} />)}
    </section>
  </div>;
}

function ImpersonationReviewCard({ item, refresh }: { item: ImpersonationReview; refresh(): void }) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const [outcome, setOutcome] = useState<"dismissed" | "substantiated">("dismissed");
  const mutation = useFeedMutation();
  const holdOptions = personalClaims.filter((claim) => item.kind === "badge" ||
    (item.kind === "profile" && claim === "identity") || (item.kind === "public_figure" && claim === "notable_person"));
  return <details className="break-words border-t border-[var(--theme-border)] pt-2">
    <summary className="cursor-pointer font-semibold">{t[item.kind]} · @{item.subjectHandle ?? "—"}</summary>
    <p className="my-2 whitespace-pre-wrap">{item.explanation}</p>
    {item.organizationHandle && <p className="text-sm">@{item.organizationHandle}</p>}
    <PublicReferences references={item.references} />
    <form className="mt-3 grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const form = fields(event);
      const hold = holdOptions.find((option) => option === field(form, "hold")) ?? null;
      void mutation.run(async () => { await decideImpersonation(item.id, outcome, field(form, "rationale"), hold); refresh(); });
    }}>
      <label className="text-sm font-semibold">{t.decide}
        <select className={institutionField} value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}>
          <option value="dismissed">{t.dismissed}</option><option value="substantiated">{t.substantiated}</option>
        </select>
      </label>
      {outcome === "substantiated" && holdOptions.length > 0 && <label className="text-sm font-semibold">{t.hold}
        <select name="hold" className={institutionField}><option value="">{t.noHold}</option>
          {holdOptions.map((claim) => <option key={claim} value={claim}>{t[claim]}</option>)}
        </select>
      </label>}
      <label className="text-sm font-semibold">{t.reason}
        <textarea name="rationale" className={institutionField} rows={3} required minLength={10} maxLength={1000} />
      </label>
      {mutation.error !== null && <TrustError error={mutation.error} returnTo="/admin" />}
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.decide}</button>
    </form>
  </details>;
}

export function VerificationAppealReview() {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const resource = useInstitutionResource(assignedAppeals);
  return <section className={`${institutionCard} grid gap-3`}>
    <h2 className="text-xl font-semibold">{t.appeals}</h2>
    <p className="text-sm text-[var(--theme-body)]">{t.appealEvidence}</p>
    {resource.error !== null && <TrustError error={resource.error} retry={resource.refresh} returnTo="/verification/review" />}
    {!resource.data && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
    {resource.data?.appeals.length === 0 && <p>{t.noAppeals}</p>}
    {resource.data?.appeals.map((item) => <AppealReviewCard key={item.id} item={item} refresh={resource.refresh} />)}
  </section>;
}

function AppealReviewCard({ item, refresh }: { item: VerificationAppeal; refresh(): void }) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const mutation = useFeedMutation();
  return <details className="break-words border-t border-[var(--theme-border)] pt-2">
    <summary className="cursor-pointer font-semibold">{new Date(item.createdAt).toLocaleString(locale)}</summary>
    <p className="mt-2 whitespace-pre-wrap">{item.explanation}</p>
    <PublicReferences references={item.references ?? []} />
    <p className="mt-2 text-sm font-semibold">{t.originalDecision}</p>
    <p className="whitespace-pre-wrap">{item.originalRationale}</p>
    <form className="mt-3 grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const form = fields(event);
      const outcome = verificationAppealOutcomes.find((value) => value === field(form, "outcome"));
      if (outcome) void mutation.run(async () => { await decideVerificationAppeal(item.id, outcome, field(form, "rationale")); refresh(); });
    }}>
      <label className="text-sm font-semibold">{t.decide}
        <select name="outcome" className={institutionField}>
          {verificationAppealOutcomes.map((outcome) => <option key={outcome} value={outcome}>{t[outcome]}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">{t.reason}
        <textarea name="rationale" className={institutionField} rows={3} minLength={10} maxLength={1000} required />
      </label>
      {mutation.error !== null && <TrustError error={mutation.error} returnTo="/verification/review" />}
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.decide}</button>
    </form>
  </details>;
}
