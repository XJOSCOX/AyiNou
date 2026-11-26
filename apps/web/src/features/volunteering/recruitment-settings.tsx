"use client";

import { useCallback, useState } from "react";
import { volunteerDepartments, volunteerModes } from "@ayinou/shared";
import { SettingsHistory, SettingsOptions } from "@/components/settings-disclosures";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { useLocale } from "@/lib/locale-store";
import { changeRecruitmentSettings, loadRecruitmentSettings } from "@/lib/recruitment-api";
import { recruitmentCopy } from "@/lib/recruitment-i18n";
import { departmentNames, volunteerCopy } from "@/lib/volunteer-i18n";
import { VolunteerSettingsHeading, VolunteerSettingsSummary, volunteerNumberGrid, volunteerOptionLabel } from "./settings-summary";
import { ReviewCommand } from "../projects/outcome-review/review-controls";

const numbers = [
  { key: "expiryDays", min: 1, max: 14 },
  { key: "cooldownDays", min: 7, max: 30 },
  { key: "organizerDailyLimit", min: 1, max: 10 },
  { key: "opportunityDailyLimit", min: 1, max: 15 },
  { key: "recipientDailyLimit", min: 1, max: 3 },
] as const;

export function FounderRecruitmentSettings({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = recruitmentCopy(locale), v = volunteerCopy(locale);
  const load = useCallback((signal: AbortSignal) => loadRecruitmentSettings(workspace, signal), [workspace]);
  const resource = useInstitutionResource(load);
  const [saved, setSaved] = useState(false);
  const data = resource.data;
  return <section className="grid min-w-0 gap-3">
    <VolunteerSettingsHeading title={t("settings")}>
      {data && v("version") + " " + data.settings.version}
    </VolunteerSettingsHeading>
    {!data && resource.error === null && <ProjectLoading />}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {data && <>
      <VolunteerSettingsSummary values={numbers.map(({ key }) => [t(key), data.settings[key]] as const)} />
      <ReviewCommand key={data.settings.version} action="configure" label={t("prepare")} triggerLabel={v("editSettings")} noteField="reason" minNote={10} disclosureGroup="volunteer-configuration"
        version={data.settings.version} send={(body) => changeRecruitmentSettings(workspace, body)}
        after={() => { setSaved(true); resource.refresh(); }}
        input={(form) => ({
          departments: form.getAll("departments"), modes: form.getAll("modes"),
          ...Object.fromEntries(numbers.map(({ key }) => [key, Number(form.get(key))])),
        })}>
        <SettingsOptions title={v("departments")}>
          {volunteerDepartments.map((code, index) => <label key={code} className={volunteerOptionLabel}>
            <input name="departments" type="checkbox" value={code} defaultChecked={data.settings.departments.includes(code)} />
            {departmentNames[index]}
          </label>)}
        </SettingsOptions>
        <SettingsOptions title={v("mode")}>
          {volunteerModes.map(mode => <label key={mode} className={volunteerOptionLabel}>
            <input name="modes" type="checkbox" value={mode} defaultChecked={data.settings.modes.includes(mode)} />{v(mode)}
          </label>)}
        </SettingsOptions>
        {([["invitationTiming", numbers.slice(0, 2)], ["dailyLimits", numbers.slice(2)]] as const).map(([heading, fields]) =>
          <fieldset key={heading} className={volunteerNumberGrid}>
            <legend className="mb-1 text-sm font-semibold">{t(heading)}</legend>
            {fields.map(({ key, min, max }) => <label key={key}>{t(key)}
              <input className={institutionField} type="number" name={key} min={min} max={max} required defaultValue={data.settings[key]} />
            </label>)}
          </fieldset>)}
      </ReviewCommand>
      {saved && <p role="status">{v("saved")}</p>}
      {data.history.length > 0 && <SettingsHistory title={v("recentChanges")}>
        <ul className="grid gap-2">
        {data.history.map(entry => <li className="break-words" key={entry.version}>
          {v("version")} {entry.version} · <time dateTime={entry.at}>{new Intl.DateTimeFormat(locale,{ dateStyle:"medium",timeStyle:"short" }).format(new Date(entry.at))}</time>
          <p>{entry.reason}</p>
        </li>)}
      </ul>
      </SettingsHistory>}
    </>}
  </section>;
}
