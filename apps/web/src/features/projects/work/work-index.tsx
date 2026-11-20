import { useWorkMessages } from "./work-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { useInstitutionResource, institutionCard, institutionLink } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { PageHeader } from "@/components/page-header";
import { authMessages } from "@/lib/auth-i18n";
import { loadProjectWorkIndex } from "@/lib/project-work-api";
import Link from "next/link";

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
