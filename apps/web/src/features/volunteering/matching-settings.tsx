"use client";

import { useCallback, useState } from "react";
import { matchingCriteria, volunteerDepartments, volunteerModes } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { useLocale } from "@/lib/locale-store";
import { changeMatchingSettings, loadMatchingSettings } from "@/lib/matching-api";
import { matchingCopy } from "@/lib/matching-i18n";
import { volunteerCopy } from "@/lib/volunteer-i18n";
import { ReviewCommand } from "../projects/outcome-review/review-controls";
import { departmentNames } from "@/lib/volunteer-i18n";

const numberFields = [
  { key:"requiredWeight",min:3,max:9 },{ key:"preferredWeight",min:1,max:2 },
  { key:"recommendationLimit",min:1,max:16 },{ key:"discoveryLimit",min:1,max:8 },
] as const;

export function FounderMatchingSettings({ workspace, onSaved }: { workspace: string; onSaved: () => void }) {
  const [locale] = useLocale();
  const t = matchingCopy(locale), v = volunteerCopy(locale);
  const loader = useCallback((signal:AbortSignal) => loadMatchingSettings(workspace,signal),[workspace]);
  const resource = useInstitutionResource(loader);
  const [saved,setSaved] = useState(false);
  const data = resource.data;
  return <section className="grid min-w-0 gap-3 border-t border-[var(--theme-border)] pt-4">
    <h3 className="text-xl font-semibold">{t("admin")}</h3>
    {!data && resource.error===null && <ProjectLoading />}
    {resource.error!==null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {data && <>
      <p role="status">{t("ready")} · {v("version")} {data.settings.version}</p>
      <ReviewCommand key={data.settings.version} action="configure" label={t("save")} noteField="reason" minNote={10}
        version={data.settings.version}
        send={(body) => changeMatchingSettings(workspace,body)}
        after={() => { setSaved(true); resource.refresh(); onSaved(); }}
        input={(form) => ({
          criteria:form.getAll("criteria"),departments:form.getAll("departments"),modes:form.getAll("modes"),
          ...Object.fromEntries(numberFields.map(({ key }) => [key,Number(form.get(key))])),
        })}>
        <fieldset className="grid gap-2"><legend className="font-medium">{t("criteria")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {matchingCriteria.map((key) => <label key={key} className="flex items-start gap-2">
              <input name="criteria" type="checkbox" value={key} defaultChecked={data.settings.criteria.includes(key)} />{t(key)}
            </label>)}
          </div>
        </fieldset>
        <fieldset className="grid gap-2"><legend className="font-medium">{v("departments")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {volunteerDepartments.map((code,index) => <label key={code} className="flex items-start gap-2">
              <input name="departments" type="checkbox" value={code} defaultChecked={data.settings.departments.includes(code)} />{departmentNames[index]}
            </label>)}
          </div>
        </fieldset>
        <fieldset className="grid gap-2"><legend className="font-medium">{v("mode")}</legend>
          {volunteerModes.map((mode) => <label key={mode} className="flex items-start gap-2">
            <input name="modes" type="checkbox" value={mode} defaultChecked={data.settings.modes.includes(mode)} />{v(mode)}
          </label>)}
        </fieldset>
        <div className="grid gap-2 sm:grid-cols-2">
          {numberFields.map(({ key,min,max }) => <label key={key}>{t(key)}
            <input name={key} type="number" min={min} max={max} required defaultValue={data.settings[key]} className={institutionField} />
          </label>)}
        </div>
      </ReviewCommand>
      {saved && <p role="status">{v("saved")}</p>}
      <h4 className="font-semibold">{v("history")}</h4>
      {data.history.length ? <ul className="grid gap-2">{data.history.map((item) => <li className="break-words" key={item.version}>
        v{item.version} · <time dateTime={item.at}>{new Intl.DateTimeFormat(locale,{ dateStyle:"medium",timeStyle:"short" }).format(new Date(item.at))}</time> · {item.reason}
      </li>)}</ul> : <p>{v("emptyHistory")}</p>}
    </>}
  </section>;
}
