import { Management } from "./management";
import { Tasks } from "./tasks";
import { Team } from "./team";
import { Volunteers } from "./volunteers";
import { useWorkMessages } from "./work-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, useInstitutionResource } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { ProjectLoading, ProjectSection, ProjectStatusBadge, ProjectsHeader, projectLink } from "@/components/project-ui";
import { progressTabs, type ProgressTab, ProjectProgressWork } from "@/components/project-progress";
import { pollMessages } from "@/lib/poll-i18n";
import { projectProgressMessages } from "@/lib/project-progress-i18n";
import { loadProjectWork } from "@/lib/project-work-api";
import { type ProjectWork } from "@ayinou/shared";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

const sections = ["overview", "team", "volunteers", "tasks", ...progressTabs, "management", "activity"] as const;

const isProgressTab = (section: string): section is ProgressTab => progressTabs.some((tab) => tab === section);

export function ProjectWorkScreen({ projectId, initialSection }: { projectId: string; initialSection?: string }) {
  const { t, locale } = useWorkMessages();
  const loader = useCallback((signal: AbortSignal) => loadProjectWork(projectId, signal), [projectId]);
  const resource = useInstitutionResource(loader);
  const search = useSearchParams();
  const currentSection = search ? search.get("section") : initialSection;
  const work = resource.data;
  const progressText = projectProgressMessages[locale];
  const hasProgress = work?.status !== "approved" && work?.role && work.role !== "delegate";
  const availableSections = sections.filter((item) => isProgressTab(item) ? hasProgress
    : work?.role || item === "overview" || item === "volunteers" || (item === "team" && work?.invites.length));
  const section = availableSections.find((item) => item === currentSection) ?? "overview";
  const props = work ? { work, refresh: resource.refresh } : null;
  const canStart = work?.status === "approved" && (work.role === "owner" || work.role === "delegate");

  function setSection(next: (typeof sections)[number]) {
    if (next === section) return;
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("section");
    else url.searchParams.set("section", next);
    window.history.pushState(null, "", url);
  }
  return <MemberShell><div className="grid min-w-0 gap-4">
    <ProjectsHeader title={work?.title ?? t.workspace} description={t.workDetailHelp} current="work" backHref={"/projects/" + projectId}
      meta={work && <>
        <ProjectStatusBadge status={work.status === "approved" ? "approved" : undefined}>{t.states[work.status]}</ProjectStatusBadge>
        {work.role && <span>{t.roles[work.role]}</span>}
      </>}
      actions={<>
        <Link href={"/projects/" + projectId} className={projectLink}>{t.proposal}</Link>
        {work?.role && <Link href={"/polls?scope=project&scopeId=" + projectId} className={projectLink}>{pollMessages[locale].title}</Link>}
      </>}>
      {work && <div role="group" aria-label={t.workspace} className="flex min-w-0 flex-wrap gap-1 border-t border-[var(--theme-border)] px-2 py-2 sm:px-3">
        {availableSections.map((item) => <button type="button" aria-pressed={section === item}
          className="min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-body)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 aria-pressed:bg-[var(--theme-selected)] aria-pressed:text-[var(--theme-link)]"
          key={item} onClick={() => setSection(item)}>{isProgressTab(item) ? progressText[item] : t[item]}</button>)}
      </div>}
    </ProjectsHeader>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!work && resource.error === null && <ProjectLoading />}
    {work && props && <>
      {section === "overview" && <ProjectSection title={t.overview}>
        {canStart ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[var(--theme-control)] p-4 sm:p-5">
          <div className="min-w-0 flex-[1_1_18rem]">
            <h3 className="font-semibold">{t.workStartTitle}</h3>
            <p className="mt-1 max-w-[65ch] text-sm text-[var(--theme-body)]">{t.workStartHelp}</p>
          </div>
          <button type="button" className={institutionAction} onClick={() => setSection("management")}>{t.openManagement}</button>
        </div> : work.status === "approved" ? <p className="text-sm text-[var(--theme-body)]">{t.waitingForStart}</p>
          : <dl className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]">
            {(work.role ? [
              { label: t.team, count: work.team.length },
              { label: t.tasks, count: work.tasks.length },
            ] : []).concat({ label: t.volunteers, count: work.opportunities.filter((item) => item.open).length })
              .map(({ label, count }) => <div key={label} className="rounded-lg border border-[var(--theme-border)] px-4 py-3">
                <dt className="text-sm text-[var(--theme-body)]">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{count}</dd>
              </div>)}
          </dl>}
        {!!work.invites.some((item) => item.mine) && <button type="button" className={projectLink + " justify-self-start"}
          onClick={() => setSection("team")}>{t.pendingInvites}</button>}
      </ProjectSection>}
      {section === "team" && <Team {...props} />}
      {section === "volunteers" && <Volunteers {...props} />}
      {section === "tasks" && <Tasks {...props} />}
      {section === "management" && <Management {...props} />}
      {hasProgress && isProgressTab(section) && <ProjectProgressWork work={work} tab={section} refreshWork={resource.refresh} />}
      {section === "activity" && <ProjectSection title={t.activity}>
        {!work.activity.length && <p>{t.empty}</p>}
        <ol className="mt-3 grid gap-3">{work.activity.map((event) => <li key={event.id} className="break-words border-t border-[var(--theme-border)] pt-3">
          <p>{Object.hasOwn(progressText.actions, event.action) ? progressText.actions[event.action as keyof typeof progressText.actions]
            : t.events[event.action as keyof typeof t.events]} · <time dateTime={event.date}>{new Date(event.date).toLocaleString(locale)}</time></p>
          {event.detail && <p dir="auto" className="whitespace-pre-line text-sm">{event.action === "execution_status" ?
            t.states[event.detail as ProjectWork["status"]] : event.detail}</p>}
        </li>)}</ol>
      </ProjectSection>}
    </>}
  </div></MemberShell>;
}
