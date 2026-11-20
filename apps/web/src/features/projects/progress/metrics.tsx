import { type Controls, useProgressText, Change, value, nullable } from "./progress-controls";
import { institutionField, institutionLink } from "@/components/institution-ui";
import { type ProjectMetric, type ProjectProgress } from "@ayinou/shared";

function MeasureForm({ metric, ...controls }: Controls & { metric?: ProjectMetric }) {
  const { t } = useProgressText();
  return <Change {...controls} section="metrics" action={metric ? "metric_edit" : "metric_create"}
    data={metric ? { id: metric.id, version: metric.version } : undefined}
    read={(form) => ({ name: value(form, "name"), unit: value(form, "unit"), target: Number(value(form, "target")) })}>
    <label>{t.title}<input className={institutionField} name="name" minLength={2} maxLength={80} defaultValue={metric?.name} required /></label>
    <label>{t.unit}<input className={institutionField} name="unit" maxLength={48} defaultValue={metric?.unit} required /></label>
    <label>{t.target}<input className={institutionField} name="target" type="number" min={0} max={100000000} step=".01"
      defaultValue={metric?.target} required /></label>
  </Change>;
}

export function Metrics({ data, ...controls }: Controls & { data: ProjectProgress }) {
  const { t } = useProgressText();
  const editable = data.canManage && data.status === "active";
  return <section className="grid gap-3">
    <h3 className="font-semibold">{t.selfReported}</h3>
    {editable && <details><summary className={institutionLink}>{t.actions.metric_create}</summary><MeasureForm {...controls} /></details>}
    {!data.metrics.length && <p>{t.empty}</p>}
    <ul className="grid gap-3 lg:grid-cols-2">{data.metrics.map((metric) => <li key={metric.id} className="min-w-0 grid gap-2 rounded-md border border-[var(--theme-border)] p-3">
      <h4 className="font-semibold break-words">{metric.name}</h4>
      <p>{t.target} {metric.target} {metric.unit}</p>
      {metric.observations.map((item) => <div className="break-words border-t border-[var(--theme-border)] pt-2" key={item.id}>
        <p><strong>{t.actual} {item.actual} {metric.unit}</strong> · {item.startsOn} – {item.endsOn}</p>
        {item.explanation && <p className="text-sm whitespace-pre-line">{item.explanation}</p>}
        {item.reference && <a href={item.reference} className={institutionLink + " break-all"} target="_blank" rel="noreferrer">{item.reference}</a>}
      </div>)}
      {editable && !metric.observations.length && <details><summary className={institutionLink}>{t.actions.metric_edit}</summary>
        <MeasureForm {...controls} metric={metric} /></details>}
      {editable && <details><summary className={institutionLink}>{t.actions.metric_observe}</summary>
        <Change {...controls} section="metrics" action="metric_observe" data={{ id: metric.id }} read={(form) => ({
          startsOn: value(form, "startsOn"), endsOn: value(form, "endsOn"), actual: Number(value(form, "actual")),
          explanation: value(form, "explanation"), reference: nullable(form, "reference"),
        })}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label>{t.startsOn}<input className={institutionField} name="startsOn" type="date" required /></label>
            <label>{t.endsOn}<input className={institutionField} name="endsOn" type="date" required /></label>
          </div>
          <label>{t.actual}<input className={institutionField} name="actual" type="number" min={0} max={100000000} step=".01" required /></label>
          <label>{t.explanation}<textarea className={institutionField} name="explanation" minLength={3} maxLength={800} required rows={3} /></label>
          <label>{t.reference}<input className={institutionField} name="reference" type="url" maxLength={300} /></label>
        </Change>
      </details>}
    </li>)}</ul>
  </section>;
}
