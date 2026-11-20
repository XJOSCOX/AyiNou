"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProjectReport, ProjectReviewAction } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { decideProjectReport, loadProjectOptions, loadProjectQueue, loadProjectReports, reviewProject } from "@/lib/project-api";
import { projectMessages } from "@/lib/project-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

function ReviewError({ error, retry }: { error: unknown; retry: () => void }) {
  const [locale] = useLocale();
  if (error === null) return null;
  return <div className="grid gap-2">
    <ApiErrorNotice error={error} retry={retry} signIn />
    {apiErrorCode(error) === "MFA_REQUIRED" && <Link className={institutionLink} href="/mfa?next=/projects/review">
      {projectMessages[locale].verify}
    </Link>}
  </div>;
}

export function ProjectReviewScreen() {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const options = useInstitutionResource(loadProjectOptions);
  return <MemberShell><section className="grid gap-4">
    <PageHeader title={t.reviewQueue} description={t.reviewHelp}
      actions={<Link className={institutionLink} href="/projects/manage">{t.manage}</Link>} />
    <ReviewError error={options.error} retry={options.refresh} />
    {options.data?.canReview ? <Queue canAssignOthers={options.data.canAssignOthers} /> : options.data && <p>{t.reviewUnavailable}</p>}
    {options.data?.canModerate && <Reports />}
  </section></MemberShell>;
}

function Queue({ canAssignOthers }: { canAssignOthers: boolean }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const queue = useInstitutionResource(loadProjectQueue);
  return <section className="grid gap-3">
    <ReviewError error={queue.error} retry={queue.refresh} />
    {!queue.data && queue.error === null && <p role="status">{authMessages[locale].working}</p>}
    {queue.data?.items.length === 0 && <p className={institutionCard}>{t.emptyReview}</p>}
    {queue.data?.items.map((item) => <article className={institutionCard} key={item.id}>
      <h2 className="break-words font-semibold">{item.title}</h2>
      <p className="mt-1 text-sm">{t.status[item.status]}</p>
      {item.assignedToMe && <Link className={`${institutionLink} mt-2 inline-block`} href={`/projects/${item.id}`}>{t.reviewProposal}</Link>}
      {(item.canClaim || canAssignOthers) && <ReviewActionForm id={item.id} version={item.version}
        actions={item.assigned && canAssignOthers ? ["assign","release"] : ["assign"]} refresh={queue.refresh} assignOthers={canAssignOthers} />}
    </article>)}
  </section>;
}

export function ReviewActionForm({ id, version, actions, refresh, assignOthers = false }: {
  id: string; version: number; actions: ProjectReviewAction[]; refresh: () => void; assignOthers?: boolean;
}) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const mutation = useFeedMutation();
  const [action, setAction] = useState(actions[0]);
  return <form className="mt-3 grid gap-3 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4" onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (actions.includes(action)) void mutation.run(async () => {
      await reviewProject(id, version, action, String(fields.get("reason") ?? "").trim(), String(fields.get("reviewer") ?? "").trim() || null);
      form.reset();
      refresh();
    });
  }}>
    <label className="text-sm font-semibold">{t.action}
      <select className={institutionField} value={action} onChange={(event) => {
        setAction(actions.find((entry) => entry === event.target.value) ?? actions[0]);
      }}>{actions.map((entry) => <option value={entry} key={entry}>{t.actions[entry]}</option>)}</select>
    </label>
    {assignOthers && action === "assign" && <label className="text-sm font-semibold">{t.reviewer}
      <input className={institutionField} name="reviewer" maxLength={24} pattern="[a-z0-9][a-z0-9_]{2,23}" autoCapitalize="none" />
    </label>}
    <Reason />
    <ReviewError error={mutation.error} retry={refresh} />
    <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.record}</button>
  </form>;
}

function Reason() {
  const [locale] = useLocale();
  return <label className="text-sm font-semibold">{projectMessages[locale].reason}
    <textarea name="reason" className={institutionField} rows={3} required minLength={10} maxLength={1000} />
  </label>;
}

function Reports() {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const queue = useInstitutionResource(loadProjectReports);
  return <section className="grid gap-3">
    <h2 className="text-xl font-semibold">{t.reportsQueue}</h2>
    <ReviewError error={queue.error} retry={queue.refresh} />
    {queue.data?.reports.length === 0 && <p className={institutionCard}>{t.emptyReports}</p>}
    {queue.data?.reports.map((report) => <ReportDecision key={report.id} report={report} refresh={queue.refresh} />)}
  </section>;
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
