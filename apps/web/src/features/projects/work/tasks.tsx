import { type WorkProps, useWorkMessages, Operation, field, actionsClass, ReasonField } from "./work-controls";
import { institutionField, institutionCard, institutionLink } from "@/components/institution-ui";
import { type ProjectWorkTask, projectTaskPriorities } from "@ayinou/shared";

function TaskForm({ task, ...props }: WorkProps & { task?: ProjectWorkTask }) {
  const { t } = useWorkMessages();
  return <Operation {...props} action={task ? "task_edit" : "task_create"} input={task ? { id: task.id, version: task.version } : undefined}
    fields={(data) => ({ title: field(data, "title"), description: field(data, "description"), priority: field(data, "priority"),
      dueOn: field(data, "dueOn") || null, sensitive: data.has("sensitive") })}>
    <label>{t.title}<input className={institutionField} name="title" minLength={3} maxLength={120} defaultValue={task?.title} required /></label>
    <label>{t.description}<textarea className={institutionField} name="description" minLength={3} maxLength={2000} rows={3} defaultValue={task?.description} required /></label>
    <label>{t.priority}<select className={institutionField} name="priority" defaultValue={task?.priority ?? "normal"}>
      {projectTaskPriorities.map((priority) => <option key={priority} value={priority}>{t.priorities[priority]}</option>)}
    </select></label>
    <label>{t.dueOn}<input className={institutionField} name="dueOn" type="date" defaultValue={task?.dueOn ?? ""} /></label>
    <label><input type="checkbox" name="sensitive" defaultChecked={task?.sensitive} /> {t.sensitive}</label>
  </Operation>;
}

export function Tasks(props: WorkProps) {
  const { work } = props;
  const { t } = useWorkMessages();
  const supervisor = work.role === "owner" || work.role === "manager" || work.role === "supervisor";
  const active = work.status === "active";
  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.tasks}</h2>
    {supervisor && active && <details className="mt-3"><summary className={institutionLink}>{t.events.task_create}</summary><TaskForm {...props} /></details>}
    {!work.tasks.length && <p className="mt-3">{t.empty}</p>}
    <ul className="mt-3 grid gap-4 lg:grid-cols-2">{work.tasks.map((task) => {
      const input = { id: task.id, version: task.version };
      const open = ["todo", "in_progress", "blocked"].includes(task.status);
      const ownActions = !task.accepted ? ["task_accept", "task_decline"] as const : ["task_progress", "task_block", "task_submit"] as const;
      return <li className="grid min-w-0 gap-2 rounded-md border border-[var(--theme-border)] p-3" key={task.id}>
        <h3 className="break-words font-semibold">{task.title}</h3>
        <p className="whitespace-pre-line break-words" dir="auto">{task.description}</p>
        <p className="text-sm">{t.taskStates[task.status]} · {t.priorities[task.priority]}{task.dueOn && <> · {task.dueOn}</>}</p>
        {task.assignee?.name && <p className="break-words text-sm">{task.assignee.name}</p>}
        {task.assigned && !task.accepted && <p className="text-sm">{t.awaitingConsent}</p>}
        {active && task.mine && open && <div className={actionsClass}>{ownActions.map((action) =>
          <Operation key={action} {...props} action={action} input={input} />)}</div>}
        {active && supervisor && !task.mine && open && <>
          {!task.assigned && task.status !== "in_progress" && <details><summary className={institutionLink}>{t.events.task_edit}</summary><TaskForm {...props} task={task} /></details>}
          <details><summary className={institutionLink}>{t.events.task_assign}</summary>
            <Operation {...props} action="task_assign" input={input} fields={(data) => ({ userId: field(data, "userId") || null })}>
              <label>{t.member}<select className={institutionField} name="userId" defaultValue={task.assignee?.id ?? ""}>
                <option value="">{t.unassigned}</option>
                {work.team.map((item) => item.eligible && !item.mine && item.person && <option key={item.person.id} value={item.person.id}>
                  {item.person.name || item.person.handle || t.member}</option>)}
              </select></label>
            </Operation>
          </details>
        </>}
        {active && supervisor && !task.mine && !["completed", "cancelled"].includes(task.status) &&
          (task.status === "submitted" ? ["task_approve", "task_return", "task_cancel"] as const : ["task_cancel"] as const).map((action) =>
            <details key={action}><summary className={institutionLink}>{t.events[action]}</summary>
              <Operation {...props} action={action} input={input} fields={(data) => ({ reason: field(data, "reason") })}><ReasonField /></Operation>
            </details>)}
      </li>;
    })}</ul>
  </section>;
}
