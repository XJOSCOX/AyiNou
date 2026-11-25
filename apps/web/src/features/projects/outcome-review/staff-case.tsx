import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { outcomeFindings, type OutcomeEvidenceItem, type OutcomeReviewCase, type OutcomeReviewerRoster,
  type OutcomeStaffLane, type ReleasedOutcomeEvidence } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { changeStaffOutcomeCase, loadReleasedOutcomeEvidence, loadReleasedOutcomeImage, loadStaffOutcomeCase } from "@/lib/project-outcome-review-api";
import { HistoryLabel, ReviewCommand, useReviewCopy } from "./review-controls";

function EvidenceImage({ workspace, item, current }: {
  workspace: string; item: Extract<OutcomeEvidenceItem, {kind: "image"}>; current: OutcomeReviewCase;
}) {
  const { t } = useReviewCopy();
  const [open, setOpen] = useState(false);
  return <div className="grid gap-2">
    <button type="button" className={institutionLink + " justify-self-start"} onClick={() => setOpen(!open)}
      aria-expanded={open}>{open ? t.closeImage : t.previewImage}</button>
    {open && <LoadedImage workspace={workspace} item={item} current={current} />}
  </div>;
}

function LoadedImage({ workspace, item, current }: {
  workspace: string; item: Extract<OutcomeEvidenceItem, {kind: "image"}>; current: OutcomeReviewCase;
}) {
  const { t } = useReviewCopy();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void loadReleasedOutcomeImage(workspace, current.id, item.sourceId, item.revision, current.version, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [workspace, current.id, current.version, item.sourceId, item.revision]);
  return failed ? <p role="alert">{t.noImage}</p> :
    url ? <Image className="h-auto max-w-full rounded-md" unoptimized src={url} alt={t.evidence} width={480} height={320} /> :
      <ProjectLoading cards={1} className="grid" />;
}

function FindingFields({ evidence }: { evidence: ReleasedOutcomeEvidence }) {
  const { t } = useReviewCopy();
  const [measure, setMeasure] = useState(false);
  return <>
    <label>{t.classification}<select className={institutionField} name="classification" defaultValue="insufficient_evidence">
      {outcomeFindings.map((item) => <option key={item} value={item}>{t.findings[item]}</option>)}
    </select></label>
    <label>{t.limitations}<textarea className={institutionField} name="limitations" required minLength={3} maxLength={1000} rows={2} /></label>
    {evidence.result.measurement !== null && evidence.result.unit && evidence.result.startsOn && evidence.result.endsOn && <>
      <label className="flex items-center gap-2"><input type="checkbox" checked={measure}
        onChange={(event) => setMeasure(event.target.checked)} />{t.includeMeasurement}</label>
      {measure && <>
        <label>{t.quantity} ({evidence.result.unit})<input className={institutionField} name="quantity" type="number"
          min={0} max={evidence.result.measurement} step=".01" required /></label>
        <label>{t.methodology}<textarea className={institutionField} name="methodology" minLength={5} maxLength={1000} rows={2} required /></label>
      </>}
    </>}
  </>;
}

function EvidenceAndDecisions({ current, workspace, after }: { current: OutcomeReviewCase; workspace: string; after: () => void }) {
  const { t, locale } = useReviewCopy();
  const loader = useCallback((signal: AbortSignal) => loadReleasedOutcomeEvidence(workspace, current.id, current.version, signal),
    [workspace, current.id, current.version]);
  const resource = useInstitutionResource(loader);
  const evidence = resource.data;
  const common = { version: current.version, send: (body: string) => changeStaffOutcomeCase(workspace, "review", current.id, body), after };
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  if (!evidence) return <ProjectLoading cards={1} className="grid" />;
  const initial = current.assignment?.lane === "initial";
  const challenge = current.assignment?.lane === "challenge";
  return <section className="grid min-w-0 gap-3 border-t border-[var(--theme-border)] pt-4">
    <h4 className="font-semibold">{t.recorded}</h4>
    <p className="font-medium break-words" dir="auto">{evidence.result.title}</p>
    <p className="whitespace-pre-wrap break-words" dir="auto">{evidence.result.reportedResult}</p>
    {evidence.result.measurement !== null &&
      <p>{new Intl.NumberFormat(locale).format(evidence.result.measurement)} {evidence.result.unit}</p>}
    {(evidence.result.startsOn || evidence.result.endsOn) &&
      <p>{[evidence.result.startsOn, evidence.result.endsOn].filter(Boolean).join(" – ")}</p>}
    <p className="whitespace-pre-wrap break-words" dir="auto">{evidence.explanation}</p>
    <h4 className="font-semibold">{t.evidence}</h4>
    <p className="text-sm">{t.pointer}</p>
    <ul className="grid gap-2">{evidence.manifest.map((item, index) => <li className="break-all" key={index}>
      {item.kind === "reference" ? item.reference : <EvidenceImage workspace={workspace} current={current} item={item} />}
    </li>)}</ul>
    {evidence.challenge && <div className="grid gap-2 rounded-md border border-[var(--theme-border)] p-3">
      <h4 className="font-semibold">{t.states.challenge}</h4>
      <p>{t.findings[evidence.challenge.classification]}</p>
      <p className="break-words" dir="auto">{evidence.challenge.findingExplanation}</p>
      <p className="break-words" dir="auto">{evidence.challenge.limitations}</p>
      <p className="break-words" dir="auto">{evidence.challenge.explanation}</p>
    </div>}
    <p className="text-sm">{t.findingHelp}</p>
    {initial && <ReviewCommand {...common} action="clarify" />}
    {challenge && <>
      <ReviewCommand {...common} action="uphold" />
      <ReviewCommand {...common} action="return" />
    </>}
    <ReviewCommand {...common} action={challenge ? "revise" : "finding"} input={(form) => ({
      classification: form.get("classification"), limitations: form.get("limitations"),
      measurement: form.has("quantity") ? { quantity: Number(form.get("quantity")),
        unit: evidence.result.unit, startsOn: evidence.result.startsOn, endsOn: evidence.result.endsOn,
        methodology: form.get("methodology") } : null,
    })}><FindingFields evidence={evidence} /></ReviewCommand>
  </section>;
}

function StaffActions({ current, workspace, lane, roster, after }: {
  current: OutcomeReviewCase; workspace: string; lane: OutcomeStaffLane; roster: OutcomeReviewerRoster | null; after: () => void;
}) {
  const { t } = useReviewCopy();
  const [opened, setOpened] = useState(false);
  const common = { version: current.version, send: (body: string) => changeStaffOutcomeCase(workspace, lane, current.id, body), after };
  if (lane === "admin") {
    const purpose = current.status === "challenge" ? "challenge" : "initial";
    const eligible = roster?.grants.filter((grant) => grant.purpose === purpose && grant.eligible) ?? [];
    return <>
      {current.assignment && <ReviewCommand {...common} action="release_assignment" />}
      {current.availableForReview && ["queued", "challenge", "reassessment"].includes(current.status) && !current.assignment?.valid &&
        (eligible.length ? <ReviewCommand {...common} action="assign" input={(form) => ({
          target: form.get("target"), expiresAt: new Date(String(form.get("deadline"))).toISOString(),
        })}>
          <label>{t.target}<select defaultValue="" name="target" className={institutionField} required>
            <option value="">{t.noOption}</option>
            {eligible.map((person) => <option key={person.actor} value={person.actor}>{person.label ?? person.actor}</option>)}
          </select></label>
          <label>{t.deadline}<input type="datetime-local" name="deadline" className={institutionField} required /></label>
        </ReviewCommand> : <p>{t.nobody}</p>)}
    </>;
  }
  if (!current.assignment) return null;
  return <>
    {!current.assignment.acceptedAt && current.availableForReview && <ReviewCommand {...common} action="accept"
      input={() => ({ conflictFree: true })}>
      <label className="flex items-start gap-2"><input type="checkbox" required />{t.conflictFree}</label>
    </ReviewCommand>}
    <ReviewCommand {...common} action="recuse" />
    {current.assignment.acceptedAt && current.availableForReview && current.released && <>
      {!opened && <div><button type="button" className={institutionAction} onClick={() => setOpened(true)}>{t.actions.evidence}</button></div>}
      {opened && <EvidenceAndDecisions current={current} after={after} workspace={workspace} />}
    </>}
  </>;
}

export function StaffOutcomeCase({ id, workspace, lane, roster, onChanged }: {
  id: string; workspace: string; lane: OutcomeStaffLane; roster: OutcomeReviewerRoster | null; onChanged: () => void;
}) {
  const { t, locale } = useReviewCopy();
  const loader = useCallback((signal: AbortSignal) => loadStaffOutcomeCase(workspace, lane, id, signal), [workspace, lane, id]);
  const resource = useInstitutionResource(loader);
  const current = resource.data;
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  if (!current) return <ProjectLoading cards={1} className="grid" />;
  return <section className="grid min-w-0 gap-3">
    <p role="status">{t.states[current.status]} · {t.revision} {current.revision}</p>
    {!current.activeSource ? <p>{t.stale}</p> : current.status !== "withdrawn" && !current.availableForReview && <p>{t.paused}</p>}
    <p>{current.released ? t.released : t.noRelease}</p>
    {current.assignment && <p>{t.deadline} <time dateTime={current.assignment.deadline}>
      {new Date(current.assignment.deadline).toLocaleString(locale)}</time>{!current.assignment.valid && " · " + t.ineligible}</p>}
    <StaffActions key={current.version} current={current} lane={lane} workspace={workspace} roster={roster}
      after={() => { resource.refresh(); onChanged(); }} />
    {current.history?.length ? <details><summary className="cursor-pointer font-medium">{t.history}</summary>
      <ul className="grid gap-2 pt-3">{current.history.map((entry, index) => <li className="break-words" key={index}>
        <HistoryLabel action={entry.action} /> · <time dateTime={entry.at}>{new Date(entry.at).toLocaleString(locale)}</time>
        {entry.note && <p dir="auto">{entry.note}</p>}
      </li>)}</ul>
    </details> : null}
  </section>;
}
