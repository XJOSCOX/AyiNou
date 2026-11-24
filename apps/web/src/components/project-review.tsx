"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useState } from "react";
import type { ProjectDetail, ProjectReport, ProjectReviewAction, ProjectReviewItem } from "@ayinou/shared";
import { accountMessages } from "@/lib/account-i18n";
import { ApiRequestError, apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { decideProjectReport, loadProjectOptions, loadProjectQueue, loadProjectReports, reviewProject } from "@/lib/project-api";
import { membershipMessages } from "@/lib/membership-i18n";
import { projectMessages } from "@/lib/project-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { MfaChallenge } from "./mfa-challenge";
import { ProjectDisclosure, ProjectLoading, ProjectSection, ProjectStatusBadge, ProjectsHeader, projectBadge, projectLink, projectPanel } from "./project-ui";

function ReviewError({ error, retry }: { error: unknown; retry: () => void }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  if (error === null) return null;
  if (apiErrorCode(error) === "MFA_REQUIRED") {
    return <section className={projectPanel + " flex flex-wrap items-center gap-4 p-4 sm:p-5"}>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--theme-selected)] text-[var(--theme-link)]" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <div className="min-w-0 flex-[1_1_16rem]">
        <h2 className="font-semibold">{accountMessages[locale].mfaTitle}</h2>
        <p className="mt-1 text-sm text-[var(--theme-body)]">{t.reviewGateHelp}</p>
      </div>
      <Link className={institutionAction} href="/projects/review?verify=1" scroll={false}>{t.verify}</Link>
    </section>;
  }
  return <ApiErrorNotice error={error} retry={retry} signIn />;
}

export function ProjectReviewScreen({ challenge }: { challenge?: { subject: string; sessionId: string; factorIds: string[] } }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const router = useRouter();
  const options = useInstitutionResource(loadProjectOptions);
  const [sessionEnded, setSessionEnded] = useState(false);
  const confirming = challenge && (options.data?.canReview || options.data?.canModerate);

  function closeChallenge() {
    router.replace("/projects/review", { scroll: false });
  }

  return <MemberShell><div className="grid min-w-0 gap-4">
    <ProjectsHeader title={t.reviewQueue} description={t.reviewHelp} current="review" canReview={options.data?.canReview ?? false} backHref="/projects/manage" />
    {sessionEnded ? <ApiErrorNotice error={new ApiRequestError("UNAUTHORIZED", 401)} signIn />
      : confirming ? <div className={institutionCard + " mx-auto w-full max-w-md py-6 sm:py-8"}>
        <MfaChallenge {...challenge} workspace={{
          help: t.reviewCodeHelp,
          onVerified: closeChallenge,
          onCancel: closeChallenge,
          onSessionEnded: () => setSessionEnded(true),
        }} />
      </div> : <>
        <ReviewError error={options.error} retry={options.refresh} />
        {!options.data && options.error === null && <ProjectLoading />}
        {options.data && <ReviewQueues canReview={options.data.canReview} canAssignOthers={options.data.canAssignOthers}
          canModerate={options.data.canModerate} />}
      </>}
  </div></MemberShell>;
}

function FounderSubmissions({ items, refresh }: { items: ProjectReviewItem[]; refresh: () => void }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  if (items.length === 0) return null;

  return <ProjectSection title={t.ownReviewSubmissions} count={items.length}>
    {items.map((item) => <article key={item.id} className={projectPanel + " grid min-w-0 gap-3 p-4"}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <h3 dir="auto" className="min-w-0 break-words text-lg font-semibold">
          {item.title}
        </h3>
        <ProjectStatusBadge status={item.status}>{t.status[item.status]}</ProjectStatusBadge>
      </div>
      <Link className={projectLink + " justify-self-start"} href={`/projects/${item.id}?preview=review`}>{t.viewProposal}</Link>
      <ProjectDisclosure title={t.reviewAssignment}>
        <ReviewActionForm key={`assignment:${item.version}`} id={item.id} version={item.version}
          actions={["assign"]} refresh={refresh} mode="assignment" />
      </ProjectDisclosure>
    </article>)}
  </ProjectSection>;
}

function ReviewQueues({ canReview, canAssignOthers, canModerate }: {
  canReview: boolean; canAssignOthers: boolean; canModerate: boolean;
}) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const loadQueue = useCallback((signal: AbortSignal) => canReview ? loadProjectQueue(signal) : Promise.resolve(null), [canReview]);
  const loadReports = useCallback((signal: AbortSignal) => canModerate ? loadProjectReports(signal) : Promise.resolve(null), [canModerate]);
  const queue = useInstitutionResource(loadQueue);
  const reports = useInstitutionResource(loadReports);
  const verification = [queue, reports].find(({ error }) => apiErrorCode(error) === "MFA_REQUIRED");
  if (verification) return <ReviewError error={verification.error} retry={verification.refresh} />;
  const others = queue.data?.items.filter((item) => !item.founderOwned);
  return <>
    <FounderSubmissions items={queue.data?.items.filter((item) => item.founderOwned) ?? []} refresh={queue.refresh} />
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))]">
      {canReview ? <ProjectSection title={t.pendingReviews} count={others?.length}>
        <ReviewError error={queue.error} retry={queue.refresh} />
        {!queue.data && queue.error === null && <ProjectLoading cards={1} className="grid" />}
        {others?.length === 0 && <p className="text-sm text-[var(--theme-body)]">{t.emptyReview}</p>}
        {others?.map((item) => <article className={projectPanel + " grid gap-3 p-4"} key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 dir="auto" className="min-w-0 break-words text-lg font-semibold">{item.title}</h3>
            <ProjectStatusBadge status={item.status}>{t.status[item.status]}</ProjectStatusBadge>
          </div>
          <span className={projectBadge}>{membershipMessages[locale][item.category]}</span>
          {item.assignedToMe
            ? <Link className={institutionAction + " justify-self-start"} href={`/projects/${item.id}?preview=review`}>{t.reviewProposal}</Link>
            : <Link className={projectLink + " justify-self-start"} href={`/projects/${item.id}?preview=review`}>{t.viewProposal}</Link>}
          {!item.assignedToMe && (item.canClaim || canAssignOthers) && <ProjectDisclosure title={t.selfReview}>
            <ReviewActionForm key={`self:${item.version}`} id={item.id} version={item.version} actions={["assign"]}
              refresh={queue.refresh} mode="self" />
          </ProjectDisclosure>}
          {canAssignOthers && <ProjectDisclosure title={t.reviewAssignment}>
            <ReviewActionForm key={`assignment:${item.version}`} id={item.id} version={item.version}
              actions={item.assigned ? ["assign", "release"] : ["assign"]} refresh={queue.refresh} mode="assignment" />
          </ProjectDisclosure>}
        </article>)}
      </ProjectSection> : <p role="status" className={institutionCard}>{t.reviewUnavailable}</p>}
      {canModerate && <Reports data={reports.data} error={reports.error} refresh={reports.refresh} />}
    </div>
  </>;
}

export function ProjectDecisionPanel({ id, version, refresh }: { id: string; version: number; refresh: () => void }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  return <div id="project-review-decision" className="scroll-mt-20" tabIndex={-1}>
    <ProjectSection title={t.reviewProposal}>
      <Link href={`/projects/${id}?preview=review`} className={projectLink + " justify-self-start"}>{t.viewProposal}</Link>
      <ReviewActionForm key={version} id={id} version={version} actions={["request_changes", "reject", "release"]}
        refresh={refresh} mode="decision" />
    </ProjectSection>
  </div>;
}

export function ProjectPreviewApproval({ id, approval, refresh }: {
  id: string; approval: NonNullable<ProjectDetail["approval"]>; refresh: () => void;
}) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  return <ProjectSection title={approval.founderOwned ? t.founderApprove : t.actions.approve}>
    {approval.founderOwned && <p className="text-sm text-[var(--theme-body)]">{t.founderApproveHelp}</p>}
    <ReviewActionForm id={id} version={approval.version} previewProof={approval.proof} refresh={refresh}
      actions={approval.founderOwned ? ["approve"] : ["approve", "request_changes", "reject", "release"]}
      mode={approval.founderOwned ? "founder" : "decision"} />
  </ProjectSection>;
}

function ReviewActionForm({ id, version, actions, refresh, mode, previewProof }: {
  id: string; version: number; actions: ProjectReviewAction[]; refresh: () => void; mode: "decision" | "assignment" | "self" | "founder";
  previewProof?: string;
}) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const mutation = useFeedMutation();
  const router = useRouter();
  const reviewerHelpId = useId();
  const [action, setAction] = useState<ProjectReviewAction | null>(mode === "decision" ? null : actions[0]);
  return <form className="grid min-w-0 gap-3"
    aria-busy={mutation.busy} onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (action === null || !actions.includes(action)) return;
    void mutation.run(async () => {
      await reviewProject(id, version, action, String(fields.get("reason") ?? "").trim(),
        String(fields.get("reviewer") ?? "").trim() || null, action === "approve" ? previewProof : undefined);
      form.reset();
      if (mode === "self") router.push(`/projects/${id}?preview=review`);
      else if (mode === "founder") router.push(`/projects/${id}`);
      else if (mode === "decision") router.push("/projects/review");
      else refresh();
    });
  }}>
    {mode === "decision" && <fieldset className="grid min-w-0 gap-1.5">
      <legend className="mb-1 text-sm font-semibold">{t.action}</legend>
      {actions.map((entry) => <label key={entry}
        className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm has-checked:bg-[var(--theme-selected)]">
        <input type="radio" name="decision" value={entry} checked={action === entry} onChange={() => setAction(entry)} required />
        {t.actions[entry]}
      </label>)}
    </fieldset>}
    {mode === "assignment" && actions.length > 1 && <label className="text-sm font-semibold">{t.action}
      <select className={institutionField} value={action ?? ""} onChange={(event) => {
        setAction(actions.find((entry) => entry === event.target.value) ?? actions[0]);
      }}>{actions.map((entry) => <option value={entry} key={entry}>{t.actions[entry]}</option>)}</select>
    </label>}
    {mode === "assignment" && action === "assign" && <div>
      <label className="text-sm font-semibold">{t.reviewer}
        <input className={institutionField} name="reviewer" maxLength={24} pattern="[a-z0-9][a-z0-9_]{2,23}" autoCapitalize="none"
          aria-describedby={reviewerHelpId} required />
      </label>
      <p id={reviewerHelpId} className="mt-1 text-xs text-[var(--theme-body)]">{t.reviewerHelp}</p>
    </div>}
    <Reason />
    <ReviewError error={mutation.error} retry={refresh} />
    <button className={institutionAction + " justify-self-start"} disabled={mutation.busy || action === null}>
      {mutation.busy ? authMessages[locale].working : mode === "self" ? t.startReview : mode === "founder" ? t.actions.approve : t.record}
    </button>
  </form>;
}

function Reason() {
  const [locale] = useLocale();
  return <label className="text-sm font-semibold">{projectMessages[locale].reason}
    <textarea name="reason" className={institutionField} rows={3} required minLength={10} maxLength={1000} />
  </label>;
}

function Reports({ data, error, refresh }: { data: { reports: ProjectReport[] } | null; error: unknown; refresh: () => void }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  return <ProjectSection title={t.reportsQueue} count={data?.reports.length}>
    <ReviewError error={error} retry={refresh} />
    {!data && error === null && <ProjectLoading cards={1} className="grid" />}
    {data?.reports.length === 0 && <p className="text-sm text-[var(--theme-body)]">{t.emptyReports}</p>}
    {data?.reports.map((report) => <ReportDecision key={report.id} report={report} refresh={refresh} />)}
  </ProjectSection>;
}

function ReportDecision({ report, refresh }: { report: ProjectReport; refresh: () => void }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const mutation = useFeedMutation();
  return <form className={`${institutionCard} grid gap-3`} onSubmit={(event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void mutation.run(async () => {
      await decideProjectReport(report, fields.get("decision") === "restrict", String(fields.get("reason") ?? "").trim());
      refresh();
    });
  }}>
    <h3 className="break-words font-semibold">{report.title} · {t.reports[report.category]}</h3>
    <p className="whitespace-pre-line break-words" dir="auto">{report.explanation}</p>
    <label className="text-sm font-semibold">{t.action}<select name="decision" className={institutionField}>
      <option value="dismiss">{t.dismiss}</option><option value="restrict">{t.actions.restrict}</option>
    </select></label>
    <Reason />
    <ReviewError error={mutation.error} retry={refresh} />
    <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.record}</button>
  </form>;
}
