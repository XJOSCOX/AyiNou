"use client";

import Link from "next/link";
import { pollMessages } from "@/lib/poll-i18n";
import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  projectTaskPriorities, projectTeamRoles, type ProjectOperationEvent, type ProjectWork, type ProjectWorkTask,
} from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { loadProjectWork, loadProjectWorkIndex, runProjectWork, type WorkInput } from "@/lib/project-work-api";
import { projectWorkMessages } from "@/lib/project-work-i18n";
import { projectProgressMessages } from "@/lib/project-progress-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { ProjectIdentityNotice } from "./project-form";
import { progressTabs, ProjectProgressWork, type ProgressTab } from "./project-progress";

const sections = ["overview", "team", "volunteers", "tasks", ...progressTabs, "management", "activity"] as const;
const isProgressTab = (section: string): section is ProgressTab => progressTabs.some((tab) => tab === section);
const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const statusOptions = {
  approved: ["active"], active: ["paused", "completed"], paused: ["active", "completed", "archived"], completed: ["archived"], archived: [],
} as const;
const actionsClass = "flex flex-wrap items-start gap-3";
type WorkProps = { work: ProjectWork; refresh: () => void };

function useWorkMessages() {
  const [locale] = useLocale();
  return { locale, t: projectWorkMessages[locale] };
}

export function ProjectWorkIndexScreen() {
  const { t, locale } = useWorkMessages();
  const resource = useInstitutionResource(loadProjectWorkIndex);
  return <MemberShell><div className="grid gap-4">
    <PageHeader title={t.workspace} />
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!resource.data && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
    {resource.data && <>
      <section className={institutionCard}>
        <h2 className="text-xl font-semibold">{t.myWork}</h2>
        <ul className="mt-2 grid gap-2">{resource.data.work.map((item) => <li key={item.id}>
          <Link href={"/projects/" + item.id + "/work"} className={institutionLink}>{item.title}</Link> · {t.states[item.status]}
        </li>)}</ul>
        {!resource.data.work.length && <p>{t.empty}</p>}
      </section>
      <section className={institutionCard}>
        <h2 className="text-xl font-semibold">{t.volunteers}</h2>
        <ul className="mt-2 grid gap-2">{resource.data.opportunities.map((item) => <li key={item.id}>
          <Link href={"/projects/" + item.projectId + "/work?section=volunteers"} className={institutionLink}>{item.title}</Link>
          {item.remote && <> · {t.remote}</>}
        </li>)}</ul>
        {!resource.data.opportunities.length && <p>{t.empty}</p>}
      </section>
    </>}
  </div></MemberShell>;
}

export function ProjectWorkScreen({ projectId, initialSection }: { projectId: string; initialSection?: string }) {
  const { t, locale } = useWorkMessages();
  const loader = useCallback((signal: AbortSignal) => loadProjectWork(projectId, signal), [projectId]);
  const resource = useInstitutionResource(loader);
  const [section, setSection] = useState<(typeof sections)[number]>(sections.find((item) => item === initialSection) ?? "overview");
  const work = resource.data;
  const progressText = projectProgressMessages[locale];
  const hasProgress = work?.status !== "approved" && work?.role && work.role !== "delegate";
  const props = work ? { work, refresh: resource.refresh } : null;
  return <MemberShell><div className="grid gap-4">
    <PageHeader title={work?.title ?? t.workspace} actions={<>
      <Link href={"/projects/" + projectId} className={institutionLink}>{t.proposal}</Link>
      <Link href="/projects/team" className={institutionLink}>{t.workspace}</Link>
      {work?.role && <Link href={"/polls?scope=project&scopeId=" + projectId} className={institutionLink}>{pollMessages[locale].title}</Link>}
    </>} />
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!work && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
    {work && props && <>
      <nav aria-label={t.workspace} className="flex flex-wrap gap-2">
        {sections.filter((item) => isProgressTab(item) ? hasProgress : work.role || item === "overview" || item === "volunteers" ||
          (item === "team" && work.invites.length > 0)).map((item) => <button type="button" aria-pressed={section === item}
          className="rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold aria-pressed:bg-[var(--theme-selected)]"
          key={item} onClick={() => setSection(item)}>{isProgressTab(item) ? progressText[item] : t[item]}</button>)}
      </nav>
      {section === "overview" && <section className={institutionCard}>
        <h2 className="text-xl font-semibold">{t.overview}</h2>
        <p className="mt-2">{t.states[work.status]}{work.role && <> · {t.roles[work.role]}</>}</p>
        {!!work.invites.some((item) => item.mine) && <button type="button" className={institutionLink} onClick={() => setSection("team")}>{t.pendingInvites}</button>}
        {work.status === "approved" && (work.role === "owner" || work.role === "delegate") &&
          <button type="button" className={institutionLink} onClick={() => setSection("management")}>{t.management}</button>}
      </section>}
      {section === "team" && <Team {...props} />}
      {section === "volunteers" && <Volunteers {...props} />}
      {section === "tasks" && <Tasks {...props} />}
      {section === "management" && <Management {...props} />}
      {hasProgress && isProgressTab(section) && <ProjectProgressWork work={work} tab={section} refreshWork={resource.refresh} />}
      {section === "activity" && <section className={institutionCard}>
        <h2 className="text-xl font-semibold">{t.activity}</h2>
        {!work.activity.length && <p>{t.empty}</p>}
        <ol className="mt-3 grid gap-3">{work.activity.map((event) => <li key={event.id} className="break-words border-t border-[var(--theme-border)] pt-3">
          <p>{Object.hasOwn(progressText.actions, event.action) ? progressText.actions[event.action as keyof typeof progressText.actions]
            : t.events[event.action as keyof typeof t.events]} · <time dateTime={event.date}>{new Date(event.date).toLocaleString(locale)}</time></p>
          {event.detail && <p dir="auto" className="whitespace-pre-line text-sm">{event.action === "execution_status" ?
            t.states[event.detail as ProjectWork["status"]] : event.detail}</p>}
        </li>)}</ol>
      </section>}
    </>}
  </div></MemberShell>;
}

function Operation({ work, refresh, action, input, children, label, fields }: WorkProps & {
  action: ProjectOperationEvent; input?: WorkInput; children?: ReactNode; label?: string; fields?: (data: FormData) => WorkInput;
}) {
  const { t, locale } = useWorkMessages();
  const mutation = useFeedMutation();
  const idempotency = useRef<string | null>(null);
  return <form className="grid min-w-0 gap-2" onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = { ...input, ...fields?.(new FormData(form)) };
    if (action === "invite") data.key = idempotency.current ??= crypto.randomUUID();
    void mutation.run(async () => {
      await runProjectWork(work.projectId, action, data);
      if (action === "invite") idempotency.current = null;
      form.reset();
      refresh();
    });
  }}>
    {children}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
    {apiErrorCode(mutation.error) === "MFA_REQUIRED" &&
      <Link className={institutionLink} href={"/mfa?next=/projects/" + work.projectId + "/work"}>{t.authenticator}</Link>}
    <button className={institutionAction} disabled={mutation.busy}>{mutation.busy ? authMessages[locale].working : label ?? t.events[action]}</button>
  </form>;
}

function Team(props: WorkProps) {
  const { work } = props;
  const { t, locale } = useWorkMessages();
  const ownerScope = work.role === "owner" || work.role === "delegate";
  const canManage = ownerScope || work.role === "manager";
  const active = work.status === "active";
  const canRevoke = active || work.status === "paused";
  const roles = ownerScope ? projectTeamRoles : ["contributor", "volunteer"] as const;
  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.team}</h2>
    {canManage && active && <details className="mt-3">
      <summary className={institutionLink}>{t.events.invite}</summary>
      <Operation {...props} action="invite" fields={(data) => ({ handle: field(data, "handle").toLowerCase(), role: field(data, "role") })}>
        <label>{t.username}<input className={institutionField} name="handle" required maxLength={24} autoCapitalize="none" /></label>
        <label>{t.role}<select className={institutionField} name="role">{roles.map((role) => <option key={role} value={role}>{t.roles[role]}</option>)}</select></label>
      </Operation>
    </details>}
    {!work.invites.length && !work.team.length && <p className="mt-2">{t.empty}</p>}
    <ul className="mt-3 grid gap-3">{work.invites.map((item) => <li className="border-t border-[var(--theme-border)] pt-3" key={item.id}>
      <p>{t.roles[item.role]}{item.recipient?.name && <> · {item.recipient.name}</>} · {new Date(item.expiresAt).toLocaleDateString(locale)}</p>
      <div className={actionsClass}>
        {item.mine && active && <Operation {...props} action="invite_accept" input={{ id: item.id }} />}
        {item.mine && canRevoke && <Operation {...props} action="invite_decline" input={{ id: item.id }} />}
        {!item.mine && canManage && canRevoke && <Operation {...props} action="invite_revoke" input={{ id: item.id }} />}
      </div>
    </li>)}</ul>
    <ul className="mt-3 grid gap-3">{work.team.map((item) => item.person && <li className="border-t border-[var(--theme-border)] pt-3" key={item.person.id}>
      <p className="break-words">{item.person.name || item.person.handle || t.member} · {t.roles[item.role]}{!item.eligible && <> · {t.inactiveMember}</>}</p>
      {!item.mine && canRevoke && canManage && (ownerScope || item.role === "contributor" || item.role === "volunteer") &&
        <Operation {...props} action="member_revoke" input={{ userId: item.person.id }} />}
    </li>)}</ul>
  </section>;
}

function Management(props: WorkProps) {
  const { work } = props;
  const { t } = useWorkMessages();
  const options = statusOptions[work.status];
  const ownerScope = work.role === "owner" || work.role === "delegate";
  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.management}</h2>
    <p className="mt-2">{t.states[work.status]}</p>
    {ownerScope && work.identity !== "verified" && <ProjectIdentityNotice state={work.identity} />}
    {ownerScope && options.length > 0 && <Operation {...props} action="execution_status" input={{ version: work.version }}
      fields={(data) => ({ status: field(data, "status") })}>
      <label>{t.nextStatus}<select className={institutionField} name="status">{options.map((status) =>
        <option key={status} value={status}>{t.states[status]}</option>)}</select></label>
    </Operation>}
  </section>;
}

function ReasonField() {
  const { t } = useWorkMessages();
  return <label>{t.reason}<textarea className={institutionField} name="reason" rows={2} minLength={3} maxLength={500} required /></label>;
}

function Volunteers(props: WorkProps) {
  const { work } = props;
  const { t } = useWorkMessages();
  const manager = work.role === "owner" || work.role === "manager";
  const active = work.status === "active";
  return <div className="grid gap-4">
    <section className={institutionCard}>
      <h2 className="text-xl font-semibold">{t.volunteers}</h2>
      <p className="mt-2 text-sm">{t.volunteerHelp}</p>
      {manager && active && <details className="mt-3"><summary className={institutionLink}>{t.events.opportunity_publish}</summary>
        <Operation {...props} action="opportunity_publish" fields={(data) => ({
          title: field(data, "title"), description: field(data, "description"), skills: field(data, "skills"),
          commitment: field(data, "commitment"), capacity: Number(field(data, "capacity")), closesOn: field(data, "closesOn") || null,
          remote: data.has("remote"),
        })}>
          <label>{t.title}<input className={institutionField} name="title" minLength={3} maxLength={120} required /></label>
          <label>{t.description}<textarea className={institutionField} name="description" minLength={10} maxLength={2000} rows={3} required /></label>
          <label>{t.skills}<input className={institutionField} name="skills" maxLength={300} required /></label>
          <label>{t.commitment}<input className={institutionField} name="commitment" maxLength={180} required /></label>
          <label>{t.capacity}<input className={institutionField} name="capacity" type="number" min={1} max={100} defaultValue={1} required /></label>
          <label>{t.closesOn}<input className={institutionField} name="closesOn" type="date" /></label>
          <label><input type="checkbox" name="remote" /> {t.remote}</label>
        </Operation>
      </details>}
      {!work.opportunities.length && <p className="mt-3">{t.empty}</p>}
      <ul className="mt-3 grid gap-3">{work.opportunities.map((item) => <li className="grid gap-2 border-t border-[var(--theme-border)] pt-3" key={item.id}>
        <h3 className="break-words font-semibold">{item.title}</h3>
        <p className="whitespace-pre-line break-words" dir="auto">{item.description}</p>
        <dl className="grid gap-1 break-words text-sm">
          <div><dt className="inline font-semibold">{t.skills} · </dt><dd className="inline">{item.skills}</dd></div>
          <div><dt className="inline font-semibold">{t.commitment} · </dt><dd className="inline">{item.commitment}</dd></div>
          <div><dt className="inline font-semibold">{t.capacity} · </dt><dd className="inline">{item.capacity}</dd></div>
          {item.closesOn && <div><dt className="inline font-semibold">{t.closesOn} · </dt><dd className="inline">{item.closesOn}</dd></div>}
        </dl>
        <p className="text-sm">{item.remote ? t.remote : t.projectRegion}</p>
        <div className={actionsClass}>
          {item.open && work.canApply && !work.applications.some((row) => row.mine && row.opportunityId === item.id) &&
            <Operation {...props} action="volunteer_apply" input={{ id: item.id }} />}
          {item.open && manager && <Operation {...props} action="opportunity_close" input={{ id: item.id }} />}
        </div>
      </li>)}</ul>
    </section>
    <section className={institutionCard}>
      <h2 className="text-xl font-semibold">{t.applications}</h2>
      {!work.applications.length && <p>{t.empty}</p>}
      <ul className="mt-3 grid gap-3">{work.applications.map((item) => <li className="grid gap-2 border-t border-[var(--theme-border)] pt-3" key={item.id}>
        <p className="break-words font-semibold">{item.title} · {t.applicationStates[item.status]}{item.applicant?.name && <> · {item.applicant.name}</>}</p>
        {item.feedback && <p className="break-words" dir="auto">{item.feedback}</p>}
        <div className={actionsClass}>
          {item.mine && item.status === "offered" && active && <Operation {...props} action="volunteer_confirm" input={{ id: item.id }} />}
          {item.mine && (active || work.status === "paused") && ["pending", "offered", "accepted"].includes(item.status) &&
            <Operation {...props} action="volunteer_withdraw" input={{ id: item.id }} />}
          {!item.mine && manager && active && item.status === "pending" && (["volunteer_offer", "volunteer_reject"] as const).map((action) =>
            <details key={action} className="w-full"><summary className={institutionLink}>{t.events[action]}</summary>
              <Operation {...props} action={action} input={{ id: item.id }} fields={(data) => ({ reason: field(data, "reason") })}><ReasonField /></Operation>
            </details>)}
        </div>
      </li>)}</ul>
    </section>
  </div>;
}

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

function Tasks(props: WorkProps) {
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
