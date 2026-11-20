"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  projectProgressKinds, type ProjectMilestone, type ProjectMetric, type ProjectProgress, type ProjectProgressContent,
  type ProjectProgressEntry, type ProjectProgressEvent, type ProjectWork,
} from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { changeProgress, getProgressImage, loadProgress, putProgressImage, type ProgressInput, type ProgressSection } from "@/lib/project-progress-api";
import { projectProgressMessages } from "@/lib/project-progress-i18n";
import { projectWorkMessages } from "@/lib/project-work-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

export const progressTabs = ["milestones", "progress", "updates", "outcomes"] as const;
export type ProgressTab = (typeof progressTabs)[number];
const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const nullable = (data: FormData, key: string) => value(data, key) || null;
const actionRow = "flex flex-wrap items-start gap-3";
type Controls = { id: string; refresh: () => void };

function useProgressText() {
  const [locale] = useLocale();
  return { locale, t: projectProgressMessages[locale], workText: projectWorkMessages[locale] };
}

function Change({ id, refresh, section, action, data, read, children }: Controls & {
  section: ProgressSection; action: ProjectProgressEvent; data?: ProgressInput; read?: (fields: FormData) => ProgressInput; children?: ReactNode;
}) {
  const { t, locale } = useProgressText();
  const mutation = useFeedMutation();
  const key = useRef<string | null>(null);
  return <form className="grid min-w-0 gap-2" onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = { ...data, ...read?.(new FormData(form)) };
    if (action === "entry_create" || action === "milestone_create") input.key = key.current ??= crypto.randomUUID();
    void mutation.run(async () => {
      await changeProgress(id, section, action, input);
      key.current = null;
      form.reset();
      refresh();
    });
  }}>
    {children}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
    {apiErrorCode(mutation.error) === "MFA_REQUIRED" &&
      <Link href={"/mfa?next=/projects/" + id + "/work"} className={institutionLink}>{t.authenticator}</Link>}
    <button className={institutionAction} disabled={mutation.busy}>{mutation.busy ? authMessages[locale].working : t.actions[action]}</button>
  </form>;
}

function Reason() {
  const { t } = useProgressText();
  return <label>{t.reason}<textarea className={institutionField} name="reason" minLength={3} maxLength={600} rows={2} required /></label>;
}

function StatusSummary({ data }: { data: ProjectProgress }) {
  const { t, workText } = useProgressText();
  return <div className="flex flex-wrap gap-4 text-sm">
    <p><strong>{workText.states[data.status]}</strong>{data.completedOn && <> · {t.completedOn} {data.completedOn}</>}</p>
    <p>{t.milestonesCompleted} <strong>{data.milestoneCount}</strong></p>
    {data.taskCount !== null && <p>{t.tasksCompleted} <strong>{data.taskCount}</strong></p>}
  </div>;
}

function EntryImage({ id, entry, signedIn }: { id: string; entry: string; signedIn: boolean }) {
  const { t } = useProgressText();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let owned = "";
    getProgressImage(id, entry, signedIn, controller.signal).then((blob) => {
      if (!controller.signal.aborted) { owned = URL.createObjectURL(blob); setUrl(owned); setError(null); }
    }).catch((cause) => { if (!controller.signal.aborted) { setUrl(""); setError(cause); } });
    return () => { controller.abort(); if (owned) URL.revokeObjectURL(owned); };
  }, [id, entry, signedIn, attempt]);
  if (error !== null) return <ApiErrorNotice error={error} retry={() => setAttempt((value) => value + 1)} />;
  return url ? <Image src={url} alt={t.image} width={960} height={600} unoptimized
    className="max-h-[32rem] w-full rounded-md object-contain" /> : null;
}

function EntryBody({ projectId, entry, signedIn }: { projectId: string; entry: ProjectProgressEntry; signedIn: boolean }) {
  const { t } = useProgressText();
  const content = entry.content;
  return <>
    <p className="break-words whitespace-pre-line" dir="auto" lang={content.language}>{content.description}</p>
    <p className="break-words whitespace-pre-line text-sm" dir="auto" lang={content.language}>{content.summary}</p>
    {entry.hasImage && <EntryImage key={entry.updatedAt} id={projectId} entry={entry.id} signedIn={signedIn} />}
    {(entry.snapshot?.objectives || content.unfinished || content.challenges || content.lessons || content.nextSteps || content.correction) &&
      <dl className="grid gap-2 break-words">
        {([[t.objectives, entry.snapshot?.objectives], [t.unfinished, content.unfinished], [t.challenges, content.challenges],
          [t.lessons, content.lessons], [t.nextSteps, content.nextSteps], [t.correction, content.correction]] as const)
          .filter(([, body]) => body).map(([label, body]) => <div key={label}><dt className="font-semibold">{label}</dt>
            <dd dir="auto" className="whitespace-pre-line">{body}</dd></div>)}
      </dl>}
    {!!entry.snapshot?.milestones?.length && <div>
      <h4 className="font-semibold">{t.milestonesCompleted}</h4>
      <ul>{entry.snapshot.milestones.map((item, index) => <li key={item.title + index} dir="auto">{item.title}</li>)}</ul>
    </div>}
    {!!entry.snapshot?.metrics?.length && <div>
      <h4 className="font-semibold">{t.selfReported}</h4>
      <ul className="grid gap-2">{entry.snapshot.metrics.map((item) => <li key={item.name} className="break-words" dir="auto">
        <strong>{item.name}</strong> · {t.actual} {item.actual} {item.unit} · {t.target} {item.target} · {item.startsOn} – {item.endsOn}
      </li>)}</ul>
    </div>}
    {!!content.references.length && <ul className="grid gap-1">{content.references.map((reference) =>
      <li key={reference} className="break-all"><a className={institutionLink} href={reference} target="_blank" rel="noreferrer">{reference}</a></li>)}</ul>}
  </>;
}

function MeasureForm({ metric, ...controls }: Controls & { metric?: ProjectMetric }) {
  const { t } = useProgressText();
  return <Change {...controls} section="metrics" action={metric ? "metric_edit" : "metric_create"}
    data={metric ? { id: metric.id, version: metric.version } : undefined}
    read={(form) => ({ name: value(form, "name"), unit: value(form, "unit"), target: Number(value(form, "target")) })}>
    <label>{t.title}<input className={institutionField} name="name" minLength={2} maxLength={80} defaultValue={metric?.name} required /></label>
    <label>{t.unit}<input className={institutionField} name="unit" maxLength={48} defaultValue={metric?.unit} required /></label>
    <label>{t.target}<input className={institutionField} name="target" type="number" min={0} max={100000000} step=".01"
      defaultValue={metric?.target} required /></label>
  </Change>;
}

function Metrics({ data, ...controls }: Controls & { data: ProjectProgress }) {
  const { t } = useProgressText();
  const editable = data.canManage && data.status === "active";
  return <section className="grid gap-3">
    <h3 className="font-semibold">{t.selfReported}</h3>
    {editable && <details><summary className={institutionLink}>{t.actions.metric_create}</summary><MeasureForm {...controls} /></details>}
    {!data.metrics.length && <p>{t.empty}</p>}
    <ul className="grid gap-3 lg:grid-cols-2">{data.metrics.map((metric) => <li key={metric.id} className="min-w-0 grid gap-2 rounded-md border border-[var(--theme-border)] p-3">
      <h4 className="font-semibold break-words">{metric.name}</h4>
      <p>{t.target} {metric.target} {metric.unit}</p>
      {metric.observations.map((item) => <div className="break-words border-t border-[var(--theme-border)] pt-2" key={item.id}>
        <p><strong>{t.actual} {item.actual} {metric.unit}</strong> · {item.startsOn} – {item.endsOn}</p>
        {item.explanation && <p className="text-sm whitespace-pre-line">{item.explanation}</p>}
        {item.reference && <a href={item.reference} className={institutionLink + " break-all"} target="_blank" rel="noreferrer">{item.reference}</a>}
      </div>)}
      {editable && !metric.observations.length && <details><summary className={institutionLink}>{t.actions.metric_edit}</summary>
        <MeasureForm {...controls} metric={metric} /></details>}
      {editable && <details><summary className={institutionLink}>{t.actions.metric_observe}</summary>
        <Change {...controls} section="metrics" action="metric_observe" data={{ id: metric.id }} read={(form) => ({
          startsOn: value(form, "startsOn"), endsOn: value(form, "endsOn"), actual: Number(value(form, "actual")),
          explanation: value(form, "explanation"), reference: nullable(form, "reference"),
        })}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label>{t.startsOn}<input className={institutionField} name="startsOn" type="date" required /></label>
            <label>{t.endsOn}<input className={institutionField} name="endsOn" type="date" required /></label>
          </div>
          <label>{t.actual}<input className={institutionField} name="actual" type="number" min={0} max={100000000} step=".01" required /></label>
          <label>{t.explanation}<textarea className={institutionField} name="explanation" minLength={3} maxLength={800} required rows={3} /></label>
          <label>{t.reference}<input className={institutionField} name="reference" type="url" maxLength={300} /></label>
        </Change>
      </details>}
    </li>)}</ul>
  </section>;
}

function EntryForm({ kind, data, entry, parent, ...controls }: Controls & {
  kind: (typeof projectProgressKinds)[number]; data: ProjectProgress; entry?: ProjectProgressEntry; parent?: ProjectProgressEntry;
}) {
  const { t, locale } = useProgressText();
  const initial = entry?.content ?? parent?.content;
  const [visibility, setVisibility] = useState(parent?.visibility ?? "team");
  return <Change {...controls} section="entries" action={entry ? "entry_edit" : "entry_create"}
    data={entry ? { id: entry.id, version: entry.version } : { kind, supersedesId: parent?.id ?? null }}
    read={(form) => ({
      ...(!entry ? { visibility, milestoneId: nullable(form, "milestoneId") } : {}),
      content: {
        title: value(form, "title"), description: value(form, "description"), summary: value(form, "summary"),
        language: value(form, "language") as ProjectProgressContent["language"],
        references: value(form, "references").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        includeMetrics: form.has("includeMetrics"),
        ...(kind === "report" ? { unfinished: value(form, "unfinished"), challenges: value(form, "challenges"), lessons: value(form, "lessons"),
          ...(value(form, "nextSteps") && { nextSteps: value(form, "nextSteps") }) } : {}),
        ...((parent || entry?.supersedesId) ? { correction: value(form, "correction") } : {}),
      } satisfies ProjectProgressContent,
    })}>
    <p className="text-sm">{t.privacy}</p>
    {!entry && !parent && kind !== "evidence" && <label>{t.visibility}
      <select className={institutionField} value={visibility} onChange={(event) => setVisibility(event.target.value === "public" ? "public" : "team")}>
        <option value="team">{t.teamOnly}</option><option value="public">{t.publicOnly}</option>
      </select></label>}
    {!entry && kind !== "report" && <label>{t.milestones}<select className={institutionField} name="milestoneId" key={visibility} defaultValue={parent?.milestoneId ?? ""}>
      <option value="">{t.none}</option>{data.milestones.filter((m) => m.status !== "cancelled" &&
        (visibility === "team" || (m.status === "completed" && m.publicRequested))).map((milestone) =>
          <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
    </select></label>}
    <label>{t.title}<input className={institutionField} name="title" minLength={3} maxLength={120} defaultValue={initial?.title} required /></label>
    <label>{t.description}<textarea className={institutionField} name="description" minLength={3} maxLength={2400} rows={4}
      defaultValue={initial?.description} required /></label>
    <label>{t.summary}<textarea className={institutionField} name="summary" minLength={3} maxLength={1200} rows={3} defaultValue={initial?.summary} required /></label>
    {kind === "report" && (["unfinished", "challenges", "lessons", "nextSteps"] as const).map((key) => <label key={key}>
      {t[key]}<textarea className={institutionField} name={key} minLength={key === "nextSteps" ? 0 : 3} maxLength={1200}
        rows={2} defaultValue={initial?.[key]} required={key !== "nextSteps"} />
    </label>)}
    {(parent || entry?.supersedesId) && <label>{t.correction}
      <textarea className={institutionField} name="correction" minLength={3} maxLength={600} rows={2} defaultValue={entry?.content.correction} required />
    </label>}
    <label>{t.language}<select className={institutionField} name="language" defaultValue={initial?.language ?? locale}>
      <option value="ht">Kreyòl ayisyen</option><option value="fr">Français</option><option value="en">English</option><option value="es">Español</option>
    </select></label>
    <label>{t.references}<textarea className={institutionField} name="references" maxLength={905} rows={3}
      defaultValue={initial?.references.join("\n")} /></label>
    {kind !== "evidence" && <label><input type="checkbox" name="includeMetrics" defaultChecked={initial?.includeMetrics} /> {t.includeMetrics}</label>}
  </Change>;
}

function ImageForm({ id, entry, refresh }: Controls & { entry: ProjectProgressEntry }) {
  const { t } = useProgressText();
  const mutation = useFeedMutation();
  return <form className="grid gap-2" onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const image = new FormData(form).get("image");
    if (image instanceof File && image.size > 0 && entry.version !== null) {
      const version = entry.version;
      void mutation.run(async () => { await putProgressImage(id, entry.id, version, image); form.reset(); refresh(); });
    }
  }}>
    <label>{t.image}<input className={institutionField} name="image" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
    <button className={institutionAction} disabled={mutation.busy}>{t.actions.entry_image}</button>
  </form>;
}

function Entries({ data, reports, ...controls }: Controls & { data: ProjectProgress; reports: boolean }) {
  const { t } = useProgressText();
  const current = data.entries.filter((entry) => (entry.kind === "report") === reports);
  const allowedTime = reports ? !!data.completedOn && (data.status === "completed" || data.status === "archived") : data.status === "active";
  const authoring = allowedTime && (reports ? data.role === "owner" : !!data.role);
  const kinds = reports ? ["report"] as const : ["update", "evidence"] as const;
  return <section className="grid gap-3">
    <h3 className="font-semibold">{reports ? t.kinds.report : t.updates}</h3>
    {reports && !data.completedOn && <p className="text-sm">{t.errors.reportUnavailable}</p>}
    {authoring && kinds.map((kind) => <details key={kind}><summary className={institutionLink}>{t.createKinds[kind]}</summary>
      <EntryForm {...controls} data={data} kind={kind} /></details>)}
    {!current.length && <p>{t.empty}</p>}
    {current.map((entry) => {
      const key = { id: entry.id, version: entry.version };
      const draft = entry.state === "draft" || entry.state === "returned";
      return <article key={entry.id} className="grid min-w-0 gap-2 border-t border-[var(--theme-border)] pt-3" id={"progress-" + entry.id}>
        <p className="text-sm">{t.kinds[entry.kind]} · {t.entryStates[entry.state]} · {entry.visibility === "public" ? t.publicOnly : t.teamOnly}
          {entry.reviewed && <> · {t.internalReview}</>}{entry.superseded && <> · {t.previousVersion}</>}</p>
        <h4 className="break-words font-semibold" dir="auto">{entry.content.title}</h4>
        <EntryBody projectId={controls.id} entry={entry} signedIn />
        {authoring && entry.mine && draft && <>
          <details><summary className={institutionLink}>{t.actions.entry_edit}</summary>
            <EntryForm {...controls} data={data} kind={entry.kind} entry={entry} /></details>
          <details><summary className={institutionLink}>{t.actions.entry_image}</summary><ImageForm {...controls} entry={entry} /></details>
          {entry.hasImage && <Change {...controls} section="entries" action="entry_remove_image" data={key} />}
          <div className={actionRow}><Change {...controls} section="entries" action="entry_submit" data={key} /></div>
        </>}
        {allowedTime && entry.canReview && (["entry_approve", "entry_return", "entry_reject"] as const).map((action) =>
          <details key={action}><summary className={institutionLink}>{t.actions[action]}</summary>
            <Change {...controls} section="entries" action={action} data={key} read={(form) => ({ reason: value(form, "reason") })}><Reason /></Change>
          </details>)}
        {entry.state !== "withdrawn" && (data.canManage || (entry.mine && entry.state !== "approved")) &&
          <details><summary className={institutionLink}>{t.actions.entry_withdraw}</summary>
            <Change {...controls} section="entries" action="entry_withdraw" data={key} read={(form) => ({ reason: value(form, "reason") })}><Reason /></Change>
          </details>}
        {authoring && !entry.superseded && (entry.state === "approved" || (entry.state === "withdrawn" && entry.approvedAt)) &&
          (entry.mine || data.canManage) &&
          <details><summary className={institutionLink}>{t.addCorrection}</summary>
            <EntryForm {...controls} data={data} kind={entry.kind} parent={entry} /></details>}
      </article>;
    })}
  </section>;
}

export function PublicProjectProgress({ id, signedIn }: { id: string; signedIn: boolean }) {
  const { t, locale } = useProgressText();
  const loader = useCallback((signal: AbortSignal) => loadProgress(id, false, signedIn, signal), [id, signedIn]);
  const resource = useInstitutionResource(loader);
  if (resource.error !== null && apiErrorCode(resource.error) !== "PROJECT_UNAVAILABLE") {
    return <ApiErrorNotice error={resource.error} retry={resource.refresh} />;
  }
  const data = resource.data;
  if (!data) return null;
  return <section className={institutionCard + " grid gap-4"}>
    <h2 className="text-2xl font-semibold">{t.progress}</h2>
    <StatusSummary data={data} />
    {data.status === "archived" && !data.completedOn && <p>{t.archivedUnfinished}</p>}
    {!!data.milestones.length && <ul className="grid gap-2">{data.milestones.map((milestone) => <li key={milestone.id} className="break-words">
      <h3 className="font-semibold" dir="auto">{milestone.title}</h3>
      <p className="text-sm" dir="auto">{milestone.description}</p>
    </li>)}</ul>}
    {data.entries.map((entry) => <article key={entry.id} className="grid gap-2 border-t border-[var(--theme-border)] pt-3" id={"progress-" + entry.id}>
      <p className="text-sm">{t.kinds[entry.kind]} · {entry.superseded ? t.previousVersion : t.internalReview}
        {entry.approvedAt && <> · <time dateTime={entry.approvedAt}>{new Date(entry.approvedAt).toLocaleDateString(locale)}</time></>}</p>
      <h3 className="break-words font-semibold" dir="auto">{entry.content.title}</h3>
      {entry.supersedesId && <a className={institutionLink} href={"#progress-" + entry.supersedesId}>{t.previousVersion}</a>}
      <EntryBody projectId={id} entry={entry} signedIn={signedIn} />
    </article>)}
  </section>;
}

export function ProjectProgressWork({ work, tab, refreshWork }: { work: ProjectWork; tab: ProgressTab; refreshWork: () => void }) {
  const { t, locale } = useProgressText();
  const id = work.projectId;
  const loader = useCallback((signal: AbortSignal) => loadProgress(id, true, true, signal), [id]);
  const resource = useInstitutionResource(loader);
  const data = resource.data;
  const refresh = () => { resource.refresh(); refreshWork(); };
  const controls = { id, refresh };
  return <section className={institutionCard + " grid gap-4"}>
    <h2 className="text-xl font-semibold">{t[tab]}</h2>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={refresh} signIn />}
    {!data && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
    {data && <>
      {tab === "progress" && <>
        <StatusSummary data={data} />
        {data.status === "archived" && !data.completedOn && <p>{t.archivedUnfinished}</p>}
        <h3 className="font-semibold">{t.history}</h3>
        {!data.history.length && <p>{t.empty}</p>}
        <ol className="grid gap-2">{data.history.map((event) => <li className="break-words" key={event.id}>
          <p>{t.actions[event.action]} · <time dateTime={event.at}>{new Date(event.at).toLocaleString(locale)}</time></p>
          {event.reason && <p dir="auto">{event.reason}</p>}
        </li>)}</ol>
      </>}
      {tab === "milestones" && <Milestones {...controls} data={data} work={work} />}
      {tab === "updates" && <Entries {...controls} data={data} reports={false} />}
      {tab === "outcomes" && <>
        <Metrics {...controls} data={data} />
        <Entries {...controls} data={data} reports />
      </>}
    </>}
  </section>;
}

function MilestoneForm({ milestone, work, ...controls }: Controls & { milestone?: ProjectMilestone; work: ProjectWork }) {
  const { t } = useProgressText();
  return <Change {...controls} section="milestones" action={milestone ? "milestone_edit" : "milestone_create"}
    data={milestone ? { id: milestone.id, version: milestone.version } : undefined}
    read={(form) => ({ title: value(form, "title"), description: value(form, "description"), startsOn: nullable(form, "startsOn"),
      targetOn: nullable(form, "targetOn"), target: nullable(form, "target") === null ? null : Number(value(form, "target")),
      unit: nullable(form, "unit"), displayOrder: Number(value(form, "displayOrder")), responsibleId: nullable(form, "responsibleId"),
      publicRequested: form.has("publicRequested") })}>
    <label>{t.title}<input className={institutionField} name="title" defaultValue={milestone?.title} minLength={3} maxLength={120} required /></label>
    <label>{t.description}<textarea className={institutionField} name="description" defaultValue={milestone?.description}
      minLength={3} maxLength={1500} required rows={3} /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label>{t.startsOn}<input className={institutionField} type="date" name="startsOn" defaultValue={milestone?.startsOn ?? ""} /></label>
      <label>{t.targetOn}<input className={institutionField} type="date" name="targetOn" defaultValue={milestone?.targetOn ?? ""} /></label>
      <label>{t.target}<input className={institutionField} type="number" min={0} max={100000000} step=".01" name="target" defaultValue={milestone?.target ?? ""} /></label>
      <label>{t.unit}<input className={institutionField} name="unit" maxLength={48} defaultValue={milestone?.unit ?? ""} /></label>
      <label>{t.order}<input className={institutionField} type="number" min={0} max={10000} name="displayOrder"
        defaultValue={milestone?.displayOrder ?? 10} required /></label>
      <label>{t.responsible}<select className={institutionField} name="responsibleId" defaultValue={milestone?.responsibleId ?? ""}>
        <option value="">{t.none}</option>
        {work.team.map((member) => !member.mine && member.person && (member.eligible || member.person.id === milestone?.responsibleId) &&
          <option key={member.person.id} value={member.person.id}>{member.person.name || member.person.handle}</option>)}
      </select></label>
    </div>
    <label><input type="checkbox" name="publicRequested" defaultChecked={milestone?.publicRequested} /> {t.publicMilestone}</label>
  </Change>;
}

function Milestones({ data, work, ...controls }: Controls & { data: ProjectProgress; work: ProjectWork }) {
  const { t } = useProgressText();
  const active = data.status === "active";
  const mayLink = data.canManage || data.role === "supervisor";
  return <>
    {data.canManage && active && <details><summary className={institutionLink}>{t.actions.milestone_create}</summary>
      <MilestoneForm {...controls} work={work} />
    </details>}
    {!data.milestones.length && <p>{t.empty}</p>}
    <ul className="grid gap-4 lg:grid-cols-2">{data.milestones.map((milestone) => {
      const editable = active && !["submitted", "completed", "cancelled"].includes(milestone.status);
      const key = { id: milestone.id, version: milestone.version };
      return <li className="min-w-0 rounded-md border border-[var(--theme-border)] p-3" key={milestone.id}>
        <h3 className="break-words font-semibold" dir="auto">{milestone.title}</h3>
        <p className="break-words whitespace-pre-line">{milestone.description}</p>
        <p className="text-sm">{t.milestoneStates[milestone.status]}{milestone.targetOn && <> · {milestone.targetOn}</>}</p>
        {milestone.target !== null && <p>{t.target} {milestone.target} {milestone.unit}</p>}
        {editable && data.canManage && <details className="mt-2"><summary className={institutionLink}>{t.actions.milestone_edit}</summary>
          <MilestoneForm {...controls} work={work} milestone={milestone} /></details>}
        <div className={actionRow + " mt-2"}>
          {editable && (data.canManage || milestone.mine) && <Change {...controls} section="milestones" action="milestone_submit" data={key} />}
          {editable && (data.canManage || (milestone.mine && data.role === "supervisor")) &&
            (["milestone_start", "milestone_block"] as const).map((action) =>
              <Change key={action} {...controls} section="milestones" action={action} data={key} />)}
        </div>
        {active && milestone.canReview && (milestone.canApprove ? ["milestone_approve", "milestone_return"] as const : ["milestone_return"] as const).map((action) =>
          <details key={action} className="mt-2"><summary className={institutionLink}>{t.actions[action]}</summary>
            <Change {...controls} section="milestones" action={action} data={key} read={(fields) => ({ reason: value(fields, "reason") })}><Reason /></Change>
          </details>)}
        {data.canManage && ((active && milestone.status !== "completed" && milestone.status !== "cancelled") ||
          (milestone.publicRequested && milestone.status === "completed")) &&
          <details className="mt-2"><summary className={institutionLink}>{t.actions[milestone.status === "completed" ? "milestone_hide" : "milestone_cancel"]}</summary>
            <Change {...controls} section="milestones" action={milestone.status === "completed" ? "milestone_hide" : "milestone_cancel"}
              data={key} read={(fields) => ({ reason: value(fields, "reason") })}><Reason /></Change>
          </details>}
      </li>;
    })}</ul>
    {active && mayLink && work.tasks.length > 0 && <section className="grid gap-2">
      <h3 className="font-semibold">{t.actions.task_milestone}</h3>
      {work.tasks.filter((task) => data.canManage || task.canCoordinate).map((task) => <details key={task.id}>
        <summary className={institutionLink}>{task.title}</summary>
        <Change {...controls} section="milestones" action="task_milestone" data={{ id: task.id, version: task.version }}
          read={(form) => ({ milestoneId: nullable(form, "milestoneId") })}>
          <label>{t.milestones}<select className={institutionField} name="milestoneId" defaultValue={task.milestoneId ?? ""}>
            <option value="">{t.none}</option>
            {data.milestones.filter((row) => row.status !== "cancelled").map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
          </select></label>
        </Change>
      </details>)}
    </section>}
  </>;
}
