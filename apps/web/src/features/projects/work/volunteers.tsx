import { type WorkProps, useWorkMessages, Operation, field, actionsClass, ReasonField } from "./work-controls";
import { institutionField } from "@/components/institution-ui";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { requirementCopy } from "@/lib/requirement-i18n";
import { OpportunityCandidates } from "./opportunity-candidates";
import { RequirementCard, RequirementPreview, useRequirements } from "./requirements";
import { ProjectDisclosure, ProjectSection } from "@/components/project-ui";

export function Volunteers(props: WorkProps) {
  const { work } = props;
  const { t, locale } = useWorkMessages();
  const copy = requirementCopy(locale);
  const requirements = useRequirements(work.projectId);
  const fixture = requirements.data?.state === "fixture" ? requirements.data : null;
  const operationProps = { ...props, refresh: () => { props.refresh(); requirements.refresh(); } };
  const manager = work.role === "owner" || work.role === "manager";
  const active = work.status === "active";
  return <div className="grid gap-4">
    <ProjectSection title={t.volunteers}>
      <p className="text-sm text-[var(--theme-body)]">{t.volunteerHelp}</p>
      {requirements.data?.state === "closed" && <p className="mt-2 text-sm">{copy("closed")}</p>}
      {requirements.error !== null && <ApiErrorNotice error={requirements.error} retry={requirements.refresh} signIn />}
      {fixture && !fixture.department && manager && <p className="mt-2 text-sm">{copy("noScope")}</p>}
      {manager && active && <ProjectDisclosure title={t.events.opportunity_publish}>
        <Operation {...operationProps} action="opportunity_publish" fields={(data) => ({
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
      </ProjectDisclosure>}
      {!work.opportunities.length && <p className="mt-3">{t.empty}</p>}
      <ul className="mt-3 grid gap-3">{work.opportunities.map((item) => <li className="grid gap-2 border-t border-[var(--theme-border)] pt-3" key={item.id} id={"opportunity-"+item.id}>
        <h3 className="break-words font-semibold">{item.title}</h3>
        <p className="whitespace-pre-line break-words" dir="auto">{item.description}</p>
        <dl className="grid gap-1 break-words text-sm">
          <div><dt className="inline font-semibold">{t.skills} · </dt><dd className="inline">{item.skills}</dd></div>
          <div><dt className="inline font-semibold">{t.commitment} · </dt><dd className="inline">{item.commitment}</dd></div>
          <div><dt className="inline font-semibold">{t.capacity} · </dt><dd className="inline">{item.capacity}</dd></div>
          {item.closesOn && <div><dt className="inline font-semibold">{t.closesOn} · </dt><dd className="inline">{item.closesOn}</dd></div>}
        </dl>
        <p className="text-sm">{copy("unpaid")} · {item.remote ? t.remote : t.projectRegion}</p>
        {fixture && <RequirementCard project={work.projectId} view={fixture} opportunity={item} refresh={requirements.refresh} />}
        {manager && fixture?.items.some((entry) => entry.opportunityId===item.id && entry.published)
          && <OpportunityCandidates project={work.projectId} opportunity={item.id}
            discover={item.open && fixture.items.some(entry => entry.opportunityId===item.id && entry.published && !entry.published.screening)} />}
        <div className={actionsClass}>
          {item.open && work.canApply && !work.applications.some((row) => row.mine && row.opportunityId === item.id) &&
            <Operation {...operationProps} action="volunteer_apply" input={{ id: item.id }} />}
          {item.open && manager && <Operation {...operationProps} action="opportunity_close" input={{ id: item.id }} />}
        </div>
      </li>)}</ul>
    </ProjectSection>
    <ProjectSection title={t.applications}>
      {!work.applications.length && <p>{t.empty}</p>}
      <ul className="mt-3 grid gap-3">{work.applications.map((item) => {
        const published = fixture?.items.find((row) => row.opportunityId === item.opportunityId)?.published;
        return <li className="grid gap-2 border-t border-[var(--theme-border)] pt-3" key={item.id}>
        <p className="break-words font-semibold">{item.title} · {t.applicationStates[item.status]}{item.applicant?.name && <> · {item.applicant.name}</>}</p>
        {published && <ProjectDisclosure title={copy("published")}><RequirementPreview revision={published} locale={locale} /></ProjectDisclosure>}
        {item.feedback && <p className="break-words" dir="auto">{item.feedback}</p>}
        <div className={actionsClass}>
          {item.mine && item.status === "offered" && active && <Operation {...operationProps} action="volunteer_confirm" input={{ id: item.id }} />}
          {item.mine && (active || work.status === "paused") && ["pending", "offered", "accepted"].includes(item.status) &&
            <Operation {...operationProps} action="volunteer_withdraw" input={{ id: item.id }} />}
          {!item.mine && manager && active && item.status === "pending" && (["volunteer_offer", "volunteer_reject"] as const).map((action) =>
            <ProjectDisclosure title={t.events[action]} key={action} className="w-full">
              <Operation {...operationProps} action={action} input={{ id: item.id }} fields={(data) => ({ reason: field(data, "reason") })}><ReasonField /></Operation>
            </ProjectDisclosure>)}
        </div>
      </li>;
      })}</ul>
    </ProjectSection>
  </div>;
}
