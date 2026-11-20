import { Management } from "./management";
import { Tasks } from "./tasks";
import { Team } from "./team";
import { Volunteers } from "./volunteers";
import { useWorkMessages } from "./work-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { useInstitutionResource, institutionLink, institutionCard } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { PageHeader } from "@/components/page-header";
import { progressTabs, type ProgressTab, ProjectProgressWork } from "@/components/project-progress";
import { authMessages } from "@/lib/auth-i18n";
import { pollMessages } from "@/lib/poll-i18n";
import { projectProgressMessages } from "@/lib/project-progress-i18n";
import { loadProjectWork } from "@/lib/project-work-api";
import { type ProjectWork } from "@ayinou/shared";
import Link from "next/link";
import { useCallback, useState } from "react";

const sections = ["overview", "team", "volunteers", "tasks", ...progressTabs, "management", "activity"] as const;

const isProgressTab = (section: string): section is ProgressTab => progressTabs.some((tab) => tab === section);

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
