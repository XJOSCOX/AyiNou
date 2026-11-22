"use client";

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { reviewDecisions, reviewQueueModes, type ReviewApplication, type ReviewQueueMode } from "@ayinou/shared";
import { adminMessages } from "@/lib/admin-i18n";
import { loadPlatformAccess } from "@/lib/admin-api";
import { authMessages } from "@/lib/auth-i18n";
import { decideApplication, loadReviewQueue, setReviewWork } from "@/lib/institution-api";
import { institutionError, institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { founderMessages } from "@/lib/founder-i18n";
import { trustMessages } from "@/lib/trust-i18n";
import { localizedApiError } from "@/lib/error-i18n";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { AdminFeedback } from "./admin-workspace";
import { FounderAppealReview } from "./founder-appeal-review";
import { VerificationAppealReview } from "./trust-workspace";

export function VerificationReview({ workspaceAction, workspaceId }: { workspaceAction: ReactNode; workspaceId: string }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const auth = authMessages[locale];
  const [mode, setMode] = useState<ReviewQueueMode>("pending");
  const loader = useCallback((signal: AbortSignal) => loadReviewQueue(mode, signal), [mode]);
  const queue = useInstitutionResource(loader);
  const access = useInstitutionResource(loadPlatformAccess);
  const current = queue.data?.filter((application) => mode === "assigned" ? application.status === "pending" && application.assignedToMe : application.status === mode);
  const error = queue.error instanceof Error && queue.error.message === "MFA_REQUIRED" && access.data?.reviewer === false
    ? new Error("FORBIDDEN") : queue.error;

  return (
    <MemberShell>
      <div className="grid gap-5">
        <PageHeader title={t.review} description={t.reviewIntro} actions={workspaceAction} />
        {!error && <div className="flex flex-wrap gap-2" role="group" aria-label={t.applications}>
          {reviewQueueModes.map((status) => <button key={status} type="button" aria-pressed={mode === status}
            className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)]"
            onClick={() => setMode(status)}>{status === "assigned" ? adminMessages[locale].assigned : t[status]}</button>)}
        </div>}
        {error ? <AdminFeedback error={error} totp={access.data?.totp} retry={queue.refresh} next="/verification/review" />
          : !current ? <p role="status">{auth.working}</p>
          : current.length ? current.map((item) => <ReviewCard key={item.id} item={item} refresh={queue.refresh} />)
          : <p className={institutionCard}>{t.emptyQueue}</p>}
        {access.data?.reviewer && <VerificationAppealReview />}
        {access.data?.reviewer && !access.data?.founder && <FounderAppealReview workspaceId={workspaceId} />}
      </div>
    </MemberShell>
  );
}

function ReviewCard({ item, refresh }: { item: ReviewApplication; refresh: () => void }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const admin = adminMessages[locale];
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const didApprove = item.reviews.some((review) => review.decision === "approve" && review.isSelf);
  const actions = reviewDecisions.filter((action) => (!item.assignmentRequired || item.assignedToMe) &&
    (
    (item.status === "approved" && action === "revoke") || (item.status === "pending" &&
      (action === "reject" || (action === "approve" && !didApprove)))));

  async function updateWork() {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try { await setReviewWork(item.id, !item.assignedToMe); refresh(); }
    catch (cause) { setFailed(cause); }
    finally { setBusy(false); }
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const input = new FormData(form);
    const action = actions.find((value) => value === input.get("decision"));
    if (!action || !input.get("conflictFree")) return;
    setBusy(true);
    setFailed(null);
    setSaved(false);
    try {
      await decideApplication(item.id, action, String(input.get("rationale") ?? ""));
      form.reset();
      setSaved(true);
      refresh();
    } catch (cause) { setFailed(cause); }
    finally { setBusy(false); }
  }

  return (
    <article className={institutionCard}>
      <h2 className="text-xl font-semibold">{t[item.kind]}{item.organizationName && ` · ${item.organizationName}`}</h2>
      <p className="mt-1 break-words text-sm text-[var(--theme-body)]">
        {item.applicantName ?? item.applicantUsername ?? item.applicantId}{item.organizationHandle && ` · @${item.organizationHandle}`}
      </p>
      {(item.status === "pending" || (item.status === "approved" && item.assignmentRequired)) &&
        <button type="button" className={`${institutionLink} mt-2`} disabled={busy} onClick={() => { void updateWork(); }}>
        {item.assignedToMe ? admin.releaseWork : admin.claimWork}
      </button>}
      {failed !== null && (failed instanceof Error && failed.message === "MFA_REQUIRED"
        ? <AdminFeedback error={failed} next="/verification/review" />
        : <p role="alert" className={institutionErrorBox}>{failed instanceof Error && ["VERIFICATION_ASSIGNMENT_REQUIRED", "CLAIM_APPROVAL_HELD"].includes(failed.message)
          ? localizedApiError(locale, failed) : institutionError(t, failed)}</p>)}
      {item.founderVerified && <p className="mt-2 text-sm font-semibold">{founderMessages[locale].badge}</p>}
      {item.status === "closed" && <div className="mt-2 grid gap-1 text-sm">
        <p>{item.closureReason ? founderMessages[locale].supersessionResults.superseded_by_founder_verification : t.founderClosureReason}</p>
        <p>{t.applicationSubmitted} <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale)}</time></p>
        {item.decidedAt && <p>{t.applicationResolved} <time dateTime={item.decidedAt}>{new Date(item.decidedAt).toLocaleString(locale)}</time></p>}
      </div>}
      {item.status !== "closed" && item.assignmentRequired && !item.assignedToMe && <p className="mt-2 text-sm">{trustMessages[locale].assignmentRequired}</p>}
      {item.eligibleReviewers != null && item.eligibleReviewers < 2 && item.status === "pending" &&
        <p className="mt-2 text-sm">{trustMessages[locale].reviewersNeeded}</p>}
      {(item.status !== "closed" || item.assignedToMe) && <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div>
          <h3 className="font-semibold">{t.evidence}</h3>
          <ul className="mt-2 space-y-1">{item.evidence.map((url) => <li key={url} className="break-all">
            <a href={url} target="_blank" rel="noreferrer" className={institutionLink}>{url}</a>
          </li>)}</ul>
          {item.reviews.length > 0 && <ul className="mt-4 space-y-2 border-t border-[var(--theme-border)] pt-3">
            {item.reviews.map((review, index) => <li key={`${review.createdAt}-${index}`} className="text-sm">
              <p className="font-semibold">{t[review.decision]}{review.isSelf && ` · ${t.you}`}</p>
              <p className="whitespace-pre-line break-words text-[var(--theme-body)]">{review.rationale}</p>
            </li>)}
          </ul>}
        </div>
        {actions.length > 0 && <form onSubmit={decide} className="space-y-3" aria-busy={busy}>
          <label className="block text-sm font-semibold">{t.verification}<select name="decision" className={institutionField} disabled={busy}>
            {actions.map((action) => <option key={action} value={action}>{t[action]}</option>)}
          </select></label>
          <label className="block text-sm font-semibold">{t.rationale}
            <textarea rows={3} name="rationale" className={institutionField} minLength={10} maxLength={1000} required disabled={busy} />
          </label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" name="conflictFree" required disabled={busy} />{t.conflictFree}</label>
          {saved && <p role="status" className="text-sm">{t.reviewRecorded}</p>}
          <button type="submit" disabled={busy} className={institutionAction}>{t.submitDecision}</button>
        </form>}
      </div>}
    </article>
  );
}
