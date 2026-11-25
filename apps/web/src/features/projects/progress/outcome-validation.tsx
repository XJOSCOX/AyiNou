import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { MemberPublication } from "../outcome-publication/member-publication";
import { MemberReview } from "../outcome-review/member-review";
import { outcomeSourceKinds, type OutcomeRequest, type OutcomeResult, type OutcomeSourceKind } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { changeOutcomeRequest, loadOutcomeRequest, loadOutcomeRequests, loadOutcomeSources } from "@/lib/project-outcome-api";
import { outcomeMessages } from "@/lib/project-outcome-i18n";

function useLabels() {
  const [locale] = useLocale();
  return { t: outcomeMessages[locale], locale };
}

function RecordedResult({ result, revision }: { result: OutcomeResult; revision: number }) {
  const { t, locale } = useLabels();
  return <div className="grid min-w-0 gap-2 rounded-lg border border-[var(--theme-border)] p-4">
    <h4 className="break-words font-semibold" dir="auto">{result.title}</h4>
    <p className="text-sm">{result.internallyReviewed ? t.internal : t.selfReported} · {t.revision} {revision}</p>
    <p className="whitespace-pre-wrap break-words" dir="auto">{result.reportedResult}</p>
    <dl className="flex flex-wrap gap-4 text-sm">
      <div><dt className="font-medium">{t.measurement}</dt><dd>{result.measurement === null ? t.noMeasurement :
        <>{new Intl.NumberFormat(locale).format(result.measurement)} {result.unit}</>}</dd></div>
      {(result.startsOn || result.endsOn) && <div><dt className="font-medium">{t.period}</dt>
        <dd>{result.startsOn && <>{t.from} <time dateTime={result.startsOn}>{result.startsOn}</time> </>}
          {result.endsOn && <>{t.through} <time dateTime={result.endsOn}>{result.endsOn}</time></>}</dd></div>}
    </dl>
    {result.evidence.length > 0 && <div>
      <p className="text-sm font-medium">{t.evidence}</p>
      <ul className="list-inside list-disc text-sm">{result.evidence.map((item, index) =>
        <li className="break-all" key={item.sourceId + "-" + index}>{item.kind === "reference" ? item.reference : t.evidenceImage}
          {" · "}{t.revision} {item.revision}</li>)}</ul>
    </div>}
  </div>;
}

function OutcomeForm({ project, id, label, input, onSaved, children }: {
  project: string; id: string | null; label: string; input: (fields: FormData) => Record<string, unknown>;
  onSaved: (request: OutcomeRequest) => void; children: ReactNode;
}) {
  const { t, locale } = useLabels();
  const mutation = useFeedMutation();
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const code = apiErrorCode(mutation.error);
  const knownMessage = code === "CONFLICT" ? t.duplicate : code === "STALE_VERSION" ? t.stale :
    code === "NOT_FOUND" ? t.unavailable : code === "PROJECT_OUTCOMES_DISABLED" ? t.closed : null;
  return <form className="grid gap-3" onSubmit={(event) => {
    event.preventDefault();
    if (mutation.busy) return;
    const body = JSON.stringify(input(new FormData(event.currentTarget)));
    if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
    const { key } = attempt.current;
    void mutation.run(async () => {
      const updated = await changeOutcomeRequest(project, id, key, body);
      attempt.current = null;
      onSaved(updated);
    });
  }}>
    {children}
    {knownMessage ? <p role="alert" className="text-sm">{knownMessage}</p> :
      mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
    <div><button className={institutionAction} disabled={mutation.busy}>{mutation.busy ? authMessages[locale].working : label}</button></div>
  </form>;
}

function Fields({ request }: { request?: OutcomeRequest }) {
  const { t } = useLabels();
  return <>
    <label>{t.classification}<select name="classification" className={institutionField} defaultValue={request?.classification ?? "output"}>
      <option value="output">{t.output}</option><option value="outcome">{t.outcome}</option>
    </select></label>
    <label>{t.explanation}
      <textarea name="explanation" className={institutionField} rows={3} minLength={3} maxLength={800}
        defaultValue={request?.explanation} required />
      <span className="text-sm">{t.privacy}</span>
    </label>
  </>;
}

const fields = (data: FormData) => ({ classification: data.get("classification"), explanation: String(data.get("explanation") ?? "").trim() });

function SourcePicker({ project, onSaved }: { project: string; onSaved: (request: OutcomeRequest) => void }) {
  const { t } = useLabels();
  const [kind, setKind] = useState<OutcomeSourceKind>("milestone");
  const [after, setAfter] = useState<string | null>(null);
  const [selected, select] = useState("");
  const loader = useCallback((signal: AbortSignal) => loadOutcomeSources(project, kind, after, signal), [project, kind, after]);
  const sourcePage = useInstitutionResource(loader);
  const picked = sourcePage.data?.items.find((source) => source.id === selected);
  const changePage = (cursor: string | null) => { select(""); setAfter(cursor); };
  return <div className="grid gap-3">
    <label>{t.kind}<select className={institutionField} value={kind} onChange={(event) => {
      setKind(event.target.value as OutcomeSourceKind);
      changePage(null);
    }}>{outcomeSourceKinds.map((value) => <option key={value} value={value}>{t.kinds[value]}</option>)}</select></label>
    {!sourcePage.data && sourcePage.error === null && <ProjectLoading cards={1} className="grid" />}
    {sourcePage.error !== null && <ApiErrorNotice error={sourcePage.error} retry={sourcePage.refresh} signIn />}
    {sourcePage.data && (sourcePage.data.items.length > 0 ?
      <label>{t.source}<select className={institutionField} value={selected} onChange={(event) => select(event.target.value)}>
        <option value="">{t.select}</option>
        {sourcePage.data.items.map((source) => <option value={source.id} key={source.id}>{source.result.title}
          {source.result.endsOn && " · " + source.result.endsOn}</option>)}
      </select></label> : <p className="text-sm">{t.noSources}</p>)}
    <Paging after={after} next={sourcePage.data?.nextCursor} change={changePage} />
    {picked && <div className="grid gap-3" key={picked.id + picked.fingerprint}>
      <RecordedResult result={picked.result} revision={picked.revision} />
      <OutcomeForm project={project} id={null} label={t.create} input={(data) => ({
        sourceKind: kind, sourceId: picked.id, sourceRevision: picked.revision, sourceFingerprint: picked.fingerprint, ...fields(data),
      })} onSaved={onSaved}><Fields /></OutcomeForm>
    </div>}
  </div>;
}

function Paging({ after, next, change }: {
  after: string | null; next: string | null | undefined; change: (cursor: string | null) => void;
}) {
  const { t } = useLabels();
  if (!after && !next) return null;
  return <div className="flex flex-wrap gap-4">
    {after && <button type="button" className={institutionLink} onClick={() => change(null)}>{t.first}</button>}
    {next && <button type="button" className={institutionLink} onClick={() => change(next)}>{t.next}</button>}
  </div>;
}

function RequestDetails({ project, id, onChanged }: { project: string; id: string; onChanged: () => void }) {
  const { t, locale } = useLabels();
  const loader = useCallback((signal: AbortSignal) => loadOutcomeRequest(project, id, signal), [project, id]);
  const resource = useInstitutionResource(loader);
  const request = resource.data;
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  if (!request) return <ProjectLoading cards={1} className="grid" />;
  const onSaved = () => {
    resource.refresh();
    onChanged();
  };
  return <div className="grid gap-3">
    <h4 className="font-semibold">{t.detail}</h4>
    <p role="status">{t[request.status]}</p>
    <p className="text-sm">{t.kinds[request.sourceKind]} · {t[request.classification]}</p>
    <p className="text-sm">{t.created} <time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString(locale)}</time>
      {request.submittedAt && <> · {t.submittedAt} <time dateTime={request.submittedAt}>{new Date(request.submittedAt).toLocaleString(locale)}</time></>}</p>
    <RecordedResult result={request.result} revision={request.sourceRevision} />
    <p className="whitespace-pre-wrap break-words" dir="auto">{request.explanation}</p>
    {request.status === "draft" && <OutcomeForm key={"edit-" + request.revision} project={project} id={id} label={t.edit}
      input={(data) => ({ action: "edit", expectedRevision: request.revision, ...fields(data) })} onSaved={onSaved}>
      <Fields request={request} />
    </OutcomeForm>}
    <div className="flex flex-wrap gap-4">
      {request.status === "draft" && <Confirmation project={project} request={request} action="submit" onSaved={onSaved} />}
      {request.status !== "withdrawn" && <Confirmation project={project} request={request} action="withdraw" onSaved={onSaved} />}
    </div>
    {request.status !== "draft" && <>
      <MemberReview request={request} key={request.revision} />
      {request.mine && <MemberPublication request={request} key={"publication-" + request.revision} />}
    </> }
    <details><summary className="cursor-pointer font-medium">{t.history}</summary>
      <ol className="grid gap-3 pt-2">{request.history.map((entry) => <li className="break-words text-sm" key={entry.revision}>
        <p>{t[entry.action]} · {t[entry.status]} · {t[entry.classification]} ·{" "}
          <time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString(locale)}</time></p>
        <p className="whitespace-pre-wrap" dir="auto">{entry.explanation}</p>
      </li>)}</ol>
    </details>
  </div>;
}

function Confirmation({ project, request, action, onSaved }: {
  project: string; request: OutcomeRequest; action: "submit" | "withdraw"; onSaved: (request: OutcomeRequest) => void;
}) {
  const { t } = useLabels();
  return <details key={request.revision} className="min-w-0 rounded-lg border border-[var(--theme-border)] p-3">
    <summary className="cursor-pointer font-medium">{t[action]}</summary>
    <div className="pt-2"><OutcomeForm project={project} id={request.id} label={t[action]}
      input={() => ({ action, expectedRevision: request.revision, confirmed: true })} onSaved={onSaved}>
      <label className="flex items-start gap-2"><input type="checkbox" required />
        {action === "submit" ? t.confirmSubmit : t.confirmWithdraw}
      </label>
    </OutcomeForm></div>
  </details>;
}

export function OutcomeValidation({ project }: { project: string }) {
  const { t } = useLabels();
  const headingId = useId();
  const [after, setAfter] = useState<string | null>(null);
  const [selected, select] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const loader = useCallback((signal: AbortSignal) => loadOutcomeRequests(project, after, signal), [project, after]);
  const resource = useInstitutionResource(loader);
  const code = apiErrorCode(resource.error);
  return <section className="grid gap-4 rounded-lg border border-[var(--theme-border)] p-4" aria-labelledby={headingId}>
    <div>
      <h3 id={headingId} className="text-lg font-semibold">{t.heading}</h3>
      {code === "PROJECT_OUTCOMES_DISABLED" && <p className="text-sm">{t.noFindings}</p>}
    </div>
    {code === "PROJECT_OUTCOMES_DISABLED" ? <p role="status">{t.closed}</p> :
      resource.error !== null ? <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn /> :
      !resource.data ? <ProjectLoading cards={1} className="grid" /> : <>
        <details className="rounded-lg border border-[var(--theme-border)] p-3" key={formVersion}>
          <summary className="cursor-pointer font-medium">{t.choose}</summary>
          <div className="pt-3"><SourcePicker project={project} onSaved={(request) => {
            select(request.id);
            setFormVersion((version) => version + 1);
            resource.refresh();
          }} /></div>
        </details>
        <h4 className="font-semibold">{t.requests}</h4>
        {resource.data.items.length === 0 ? <p className="text-sm">{t.noRequests}</p> :
          <ul className="grid gap-2">{resource.data.items.map((request) => <li key={request.id}>
            <button type="button" className={institutionLink + " text-start"} aria-pressed={selected === request.id} onClick={() => select(request.id)}>
              {request.title} · {t[request.status]}
            </button>
          </li>)}</ul>}
        <Paging after={after} next={resource.data.nextCursor} change={setAfter} />
        {selected && <RequestDetails project={project} id={selected} key={selected} onChanged={resource.refresh} />}
      </>}
  </section>;
}
