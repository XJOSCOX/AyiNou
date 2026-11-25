"use client";

import { useCallback, useState } from "react";
import { requirementFields, volunteerCategories, volunteerModes } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { useLocale } from "@/lib/locale-store";
import { changeRequirementSettings, loadRequirementSettings } from "@/lib/requirement-api";
import { requirementCopy } from "@/lib/requirement-i18n";
import { volunteerCategory, volunteerCopy } from "@/lib/volunteer-i18n";
import { ReviewCommand } from "../projects/outcome-review/review-controls";

export function FounderRequirementSettings({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = requirementCopy(locale), v = volunteerCopy(locale);
  const loader = useCallback((signal: AbortSignal) => loadRequirementSettings(workspace,signal),[workspace]);
  const resource = useInstitutionResource(loader);
  const [saved, markSaved] = useState(false);
  return <section className="grid min-w-0 gap-3 border-t border-[var(--theme-border)] pt-4">
    <h3 className="text-xl font-semibold">{t("admin")}</h3>
    <p>{t("activeReadiness")}</p>
    {!resource.data && resource.error === null && <ProjectLoading />}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {resource.data && <>
      <p role="status">{t("ready")} · {v("version")} {resource.data.settings.version}</p>
      <p>{t("catalogAvailable")} · {resource.data.availableSkills}</p>
      <SettingsEditor key={resource.data.settings.version} workspace={workspace} settings={resource.data.settings}
        after={() => { markSaved(true); resource.refresh(); }} />
      {saved && <p role="status">{v("saved")}</p>}
      <h4 className="font-semibold">{t("history")}</h4>
      {resource.data.history.length ? <ul className="grid gap-2">{resource.data.history.map((event) =>
        <li key={event.version} className="break-words">v{event.version} · {event.reason}</li>)}</ul> : <p>{v("emptyHistory")}</p>}
    </>}
  </section>;
}

function SettingsEditor({ workspace, settings, after }: {
  workspace: string; settings: import("@ayinou/shared").RequirementSettings; after: () => void;
}) {
  const [locale] = useLocale();
  const t = requirementCopy(locale), v = volunteerCopy(locale);
  return <ReviewCommand action="configure" label={t("configure")} noteField="reason" minNote={10} version={settings.version}
    send={(body) => changeRequirementSettings(workspace,body)} after={after}
    input={(form) => ({ categories:form.getAll("categories"),fields:form.getAll("fields"),modes:form.getAll("modes"),
      maxSkills:Number(form.get("maxSkills")),maxLanguages:Number(form.get("maxLanguages")) })}>
    <fieldset className="grid gap-2"><legend className="font-medium">{v("category")}</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {volunteerCategories.map((category) => <label key={category} className="flex items-start gap-2">
          <input type="checkbox" name="categories" value={category} defaultChecked={settings.categories.includes(category)} />{volunteerCategory(category,locale)}
        </label>)}
      </div>
    </fieldset>
    <fieldset className="grid gap-2"><legend className="font-medium">{v("fields")}</legend>
      {requirementFields.map((field) => <label key={field} className="flex items-start gap-2">
        <input type="checkbox" name="fields" value={field} defaultChecked={settings.fields.includes(field)} />
        {field === "screening" ? t("screening") : v(field)}
      </label>)}
    </fieldset>
    <fieldset className="grid gap-2"><legend className="font-medium">{v("mode")}</legend>
      {volunteerModes.map((mode) => <label key={mode} className="flex items-start gap-2">
        <input type="checkbox" name="modes" value={mode} defaultChecked={settings.modes.includes(mode)} />{v(mode)}
      </label>)}
    </fieldset>
    <div className="grid gap-2 sm:grid-cols-2">
      <label>{t("skillLimit")}<input type="number" className={institutionField} name="maxSkills" min={1} max={12} defaultValue={settings.maxSkills} required /></label>
      <label>{t("languageLimit")}<input type="number" className={institutionField} name="maxLanguages" min={0} max={6} defaultValue={settings.maxLanguages} required /></label>
    </div>
  </ReviewCommand>;
}
