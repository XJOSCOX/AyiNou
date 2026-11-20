import { EntryBody } from "./entry-content";
import { type Controls, useProgressText, Change, nullable, value, actionRow, Reason } from "./progress-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, institutionAction, institutionLink } from "@/components/institution-ui";
import { useFeedMutation } from "@/lib/feed-state";
import { putProgressImage } from "@/lib/project-progress-api";
import { projectProgressKinds, type ProjectProgress, type ProjectProgressEntry, type ProjectProgressContent } from "@ayinou/shared";
import { useState } from "react";

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

export function Entries({ data, reports, ...controls }: Controls & { data: ProjectProgress; reports: boolean }) {
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
