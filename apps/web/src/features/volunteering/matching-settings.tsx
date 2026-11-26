"use client";

import { useCallback, useState } from "react";
import { matchingCriteria, volunteerDepartments, volunteerModes } from "@ayinou/shared";
import { SettingsHistory, SettingsOptions } from "@/components/settings-disclosures";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { useLocale } from "@/lib/locale-store";
import { changeMatchingSettings, loadMatchingSettings } from "@/lib/matching-api";
import { matchingCopy } from "@/lib/matching-i18n";
import { volunteerCopy } from "@/lib/volunteer-i18n";
import { VolunteerSettingsHeading, VolunteerSettingsSummary, volunteerNumberGrid, volunteerOptionLabel } from "./settings-summary";
import { ReviewCommand } from "../projects/outcome-review/review-controls";
import { departmentNames } from "@/lib/volunteer-i18n";

const numberFields = [
  { key:"requiredWeight",min:3,max:9 },{ key:"preferredWeight",min:1,max:2 },
  { key:"recommendationLimit",min:1,max:16 },{ key:"discoveryLimit",min:1,max:8 },
] as const;

export function FounderMatchingSettings({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = matchingCopy(locale), v = volunteerCopy(locale);
  const loader = useCallback((signal:AbortSignal) => loadMatchingSettings(workspace,signal),[workspace]);
  const resource = useInstitutionResource(loader);
  const [saved,setSaved] = useState(false);
  const data = resource.data;
  return <section className="grid min-w-0 gap-3">
    <VolunteerSettingsHeading title={t("admin")}>
      {data && v("version") + " " + data.settings.version}
    </VolunteerSettingsHeading>
    {!data && resource.error===null && <ProjectLoading />}
    {resource.error!==null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {data && <>
      <VolunteerSettingsSummary values={numberFields.map(({ key }) => [t(key), data.settings[key]] as const)} />
      <ReviewCommand key={data.settings.version} action="configure" label={t("save")} triggerLabel={v("editSettings")} noteField="reason" minNote={10} disclosureGroup="volunteer-configuration"
        version={data.settings.version}
        send={(body) => changeMatchingSettings(workspace,body)}
        after={() => { setSaved(true); resource.refresh(); }}
        input={(form) => ({
          criteria:form.getAll("criteria"),departments:form.getAll("departments"),modes:form.getAll("modes"),
          ...Object.fromEntries(numberFields.map(({ key }) => [key,Number(form.get(key))])),
        })}>
        <SettingsOptions title={t("criteria")}>
          {matchingCriteria.map((key) => <label key={key} className={volunteerOptionLabel}>
            <input name="criteria" type="checkbox" value={key} defaultChecked={data.settings.criteria.includes(key)} />{t(key)}
          </label>)}
        </SettingsOptions>
        <SettingsOptions title={v("departments")}>
          {volunteerDepartments.map((code,index) => <label key={code} className={volunteerOptionLabel}>
            <input name="departments" type="checkbox" value={code} defaultChecked={data.settings.departments.includes(code)} />{departmentNames[index]}
          </label>)}
        </SettingsOptions>
        <SettingsOptions title={v("mode")}>
          {volunteerModes.map((mode) => <label key={mode} className={volunteerOptionLabel}>
            <input name="modes" type="checkbox" value={mode} defaultChecked={data.settings.modes.includes(mode)} />{v(mode)}
          </label>)}
        </SettingsOptions>
        {([["scoringWeights", numberFields.slice(0, 2)], ["resultLimits", numberFields.slice(2)]] as const).map(([heading, fields]) =>
          <fieldset key={heading} className={volunteerNumberGrid}>
            <legend className="mb-1 text-sm font-semibold">{t(heading)}</legend>
            {fields.map(({ key, min, max }) => <label key={key}>{t(key)}
              <input name={key} type="number" min={min} max={max} required defaultValue={data.settings[key]} className={institutionField} />
            </label>)}
          </fieldset>)}
      </ReviewCommand>
      {saved && <p role="status">{v("saved")}</p>}
      {data.history.length > 0 && <SettingsHistory title={v("recentChanges")}>
        <ul className="grid gap-2">{data.history.map((item) => <li className="break-words" key={item.version}>
        v{item.version} · <time dateTime={item.at}>{new Intl.DateTimeFormat(locale,{ dateStyle:"medium",timeStyle:"short" }).format(new Date(item.at))}</time> · {item.reason}
      </li>)}</ul>
      </SettingsHistory>}
    </>}
  </section>;
}
