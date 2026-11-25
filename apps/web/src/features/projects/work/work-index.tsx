import Link from "next/link";
import { recommendationsPath } from "@/lib/matching-api";
import { matchingCopy } from "@/lib/matching-i18n";
import { useWorkMessages } from "./work-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { useInstitutionResource } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { ProjectLoading, ProjectSection, ProjectStatusBadge, ProjectsHeader, projectBadge } from "@/components/project-ui";
import { loadProjectWorkIndex } from "@/lib/project-work-api";

const row = "flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] px-4 py-3";
const titleLink = "min-w-0 break-words text-sm font-semibold text-[var(--theme-link)] hover:underline focus-visible:underline";

export function ProjectWorkIndexScreen() {
  const { t, locale } = useWorkMessages();
  const resource = useInstitutionResource(loadProjectWorkIndex);
  return <MemberShell><div className="grid min-w-0 gap-4">
    <ProjectsHeader title={t.workspace} description={t.workspaceHelp} current="work" />
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!resource.data && resource.error === null && <ProjectLoading />}
    {resource.data && <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
      <ProjectSection title={t.myWork} count={resource.data.work.length}>
        {resource.data.work.length ? <ul className="grid gap-2">{resource.data.work.map((item) => <li className={row} key={item.id}>
          <Link href={`/projects/${item.id}/work`} className={titleLink} dir="auto">{item.title}</Link>
          <ProjectStatusBadge status={item.status === "approved" ? "approved" : undefined}>{t.states[item.status]}</ProjectStatusBadge>
        </li>)}</ul> : <p className="text-sm text-[var(--theme-body)]">{t.emptyWorkspace}</p>}
      </ProjectSection>
      <ProjectSection title={t.volunteers} count={resource.data.opportunities.length}>
        <Link href={recommendationsPath} className={titleLink}>{matchingCopy(locale)("title")}</Link>
        {resource.data.opportunities.length ? <ul className="grid gap-2">{resource.data.opportunities.map((item) => <li className={row} key={item.id}>
          <Link href={`/projects/${item.projectId}/work?section=volunteers`} className={titleLink} dir="auto">{item.title}</Link>
          {item.remote && <span className={projectBadge}>{t.remote}</span>}
        </li>)}</ul> : <p className="text-sm text-[var(--theme-body)]">{t.emptyOpportunities}</p>}
      </ProjectSection>
    </div>}
  </div></MemberShell>;
}
