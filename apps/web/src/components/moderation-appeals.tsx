"use client";

import { appealOutcomes, type AppealOutcome, type AppealReview, type MemberAppealDecision, type ModerationAppeal, type SafetyOverview } from "@ayinou/shared";
import Link from "next/link";
import { useCallback, useState } from "react";
import { apiErrorCode } from "@/lib/api-errors";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { decideAppeal, loadMemberAppeals, loadReviewAppeals, loadSafetyOverview, submitAppeal } from "@/lib/safety-api";
import { safetyMessages } from "@/lib/safety-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { PostMediaGallery } from "./post-media";

async function memberPage(cursor: string | null, signal: AbortSignal) {
  const { decisions, nextCursor } = await loadMemberAppeals(cursor, signal);
  return { rows: decisions, nextCursor };
}

export function MemberAppeals() {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  const [revision, setRevision] = useState(0);
  const resource = useCursorPage(memberPage, revision);
  return <MemberShell><section className="grid gap-4">
    <PageHeader title={t.appeals} description={t.appealHelp} />
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{t.loading}</p>}
    {resource.page?.rows.length === 0 && <p className={institutionCard}>{t.noDecisions}</p>}
    {resource.page?.rows.map((item) => <MemberDecisionCard key={item.id} item={item} refresh={() => setRevision((value) => value + 1)} />)}
    <More resource={resource} />
  </section></MemberShell>;
}

function MemberDecisionCard({ item, refresh }: { item: MemberAppealDecision; refresh: () => void }) {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  const [reason, setReason] = useState("");
  const mutation = useFeedMutation();
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <article className={institutionCard} id={item.appeal ? `appeal-${item.appeal.id}` : undefined}>
    <h2 className="font-semibold">{item.kind === "post" ? t.hidePost : t.hideComment}</h2>
    <p className="mt-1 text-sm text-[var(--theme-body)]"><time dateTime={item.createdAt}>{format.format(new Date(item.createdAt))}</time></p>
    {item.appeal && <AppealResult appeal={item.appeal} />}
    {item.eligible && <form className="mt-3 grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      void mutation.run(async () => { await submitAppeal(item.id, item.kind, reason); refresh(); });
    }}>
      <p className="text-xs text-[var(--theme-body)]">{t.deadline} · <time dateTime={item.deadline}>{format.format(new Date(item.deadline))}</time></p>
      <label className="text-sm font-semibold">{t.appealReason}
        <textarea rows={3} className={institutionField} value={reason} onChange={(event) => setReason(event.target.value)}
          minLength={10} maxLength={1000} required disabled={mutation.busy} />
      </label>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
      <button type="submit" className={`${institutionAction} justify-self-start`} disabled={mutation.busy || reason.trim().length < 10}>{t.submit}</button>
    </form>}
  </article>;
}

function AppealResult({ appeal }: { appeal: ModerationAppeal }) {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  return <div className="mt-3 grid gap-2 break-words text-sm">
    <p className="font-semibold text-[var(--theme-link)]">{t[appeal.outcome]}</p>
    {appeal.decidedAt && <time dateTime={appeal.decidedAt} className="text-[var(--theme-body)]">
      {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(appeal.decidedAt))}
    </time>}
    {appeal.explanation && <p dir="auto" className="whitespace-pre-wrap">{appeal.explanation}</p>}
  </div>;
}

export function AppealReviewQueue() {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  const [scope, setScope] = useState<"pending" | "history">("pending");
  return <section className="grid gap-3" aria-label={t.review}>
    <div className="flex flex-wrap gap-3">
      {(["pending", "history"] as const).map((value) => <button key={value} type="button" aria-pressed={value === scope}
        className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)]"
        onClick={() => setScope(value)}>{value === "pending" ? t.pendingQueue : t.history}</button>)}
    </div>
    <ReviewList key={scope} scope={scope} />
  </section>;
}

function ReviewList({ scope }: { scope: "pending" | "history" }) {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  const [revision, setRevision] = useState(0);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { decisions, nextCursor } = await loadReviewAppeals(scope, cursor, signal);
    return { rows: decisions, nextCursor };
  }, [scope]);
  const resource = useCursorPage(load, revision);
  const mfa = apiErrorCode(resource.error) === "MFA_REQUIRED";
  return <>
    {resource.error !== null && <><ApiErrorNotice error={resource.error} retry={mfa ? undefined : resource.retry} />
      {mfa && <Link className={institutionLink} href="/mfa?next=/feed/moderation">{t.mfa}</Link>}</>}
    {!resource.page && resource.error === null && <p role="status">{t.loading}</p>}
    {resource.page?.rows.length === 0 && <p className={institutionCard}>{t.emptyQueue}</p>}
    {resource.error === null && resource.page?.rows.map((item) => <ReviewCard key={item.id} item={item} refresh={() => setRevision((n) => n + 1)} />)}
    <More resource={resource} />
  </>;
}

function ReviewCard({ item, refresh }: { item: AppealReview; refresh: () => void }) {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  const [outcome, setOutcome] = useState<AppealOutcome | "">("");
  const [explanation, setExplanation] = useState("");
  const [completed, setCompleted] = useState(false);
  const mutation = useFeedMutation();
  const allowed = appealOutcomes.filter((value) => value !== "overturned" || item.canRestore);
  const valid = outcome !== "" && allowed.some((value) => value === outcome);
  return <article className={institutionCard}>
    <h2 className="font-semibold">{item.kind === "post" ? t.hidePost : t.hideComment}</h2>
    <p lang={item.language} dir="auto" className="mt-2 whitespace-pre-wrap break-words rounded-md bg-[var(--theme-control)] p-3 text-sm">{item.body}</p>
    {item.attachments && <PostMediaGallery post={item.postId} attachments={item.attachments} review />}
    <dl className="mt-3 grid gap-2 break-words text-sm">
      <div><dt className="font-semibold">{t.original}</dt>
        <dd className="text-xs text-[var(--theme-body)]"><time dateTime={item.originalAt}>
          {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.originalAt))}
        </time></dd>
        <dd className="whitespace-pre-wrap" dir="auto">{item.originalReason}</dd></div>
      <div><dt className="font-semibold">{t.memberReason}</dt><dd className="whitespace-pre-wrap" dir="auto">{item.reason}</dd></div>
    </dl>
    {item.outcome !== "pending" ? <AppealResult appeal={item} />
      : item.conflict ? <p className="mt-3 text-sm text-[var(--theme-body)]">{t.conflict}</p>
      : !completed && <form className="mt-3 grid gap-3" onSubmit={(event) => {
        event.preventDefault();
        if (valid) void mutation.run(async () => { await decideAppeal(item.id, outcome, explanation); setCompleted(true); refresh(); });
      }}>
        <label className="text-sm font-semibold">{t.choose}
          <select className={institutionField} value={valid ? outcome : ""} required disabled={mutation.busy} onChange={(event) => {
            setOutcome(allowed.find((value) => value === event.target.value) ?? "");
          }}>
            <option value="" disabled>—</option>
            {allowed.map((value) => <option key={value} value={value}>{t[value]}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">{t.explanation}
          <input className={institutionField} value={explanation} minLength={10} maxLength={500}
            required disabled={mutation.busy} onChange={(event) => setExplanation(event.target.value)} />
        </label>
        {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
        {apiErrorCode(mutation.error) === "MFA_REQUIRED" && <Link className={institutionLink} href="/mfa?next=/feed/moderation">{t.mfa}</Link>}
        <button type="submit" className={`${institutionAction} justify-self-start`}
          disabled={!valid || explanation.trim().length < 10 || mutation.busy}>{t.decide}</button>
      </form>}
  </article>;
}

function More({ resource }: { resource: { page: { nextCursor: string | null } | null; loadingMore: boolean; more: () => Promise<void> } }) {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  return resource.page?.nextCursor ? <button type="button" className={`${institutionAction} justify-self-start`} disabled={resource.loadingMore}
    onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.loading : t.more}</button> : null;
}

const metrics: (keyof SafetyOverview)[] = ["pendingPostReports", "pendingCommentReports", "pendingAppeals", "restrictedAccounts", "moderationActions30Days", "cleanupBacklog"];

export function SafetyOverviewPanel() {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  const resource = useInstitutionResource(loadSafetyOverview);
  const number = new Intl.NumberFormat(locale);
  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.overview}</h2>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!resource.data && resource.error === null && <p role="status">{t.loading}</p>}
    {resource.data && <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((key) => <div key={key} className="min-w-0 rounded-md border border-[var(--theme-border)] p-3">
        <dt className="text-sm text-[var(--theme-body)]">{t[key]}</dt>
        <dd className="mt-1 text-xl font-semibold tabular-nums">{number.format(resource.data![key])}</dd>
      </div>)}
    </dl>}
  </section>;
}
