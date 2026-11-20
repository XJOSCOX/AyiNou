import { type WorkProps, useWorkMessages, Operation, field, actionsClass, ReasonField } from "./work-controls";
import { institutionCard, institutionLink, institutionField } from "@/components/institution-ui";

export function Volunteers(props: WorkProps) {
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
