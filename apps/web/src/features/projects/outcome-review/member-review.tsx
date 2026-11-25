import { useCallback } from "react";
import Link from "next/link";
import type { OutcomeFinding, OutcomeRequest } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { apiErrorCode } from "@/lib/api-errors";
import { changeMemberOutcomeReview, loadMemberOutcomeReview, loadOutcomeReviewNotices, outcomeReviewPath } from "@/lib/project-outcome-review-api";
import { HistoryLabel, ReviewCommand, useReviewCopy } from "./review-controls";

function Finding({ finding, challenge }: { finding: OutcomeFinding; challenge?: React.ReactNode }) {
  const { t, locale } = useReviewCopy();
  return <article className="grid gap-2 rounded-md border border-[var(--theme-border)] p-3">
    <h5 className="font-semibold">{t.findings[finding.classification]}</h5>
    <p className="text-sm">{t.revision} {finding.revision} · {finding.current ? t.states.decided : t.historical}</p>
    <time dateTime={finding.availableAt} className="text-sm">{new Date(finding.availableAt).toLocaleString(locale)}</time>
    <p className="whitespace-pre-wrap break-words" dir="auto">{finding.explanation}</p>
    <p className="font-medium">{t.limitations}</p>
    <p className="whitespace-pre-wrap break-words" dir="auto">{finding.limitations}</p>
    {finding.measurement && <div className="grid gap-1">
      <p className="font-medium">{t.measurement}</p>
      <p>{new Intl.NumberFormat(locale).format(finding.measurement.quantity)} {finding.measurement.unit}</p>
      <p>{finding.measurement.startsOn} – {finding.measurement.endsOn}</p>
      <p className="break-words" dir="auto">{finding.measurement.methodology}</p>
    </div>}
    {finding.challenge && <div className="grid gap-1">
      <p className="font-medium">{finding.challenge.resolution ? t.challengeState[finding.challenge.resolution] : t.states.challenge}</p>
      {finding.challenge.reason && <p className="break-words" dir="auto">{finding.challenge.reason}</p>}
    </div>}
    {challenge}
  </article>;
}

export function MemberReview({ request }: { request: OutcomeRequest }) {
  const { t, locale } = useReviewCopy();
  const { id, projectId } = request;
  const loader = useCallback((signal: AbortSignal) => loadMemberOutcomeReview(projectId, id, signal), [projectId, id]);
  const resource = useInstitutionResource(loader);
  if (apiErrorCode(resource.error) === "PROJECT_OUTCOME_REVIEW_DISABLED") return null;
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  const review = resource.data;
  if (!review) return <ProjectLoading cards={1} className="grid" />;
  if ("unavailable" in review) return <p role="status">{t.unavailable}</p>;
  const send = (body: string) => changeMemberOutcomeReview(projectId, id, body);
  const common = { version: review.version, send, after: resource.refresh };
  const options = review.evidenceOptions ?? [];
  return <section className="grid gap-3 border-t border-[var(--theme-border)] pt-4">
    <h4 className="text-base font-semibold">{t.title}</h4>
    <p role="status">{t.states[review.status]} · {t.revision} {review.revision}</p>
    {request.status === "submitted" && (!review.activeSource ? <p>{t.stale}</p> :
      !review.availableForReview && <p>{t.paused}</p>)}
    <p className="text-sm">{t.findingHelp}</p>
    {review.clarification && <p className="whitespace-pre-wrap break-words" dir="auto">{review.clarification}</p>}
    {request.status === "submitted" && <>
      <p>{review.released ? t.released : t.noRelease}</p>
      {(review.releaseActive || review.availableForReview) && <ReviewCommand {...common} key={"release-" + review.version}
        action={review.releaseActive ? "revoke_evidence" : "release_evidence"} />}
      {review.availableForReview && ["queued", "clarification", "decided"].includes(review.status) &&
        !review.findings.some((finding) => finding.revision === review.revision && finding.challenge) &&
        <ReviewCommand {...common} key={"correct-" + review.version} action="correct" input={(form) => ({
          manifest: form.getAll("evidence").map((value) => options[Number(value)]).filter(Boolean),
        })}>
          {options.length > 0 && <fieldset className="grid gap-2">
            <legend className="font-medium">{t.evidenceSelection}</legend>
            {options.map((item, index) => <label className="flex min-w-0 items-start gap-2 break-all" key={index}>
              <input type="checkbox" name="evidence" value={index}
                defaultChecked={review.manifest.some((current) => current.kind === item.kind && current.sourceId === item.sourceId &&
                  current.revision === item.revision && (current.kind === "reference" && item.kind === "reference"
                    ? current.reference === item.reference : current.kind === "image" && item.kind === "image" && current.digest === item.digest))} />
              {item.kind === "reference" ? item.reference : t.previewImage}
            </label>)}
          </fieldset>}
        </ReviewCommand>}
    </>}
    {review.findings.length === 0 && <p>{t.noFindings}</p>}
    {review.findings.map((finding) => <Finding key={finding.id} finding={finding}
      challenge={request.status === "submitted" && review.activeSource && finding.challengeUntil ? <div className="grid gap-2">
          <p>{t.challengeUntil} <time dateTime={finding.challengeUntil}>{new Date(finding.challengeUntil).toLocaleString(locale)}</time></p>
          <ReviewCommand {...common} key={review.version} action="challenge" input={() => ({ findingId: finding.id })} />
        </div> : undefined} />)}
    <details><summary className="cursor-pointer font-medium">{t.history}</summary>
      <ul className="grid gap-2 pt-3">{review.history.map((item) => <li className="break-words" key={item.revision}>
        <p className="text-sm">{t.revision} {item.revision} · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale)}</time></p>
        <p className="whitespace-pre-wrap" dir="auto">{item.explanation}</p>
      </li>)}</ul>
    </details>
  </section>;
}

export function OutcomeReviewNotices() {
  const { t, locale } = useReviewCopy();
  const resource = useInstitutionResource(loadOutcomeReviewNotices);
  if (!resource.data?.length) return null;
  return <section className="grid gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
    <h2 className="font-semibold">{t.notices}</h2>
    <ul className="grid gap-2">{resource.data.map((item) => <li className="flex flex-wrap gap-2 text-sm" key={item.id}>
      <HistoryLabel action={item.action} />
      <time dateTime={item.at}>{new Date(item.at).toLocaleString(locale)}</time>
      <Link className={institutionLink} href={item.projectId ? "/projects/" + item.projectId + "/work?section=outcomes" : outcomeReviewPath}>{t.details}</Link>
    </li>)}</ul>
  </section>;
}
