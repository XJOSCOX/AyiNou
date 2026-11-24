import { Entries } from "./entries";
import { EntryBody } from "./entry-content";
import { Metrics } from "./metrics";
import { Milestones } from "./milestones";
import { useProgressText } from "./progress-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { useInstitutionResource, institutionCard, institutionLink } from "@/components/institution-ui";
import { ProjectLoading, ProjectSection } from "@/components/project-ui";
import { apiErrorCode } from "@/lib/api-errors";
import { loadProgress } from "@/lib/project-progress-api";
import { type ProjectProgress, type ProjectWork } from "@ayinou/shared";
import { useCallback } from "react";

export const progressTabs = ["milestones", "progress", "updates", "outcomes"] as const;

export type ProgressTab = (typeof progressTabs)[number];

function StatusSummary({ data }: { data: ProjectProgress }) {
  const { t, workText } = useProgressText();
  return <div className="flex flex-wrap gap-4 text-sm">
    <p><strong>{workText.states[data.status]}</strong>{data.completedOn && <> · {t.completedOn} {data.completedOn}</>}</p>
    <p>{t.milestonesCompleted} <strong>{data.milestoneCount}</strong></p>
    {data.taskCount !== null && <p>{t.tasksCompleted} <strong>{data.taskCount}</strong></p>}
  </div>;
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
  return <ProjectSection title={t[tab]}>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={refresh} signIn />}
    {!data && resource.error === null && <ProjectLoading cards={1} className="grid" />}
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
  </ProjectSection>;
}
