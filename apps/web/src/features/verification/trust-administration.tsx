import { fields, field, TrustError, PublicReferences } from "./trust-controls";
import { institutionField, institutionAction, useInstitutionResource, institutionCard } from "@/components/institution-ui";
import { useFeedMutation } from "@/lib/feed-state";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { loadAppealQueue, loadVerificationAssignments, loadImpersonationQueue, assignVerificationApplication, assignVerificationAppeal, decideImpersonation } from "@/lib/trust-api";
import { trustMessages } from "@/lib/trust-i18n";
import { type ImpersonationReview, type ImpersonationRestriction, type VerificationKind, personalClaims } from "@ayinou/shared";
import { useCallback, useRef, useState } from "react";
import { authorizedRequest } from "@/lib/api";

const assignmentAppeals = (signal: AbortSignal) => loadAppealQueue("assign", signal);

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

export function TrustAdministration({ founderWorkspace }: { founderWorkspace?: string }) {
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
        <summary className="cursor-pointer font-semibold">{labels[application.kind]}{application.organizationName && ` · ${application.organizationName}`} {application.applicantUsername && `· @${application.applicantUsername}`}</summary>
        {application.eligibleReviewers < 2 && <p className="my-2 text-sm">{t.reviewersNeeded}</p>}
        {founderWorkspace && (application.canFounderReview ?? (application.kind === "identity" || application.kind === "organization")) && application.status === "pending" &&
          <FounderBlueApproval kind={application.kind} applicationId={application.id} workspace={founderWorkspace} refresh={applications.refresh} />}
        {application.assigned.length > 0 && <p className="my-2 text-sm">{t.assignedReviewers} · {application.assigned
          .filter(({ eligible }) => eligible).map(({ handle }) => handle).join(", ") || "—"}</p>}
        <AssignmentForm canRelease={application.canRelease !== false} save={async (handle, reason, assign) => {
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

function FounderBlueApproval({ applicationId, workspace, refresh, kind }: {
  applicationId: string; workspace: string; refresh(): void; kind: VerificationKind;
}) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const [open, setOpen] = useState(false);
  return <div className="my-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] p-3">
    <button type="button" className={institutionAction} aria-expanded={open} onClick={() => setOpen(!open)}>{t.founderBlueReview}</button>
    {open && <FounderBlueDecision kind={kind} applicationId={applicationId} workspace={workspace} refresh={refresh} />}
  </div>;
}

function FounderBlueDecision({ applicationId, workspace, refresh, kind }: {
  applicationId: string; workspace: string; refresh(): void; kind: VerificationKind;
}) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const labels = institutionMessages[locale];
  const mutation = useFeedMutation();
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const path = `/api/v1/admin/founder-blue-verification/${applicationId}`;
  const load = useCallback((signal: AbortSignal): Promise<{ revision: number; evidence: string[] }> =>
    authorizedRequest(path, { signal, headers: { "X-Ayinou-Workspace": workspace } }), [path, workspace]);
  const evidence = useInstitutionResource(load);
  if (evidence.error !== null) return <TrustError error={evidence.error} retry={evidence.refresh} returnTo="/admin" />;
  if (!evidence.data) return <p role="status" className="mt-3 text-sm">{t.founderBlueLoading}</p>;
  const { revision, evidence: references } = evidence.data;
  const confirmation = kind === "representative" ? t.founderRepresentativeConfirm
    : kind === "organization" ? t.founderOrgConfirm : labels.conflictFree;
  const help = kind === "representative" ? t.founderRepresentativeHelp
    : kind === "organization" ? t.founderOrgHelp : t.founderBlueHelp;
  const approve = kind === "representative" ? t.founderRepresentativeApprove
    : kind === "organization" ? t.founderOrgApprove : t.founderBlueApprove;
  return <form className="mt-3 grid gap-3" onSubmit={(event) => {
    event.preventDefault();
    const form = fields(event);
    if (!form.has("conflictFree")) return;
    const reason = field(form, "reason");
    const button = (event.nativeEvent as SubmitEvent).submitter;
    const decision = button instanceof HTMLButtonElement && button.value === "reject" ? "reject" : "approve";
    const fingerprint = JSON.stringify([revision, reason, decision]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, id: crypto.randomUUID() };
    const requestId = retry.current.id;
    void mutation.run(async () => {
      await authorizedRequest(path, {
        method: "POST", headers: { "X-Ayinou-Workspace": workspace },
        body: JSON.stringify({ expectedVersion: revision, requestId, reason, noConflict: true, decision }),
      });
      refresh();
    });
  }}>
    <p className="text-sm text-[var(--theme-body)]">{help}</p>
    <PublicReferences references={references} />
    <label className="text-sm font-semibold">{t.reason}
      <textarea name="reason" className={institutionField} rows={3} required minLength={10} maxLength={1000} />
    </label>
    <label className="flex items-start gap-2 text-sm">
      <input className="mt-1" type="checkbox" name="conflictFree" required />{confirmation}
    </label>
    {mutation.error !== null && <TrustError error={mutation.error} retry={evidence.refresh} returnTo="/admin" />}
    <div className="flex flex-wrap gap-3">
      <button value="approve" className={institutionAction} disabled={mutation.busy || references.length === 0}>{approve}</button>
      <button value="reject" className={`${institutionField} mt-0 w-auto`} disabled={mutation.busy || references.length === 0}>{labels.reject}</button>
    </div>
  </form>;
}

function ImpersonationReviewCard({ item, refresh }: { item: ImpersonationReview; refresh(): void }) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const [outcome, setOutcome] = useState<"dismissed" | "substantiated">("dismissed");
  const mutation = useFeedMutation();
  const holdOptions: ImpersonationRestriction[] = item.kind === "institution" ? ["restrict_institution"] : personalClaims.filter((claim) => item.kind === "badge" ||
    (item.kind === "profile" && claim === "identity") || (item.kind === "public_figure" && claim === "notable_person"));
  return <details className="break-words border-t border-[var(--theme-border)] pt-2">
    <summary className="cursor-pointer font-semibold">{item.kind === "representative" ? t.representativeReport : t[item.kind]} · @{item.subjectHandle ?? item.organizationHandle ?? "—"}</summary>
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
      {outcome === "substantiated" && holdOptions.length > 0 && <label className="text-sm font-semibold">{item.kind === "institution" ? t.institutionAction : t.hold}
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
