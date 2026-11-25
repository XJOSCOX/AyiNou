import { useCallback } from "react";
import type { OutcomePublication, OutcomeRequest } from "@ayinou/shared";
import { OutcomeImpactMapping } from "@/features/impact/member-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { apiErrorCode } from "@/lib/api-errors";
import { changeMemberPublication, loadMemberPublication } from "@/lib/project-outcome-publication-api";
import { ReviewCommand, useReviewCopy } from "../outcome-review/review-controls";
import { Disclosure, usePublicationCopy } from "./disclosure";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export function PublicationHistory({ history }: { history: OutcomePublication["history"] }) {
  const { t, locale } = usePublicationCopy();
  const { t: review } = useReviewCopy();
  if (!history.length) return null;
  return <details>
    <summary className="cursor-pointer font-medium">{review.history}</summary>
    <ol className="grid gap-2 pt-2">{history.map((event, index) => <li key={index} className="break-words text-sm">
      <span>{t[event.action as keyof typeof t] ?? review.actions[event.action as keyof typeof review.actions] ?? t.title}</span>
      {" · "}<time dateTime={event.at}>{new Date(event.at).toLocaleString(locale)}</time>
      {event.note && <p dir="auto">{event.note}</p>}
    </li>)}</ol>
  </details>;
}

export function MemberPublication({ request }: { request: OutcomeRequest }) {
  const { id, projectId } = request;
  const { t, locale } = usePublicationCopy();
  const { t: review } = useReviewCopy();
  const loader = useCallback((signal: AbortSignal) => loadMemberPublication(projectId, id, signal), [projectId, id]);
  const resource = useInstitutionResource(loader);
  if (apiErrorCode(resource.error) === "PROJECT_OUTCOME_PUBLICATION_DISABLED") return <p className="text-sm" aria-live="polite">{t.closed}</p>;
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  const publication = resource.data;
  if (!publication) return null;
  const { status, draft, options, appealUntil } = publication;
  const send = (body: string) => changeMemberPublication(projectId, id, body);
  const common = { send, version: publication.version, after: resource.refresh };
  const canDraft = options?.length && (!status || ["draft", "changes", "approved", "withdrawn", "invalidated"].includes(status));
  const canWithdraw = status && status !== "withdrawn";
  const feedback = status === "changes" || status === "rejected"
    ? publication.history.find((event) => event.action === (status === "changes" ? "changes" : "reject"))?.note : null;
  return <section className="grid min-w-0 gap-3 rounded-lg border border-[var(--theme-border)] p-4" key={publication.version}>
    <h4 className="font-semibold">{t.title}</h4>
    {status ? <p role="status">{t[`state_${status}`]} · {review.revision} {publication.revision}</p> : <p>{t.eligible}</p>}
    {feedback && <p className="whitespace-pre-wrap break-words" dir="auto">{feedback}</p>}
    {!!draft && <details open={status === "draft"}>
      <summary className="cursor-pointer pb-2 font-medium">{t.preview}</summary>
      <Disclosure result={draft} preview />
    </details>}
    {status === "draft" && publication.available && publication.fingerprint && (
      <ReviewCommand {...common} action="submit" label={t.submit} confirmation={t.consent}
        input={() => ({ fingerprint: publication.fingerprint })} />
    )}
    {!!canDraft && <ReviewCommand {...common} action="draft" label={t.draft} input={(form) => ({
      findingId: field(form, "findingId"), content: { title: field(form, "title"), summary: field(form, "summary"),
        limitations: field(form, "limitations"), includeReported: form.has("includeReported") },
    })}>
      {status === "approved" && <p>{t.replaceHelp}</p>}
      <label>{t.independent}<select className={institutionField} name="findingId" required defaultValue={publication.findingId ?? ""}>
        <option value="">{review.noOption}</option>
        {options?.map((item) => <option key={item.id} value={item.id}>{review.findings[item.classification]} · {
          new Date(item.reviewedAt).toLocaleDateString(locale)}</option>)}
      </select></label>
      <label>{t.resultTitle}<input className={institutionField} name="title" required minLength={3} maxLength={120} defaultValue={draft?.title} /></label>
      <label>{t.summary}<textarea className={institutionField} name="summary" required minLength={5} maxLength={1000} defaultValue={draft?.summary} /></label>
      <label>{t.limit}<textarea className={institutionField} name="limitations" required minLength={3} maxLength={700} defaultValue={draft?.limitations} /></label>
      <label className="flex items-start gap-2"><input type="checkbox" name="includeReported"
        defaultChecked={draft?.reportedQuantity !== null && draft?.reportedQuantity !== undefined} />{t.include}</label>
    </ReviewCommand>}
    {!options?.length && !status && <p>{t.none}</p>}
    {canWithdraw && <ReviewCommand {...common} action="withdraw" label={t.withdraw}><p>{t.withdrawHelp}</p></ReviewCommand>}
    {appealUntil && publication.available && <ReviewCommand {...common} action="appeal" label={t.appeal}>
      <p>{t.appealUntil} <time dateTime={appealUntil}>{new Date(appealUntil).toLocaleString(locale)}</time></p>
    </ReviewCommand>}
    {status === "approved" && publication.id && <OutcomeImpactMapping id={publication.id} />}
    <PublicationHistory history={publication.history} />
  </section>;
}
