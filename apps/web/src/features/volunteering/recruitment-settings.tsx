"use client";

import { useCallback, useState } from "react";
import { volunteerDepartments, volunteerModes } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { useLocale } from "@/lib/locale-store";
import { changeRecruitmentSettings, loadRecruitmentSettings } from "@/lib/recruitment-api";
import { recruitmentCopy } from "@/lib/recruitment-i18n";
import { departmentNames, volunteerCopy } from "@/lib/volunteer-i18n";
import { ReviewCommand } from "../projects/outcome-review/review-controls";

const numbers = [
  { key: "expiryDays", min: 1, max: 14 },
  { key: "organizerDailyLimit", min: 1, max: 10 },
  { key: "opportunityDailyLimit", min: 1, max: 15 },
  { key: "recipientDailyLimit", min: 1, max: 3 },
  { key: "cooldownDays", min: 7, max: 30 },
] as const;

export function FounderRecruitmentSettings({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = recruitmentCopy(locale), v = volunteerCopy(locale);
  const load = useCallback((signal: AbortSignal) => loadRecruitmentSettings(workspace, signal), [workspace]);
  const resource = useInstitutionResource(load);
  const [saved, setSaved] = useState(false);
  const data = resource.data;
  return <section className="grid min-w-0 gap-3 border-t border-[var(--theme-border)] pt-4">
    <h3 className="text-xl font-semibold">{t("settings")}</h3>
    <div className="grid gap-1 rounded-lg border border-[var(--theme-border)] p-3">
      <h4 className="font-semibold">{t("staged")}</h4>
      <p>{t("stages")}</p><p>{t("configured")}</p><p>{t("notImplemented")}</p>
    </div>
    <p>{t("closed")} {t("safeguard")}</p>
    {!data && resource.error === null && <ProjectLoading />}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {data && <>
      <p role="status">{t("ready")} · {v("version")} {data.settings.version}</p>
      <ReviewCommand key={data.settings.version} action="configure" label={t("prepare")} noteField="reason" minNote={10}
        version={data.settings.version} send={(body) => changeRecruitmentSettings(workspace, body)}
        after={() => { setSaved(true); resource.refresh(); }}
        input={(form) => ({
          departments: form.getAll("departments"), modes: form.getAll("modes"),
          ...Object.fromEntries(numbers.map(({ key }) => [key, Number(form.get(key))])),
        })}>
        <fieldset className="grid gap-2">
          <legend className="font-medium">{v("departments")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {volunteerDepartments.map((code, index) => <label key={code} className="flex items-center gap-2">
              <input name="departments" type="checkbox" value={code} defaultChecked={data.settings.departments.includes(code)} />
              {departmentNames[index]}
            </label>)}
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="font-medium">{v("mode")}</legend>
          {volunteerModes.map(mode => <label key={mode} className="flex items-center gap-2">
            <input name="modes" type="checkbox" value={mode} defaultChecked={data.settings.modes.includes(mode)} />{v(mode)}
          </label>)}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          {numbers.map(({ key, min, max }) => <label key={key}>{t(key)}
            <input className={institutionField} type="number" name={key} min={min} max={max} required defaultValue={data.settings[key]} />
          </label>)}
        </div>
      </ReviewCommand>
      {saved && <p role="status">{v("saved")}</p>}
      <h4 className="font-semibold">{v("history")}</h4>
      {data.history.length ? <ul className="grid gap-2">
        {data.history.map(entry => <li className="break-words" key={entry.version}>
          {v("version")} {entry.version} · <time dateTime={entry.at}>{new Intl.DateTimeFormat(locale,{ dateStyle:"medium",timeStyle:"short" }).format(new Date(entry.at))}</time>
          <p>{entry.reason}</p>
        </li>)}
      </ul> : <p>{v("emptyHistory")}</p>}
    </>}
  </section>;
}
