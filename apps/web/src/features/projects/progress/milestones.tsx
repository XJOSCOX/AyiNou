import { type Controls, useProgressText, Change, value, nullable, actionRow, Reason } from "./progress-controls";
import { institutionField, institutionLink } from "@/components/institution-ui";
import { type ProjectMilestone, type ProjectWork, type ProjectProgress } from "@ayinou/shared";

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

export function Milestones({ data, work, ...controls }: Controls & { data: ProjectProgress; work: ProjectWork }) {
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
