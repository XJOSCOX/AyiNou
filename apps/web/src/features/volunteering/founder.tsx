"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminCompactCard } from "@/components/admin-controls";
import { locales, volunteerCategories, volunteerFields, type Locale, type VolunteerSkill } from "@ayinou/shared";
import { SettingsHistory, SettingsOptions } from "@/components/settings-disclosures";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { useLocale } from "@/lib/locale-store";
import { loadVolunteerSettings, saveVolunteerSettings } from "@/lib/volunteer-api";
import { volunteerCategory, volunteerCopy } from "@/lib/volunteer-i18n";
import { VolunteerSettingsHeading, VolunteerSettingsSummary, volunteerNumberGrid, volunteerOptionLabel } from "./settings-summary";
import { ReviewCommand } from "../projects/outcome-review/review-controls";
import { VolunteerActivation } from "./activation-settings";
import { FounderRecruitmentSettings } from "./recruitment-settings";
import { FounderMatchingSettings } from "./matching-settings";
import { FounderRequirementSettings } from "./requirement-settings";

const sections = ["activation", "profiles", "requirements", "matching", "recruitment"] as const;
const fieldset = "grid min-w-0 gap-2 rounded-lg border border-[var(--theme-border)] p-3";
const lang = { en: "English", ht: "Kreyòl ayisyen", fr: "Français", es: "Español" };
const read = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function SkillDefinition({ skill, locale, send, after }: {
  skill?: VolunteerSkill; locale: Locale; send: (body: string) => Promise<unknown>; after: () => void;
}) {
  const t = volunteerCopy(locale);
  return <ReviewCommand action="define" label={t("define")} triggerLabel={t(skill ? "editSkill" : "newSkill")} noteField="reason" minNote={10} disclosureGroup="volunteer-configuration"
    send={send} after={after} version={skill?.version ?? 0} input={(form) => {
      const descriptions = Object.fromEntries(locales.map((value) => [value, read(form,"description-" + value)]));
      return { code: read(form,"code"), category: read(form,"category"), status: read(form,"status"),
        names: Object.fromEntries(locales.map((value) => [value, read(form,"name-" + value)])),
        descriptions: Object.values(descriptions).some(Boolean) ? descriptions : null,
        aliases: read(form,"aliases").split(/\r?\n/).map((value) => value.trim()).filter(Boolean) };
    }}>
    <div className={volunteerNumberGrid}>
      <label>{t("code")}<input className={institutionField} required name="code" maxLength={40}
        pattern="[a-z][a-z0-9_]{2,39}" readOnly={!!skill} defaultValue={skill?.code} /></label>
      <label>{t("category")}<select className={institutionField} name="category" defaultValue={skill?.category}>
        {volunteerCategories.map((category) => <option key={category} value={category}>{volunteerCategory(category,locale)}</option>)}
      </select></label>
      <label>{t("status")}<select className={institutionField} name="status" defaultValue={skill?.status ?? "draft"}>
        {(["draft","active","retired"] as const).map((status) => <option key={status} value={status}>{t(status)}</option>)}
      </select></label>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {locales.map((value) => <fieldset key={value} className={fieldset} lang={value}>
        <legend className="px-1">{lang[value]}</legend>
        <label>{t("name")}<input className={institutionField} name={"name-" + value} maxLength={80} required defaultValue={skill?.names[value]} /></label>
        <label>{t("description")}<input className={institutionField} name={"description-" + value} maxLength={240} defaultValue={skill?.descriptions?.[value]} /></label>
      </fieldset>)}
    </div>
    <label>{t("aliases")}<textarea className={institutionField} name="aliases" maxLength={972} rows={2} defaultValue={skill?.aliases.join("\n")} /></label>
  </ReviewCommand>;
}

export function FounderVolunteer({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = volunteerCopy(locale);
  const searchParams = useSearchParams();
  const activeSection = sections.find(section => section === searchParams.get("volunteerSection")) ?? "activation";
  function selectSection(section: typeof sections[number]) {
    if (section === activeSection) return;
    const url = new URL(window.location.href);
    url.searchParams.set("section", "volunteerSettings");
    if (section === "activation") url.searchParams.delete("volunteerSection");
    else url.searchParams.set("volunteerSection", section);
    window.history.pushState(null, "", url);
  }
  return <section className="grid min-w-0 gap-3 [overflow-wrap:anywhere]" aria-label={t("admin")}>
    <header className={adminCompactCard + " grid gap-3"}>
      <h2 className="text-xl font-semibold">{t("admin")}</h2>
      <nav aria-label={t("admin")} className="flex min-w-0 flex-wrap gap-1 border-t border-[var(--theme-border)] pt-2">
        {sections.map(section => <button key={section} type="button" aria-pressed={activeSection === section}
          onClick={() => selectSection(section)}
          className="inline-flex min-h-10 max-w-full items-center rounded-md px-3 py-1.5 text-start text-sm font-semibold text-[var(--theme-body)] hover:bg-[var(--theme-control)] focus-visible:outline-2 aria-pressed:bg-[var(--theme-selected)] aria-pressed:text-[var(--theme-link)]">
          {t(`${section}Tab` as const)}
        </button>)}
      </nav>
    </header>
    <div className={adminCompactCard}>
      {activeSection === "activation" && <VolunteerActivation workspace={workspace} />}
      {activeSection === "profiles" && <VolunteerCatalog workspace={workspace} />}
      {activeSection === "requirements" && <FounderRequirementSettings workspace={workspace} />}
      {activeSection === "matching" && <FounderMatchingSettings workspace={workspace} />}
      {activeSection === "recruitment" && <FounderRecruitmentSettings workspace={workspace} />}
    </div>
  </section>;
}

function VolunteerCatalog({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = volunteerCopy(locale);
  const loader = useCallback((signal: AbortSignal) => loadVolunteerSettings(workspace,signal), [workspace]);
  const resource = useInstitutionResource(loader);
  const send = (body: string) => saveVolunteerSettings(workspace,body);
  const [code, select] = useState("");
  const [saved, markSaved] = useState(false);
  const after = () => { markSaved(true); resource.refresh(); };
  const data = resource.data;
  const skill = data?.catalog.find((item) => item.code === code);
  return <section className="grid min-w-0 gap-3">
    {!data && <VolunteerSettingsHeading title={t("profilesTab")} />}
    {!data && resource.error === null && <ProjectLoading />}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {data && <>
      <VolunteerSettingsHeading title={t("profilesTab")}>
        <span role="status">{t("ready")} · {t("version")} {data.settings.version}</span>
      </VolunteerSettingsHeading>
      <div className="grid min-w-0 items-start gap-3 xl:grid-cols-2">
        <section className="grid min-w-0 gap-3 rounded-lg border border-[var(--theme-border)] p-3">
          <h4 className="font-semibold">{t("profileOptions")}</h4>
          <VolunteerSettingsSummary values={[
            [t("category"), data.settings.categories.length],
            [t("fields"), data.settings.fields.length],
          ]} />
          <ReviewCommand key={data.settings.version} action="configure" label={t("configure")} triggerLabel={t("editProfileOptions")}
            minNote={10} noteField="reason" disclosureGroup="volunteer-configuration"
            version={data.settings.version} send={send} after={after}
            input={(form) => ({ categories: form.getAll("categories"), fields: form.getAll("fields") })}>
            <SettingsOptions title={t("category")}>
              {volunteerCategories.map((category) => <label key={category} className={volunteerOptionLabel}>
                <input type="checkbox" name="categories" value={category} defaultChecked={data.settings.categories.includes(category)} />{volunteerCategory(category,locale)}
              </label>)}
            </SettingsOptions>
            <SettingsOptions title={t("fields")}>
              {volunteerFields.map((field) => <label key={field} className={volunteerOptionLabel}>
                <input type="checkbox" name="fields" value={field} defaultChecked={data.settings.fields.includes(field)} />{t(field)}
              </label>)}
            </SettingsOptions>
          </ReviewCommand>
        </section>
        <section className="grid min-w-0 gap-3 rounded-lg border border-[var(--theme-border)] p-3">
          <label className="block min-w-0 font-semibold">{t("catalog")}
            <select className={institutionField + " min-w-0"} value={code} onChange={(event) => select(event.target.value)}>
              <option value="">{t("newSkill")}</option>
              {data.catalog.map((item) => <option key={item.code} value={item.code}>{item.names[locale]}</option>)}
            </select>
          </label>
          {skill && <p className="text-sm text-[var(--theme-body)]">{t(skill.status)} · {t("version")} {skill.version}</p>}
          <SkillDefinition key={code + ":" + (skill?.version ?? 0)} locale={locale} skill={skill} send={send} after={after} />
        </section>
      </div>
      {saved && <p role="status">{t("saved")}</p>}
      {data.history.length > 0 && <SettingsHistory title={t("recentChanges")}>
        <ul className="grid gap-3">{data.history.map((item) => <li className="break-words" key={item.at + item.code + item.version}>
          <span className="font-medium">{t(item.action)} · {item.code ?? t("settings")} · v{item.version}</span>
          <time className="block text-sm" dateTime={item.at}>{new Intl.DateTimeFormat(locale,{ dateStyle: "medium", timeStyle: "short" }).format(new Date(item.at))}</time>
          <p>{item.reason}</p>
        </li>)}</ul>
      </SettingsHistory>}
    </>}
  </section>;
}
