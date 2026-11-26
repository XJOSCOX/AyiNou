"use client";

import { useCallback, useState } from "react";
import { requirementFields, volunteerCategories, volunteerModes } from "@ayinou/shared";
import { SettingsHistory, SettingsOptions } from "@/components/settings-disclosures";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { useLocale } from "@/lib/locale-store";
import { changeRequirementSettings, loadRequirementSettings } from "@/lib/requirement-api";
import { requirementCopy } from "@/lib/requirement-i18n";
import { volunteerCategory, volunteerCopy } from "@/lib/volunteer-i18n";
import { VolunteerSettingsHeading, VolunteerSettingsSummary, volunteerNumberGrid, volunteerOptionLabel } from "./settings-summary";
import { ReviewCommand } from "../projects/outcome-review/review-controls";

export function FounderRequirementSettings({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = requirementCopy(locale), v = volunteerCopy(locale);
  const loader = useCallback((signal: AbortSignal) => loadRequirementSettings(workspace,signal),[workspace]);
  const resource = useInstitutionResource(loader);
  const [saved, markSaved] = useState(false);
  const data = resource.data;
  return <section className="grid min-w-0 gap-3">
    <VolunteerSettingsHeading title={t("admin")}>
      {data && v("version") + " " + data.settings.version}
    </VolunteerSettingsHeading>
    {!data && resource.error === null && <ProjectLoading />}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {data && <>
      <VolunteerSettingsSummary values={[
        [t("skillLimit"), data.settings.maxSkills],
        [t("languageLimit"), data.settings.maxLanguages],
        [t("catalogAvailable"), data.availableSkills],
      ]} />
      <SettingsEditor key={data.settings.version} workspace={workspace} settings={data.settings}
        after={() => { markSaved(true); resource.refresh(); }} />
      {saved && <p role="status">{v("saved")}</p>}
      {data.history.length > 0 && <SettingsHistory title={v("recentChanges")}>
        <ul className="grid gap-2">{data.history.map((event) =>
          <li key={event.version} className="break-words">v{event.version} · {event.reason}</li>)}</ul>
      </SettingsHistory>}
    </>}
  </section>;
}

function SettingsEditor({ workspace, settings, after }: {
  workspace: string; settings: import("@ayinou/shared").RequirementSettings; after: () => void;
}) {
  const [locale] = useLocale();
  const t = requirementCopy(locale), v = volunteerCopy(locale);
  return <ReviewCommand action="configure" label={t("configure")} triggerLabel={v("editSettings")} noteField="reason" minNote={10} disclosureGroup="volunteer-configuration" version={settings.version}
    send={(body) => changeRequirementSettings(workspace,body)} after={after}
    input={(form) => ({ categories:form.getAll("categories"),fields:form.getAll("fields"),modes:form.getAll("modes"),
      maxSkills:Number(form.get("maxSkills")),maxLanguages:Number(form.get("maxLanguages")) })}>
    <SettingsOptions title={v("category")}>
      {volunteerCategories.map((category) => <label key={category} className={volunteerOptionLabel}>
        <input type="checkbox" name="categories" value={category} defaultChecked={settings.categories.includes(category)} />{volunteerCategory(category,locale)}
      </label>)}
    </SettingsOptions>
    <SettingsOptions title={v("fields")}>
      {requirementFields.map((field) => <label key={field} className={volunteerOptionLabel}>
        <input type="checkbox" name="fields" value={field} defaultChecked={settings.fields.includes(field)} />
        {field === "screening" ? t("screening") : v(field)}
      </label>)}
    </SettingsOptions>
    <SettingsOptions title={v("mode")}>
      {volunteerModes.map((mode) => <label key={mode} className={volunteerOptionLabel}>
        <input type="checkbox" name="modes" value={mode} defaultChecked={settings.modes.includes(mode)} />{v(mode)}
      </label>)}
    </SettingsOptions>
    <div className={volunteerNumberGrid}>
      <label>{t("skillLimit")}<input type="number" className={institutionField} name="maxSkills" min={1} max={12} defaultValue={settings.maxSkills} required /></label>
      <label>{t("languageLimit")}<input type="number" className={institutionField} name="maxLanguages" min={0} max={6} defaultValue={settings.maxLanguages} required /></label>
    </div>
  </ReviewCommand>;
}
