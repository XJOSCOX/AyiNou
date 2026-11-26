"use client";

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { locales, professionalOpportunityCategories, professionalOpportunityModes, volunteerDepartments, volunteerLevels,
  type OpportunityPreferenceSkill, type OpportunityPreferenceView } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { SettingsOptions } from "@/components/settings-disclosures";
import { useLocale } from "@/lib/locale-store";
import { mentorshipCopy } from "@/lib/mentorship-i18n";
import { discoveryOpportunityCopy } from "@/lib/opportunity-discovery-i18n";
import { publicationCopy } from "@/lib/opportunity-publication-i18n";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { volunteerCopy } from "@/lib/volunteer-i18n";
import { departmentLabel, regionOptions, type CatalogSkill } from "./discovery";
import { discoveryRead, useDiscoveryCommand } from "./discovery-api";
import { OpportunityPageHeader, OpportunityState, opportunitySecondary, opportunityTag } from "./presentation";

const periods = ["hour", "day", "week", "month", "year", "project"] as const;
const sources = ["volunteer", "mentor", "mentee"] as const;
type Source = typeof sources[number];
type ImportedSkill = CatalogSkill & OpportunityPreferenceSkill & { source: Source; version: number };
const readPreferences = (signal: AbortSignal) => discoveryRead<OpportunityPreferenceView>("/preferences", signal);
const readImports = (signal: AbortSignal) => discoveryRead<ImportedSkill[]>("/import", signal);

export function OpportunityPreferences() {
  const [locale] = useLocale();
  const t = discoveryOpportunityCopy(locale), p = publicationCopy(locale);
  const resource = useInstitutionResource(readPreferences);
  const data = resource.data;
  return <MemberShell><div className="grid min-w-0 gap-4">
    <OpportunityPageHeader title={t("preferences")} description={t("privateHelp")}
      back={{ href: "/opportunities", label: opportunityCopy(locale)("title") }} />
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!data && resource.error === null && <OpportunityState>{p("loading")}</OpportunityState>}
    {data?.enabled === false && <OpportunityState>{t("closed")}</OpportunityState>}
    {data?.enabled && <PreferenceEditor key={data.version} data={data} refresh={resource.refresh} />}
  </div></MemberShell>;
}

function PreferenceEditor({ data, refresh }: { data: OpportunityPreferenceView; refresh: () => void }) {
  const [locale] = useLocale();
  const t = discoveryOpportunityCopy(locale), p = publicationCopy(locale), o = opportunityCopy(locale);
  const m = mentorshipCopy(locale), v = volunteerCopy(locale);
  const command = useDiscoveryCommand(data.version, refresh);
  const [skills, setSkills] = useState(data.preferences.skills);
  const [skillNames, setSkillNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [source, setSource] = useState<Source>("volunteer");
  const [copied, setCopied] = useState<ImportedSkill[]>([]);
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [choice, setChoice] = useState("");
  const loadCatalog = useCallback((signal: AbortSignal) => keyword === null ? Promise.resolve([]) :
    discoveryRead<CatalogSkill[]>("/skills?" + new URLSearchParams({ q: keyword }), signal), [keyword]);
  const loadImports = useCallback((signal: AbortSignal) => preview ? readImports(signal) : Promise.resolve([]), [preview]);
  const catalog = useInstitutionResource(loadCatalog);
  const imports = useInstitutionResource(loadImports);
  const languages = new Intl.DisplayNames([locale], { type: "language" });
  const regions = regionOptions(locale).filter(region => data.scopes.includes(region.id === "HT" ? "haiti" : "international"));
  const fields = data.fields;
  const stored = data.preferences;
  const selectionCount = new Set([...skills, ...copied].map(item => item.code)).size;
  const legalChoices = data.consent ? [data.paused ? "resume" : "pause", "withdraw", "reset", "clear"] as const : ["opt_in", "reset", "clear"] as const;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.busy || selectionCount > 12 || (copied.length && !importConfirmed)) return;
    const form = new FormData(event.currentTarget);
    const amount = String(form.get("minimum") ?? "");
    const experience = String(form.get("experience") ?? "");
    const choose = (field: keyof typeof stored) => fields.includes(field) ? form.getAll(field) : [];
    void command.send({
      action: "save_preferences",
      expiresOn: form.get("expiresOn") || null,
      preferences: {
        types: choose("types"), interests: choose("interests"), skills: fields.includes("skills") ? skills : [],
        experience: experience ? Number(experience) : null,
        countries: choose("countries"), departments: choose("departments"), modes: choose("modes"), languages: choose("languages"),
        objectives: String(form.get("objectives") ?? "").trim(),
        compensation: amount ? { minimum: Number(amount), currency: form.get("currency"), period: form.get("period") } : null,
      },
      ...(copied.length ? { import: { source, version: copied[0].version, codes: copied.map(skill => skill.code), confirmed: true } } : {}),
    });
  }
  function picker(field: keyof typeof stored, label: string, options: { id: string; label: string }[]): ReactNode {
    if (!fields.includes(field) || !options.length) return null;
    const selected = stored[field] as string[];
    return <SettingsOptions title={label}>
      {options.map(({ id, label: name }) => <label key={id} className="flex items-start gap-2">
        <input type="checkbox" name={field} value={id} defaultChecked={selected.includes(id)} />{name}
      </label>)}
    </SettingsOptions>;
  }
  return <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
    <form onSubmit={save} className={institutionCard + " grid gap-4 text-sm"}>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {picker("types", o("type"), data.types.map(id => ({ id, label: o(id) })))}
        {picker("interests", o("category"), professionalOpportunityCategories.map(id => ({ id, label: o(id) })))}
        {fields.includes("countries") && <label>{o("country")}<select multiple size={8} className={institutionField}
          name="countries" defaultValue={stored.countries}>{regions.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>}
        <div className="grid content-start gap-3">
          {picker("departments", o("department"), data.scopes.includes("haiti") ? volunteerDepartments.map(id => ({ id, label: departmentLabel(id) })) : [])}
          {picker("modes", o("mode"), professionalOpportunityModes.map(id => ({ id, label: o(id) })))}
          {picker("languages", o("language"), locales.map(id => ({ id, label: languages.of(id) ?? id })))}
        </div>
      </div>
      {fields.includes("skills") && <SettingsOptions title={o("skills")}>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-28 flex-1">{t("search")}<input className={institutionField} type="search" maxLength={80}
              value={search} onChange={event => setSearch(event.target.value)} /></label>
            <button type="button" className={opportunitySecondary} onClick={() => setKeyword(search.trim())}>{t("search")}</button>
          </div>
          {catalog.error !== null && <ApiErrorNotice error={catalog.error} retry={catalog.refresh} />}
          {catalog.data?.filter(skill => !skills.some(selected => selected.code === skill.code)).map(skill =>
            <button className={opportunitySecondary + " w-fit"} type="button" key={skill.code} disabled={selectionCount >= 12}
              onClick={() => {
                setSkills([...skills, { code: skill.code, proficiency: "beginner" }]);
                setSkillNames({ ...skillNames, [skill.code]: skill.names[locale] ?? skill.code });
              }}>{t("add")} · {skill.names[locale] ?? skill.code}</button>)}
        </div>
        {skills.map(skill => <div className="grid items-end gap-2 py-2 sm:grid-cols-[1fr_auto]" key={skill.code}>
          <label>{skillNames[skill.code] ?? skill.code} · {m("proficiency")}
            <select className={institutionField} value={skill.proficiency} onChange={event => {
              const proficiency = event.target.value as OpportunityPreferenceSkill["proficiency"];
              setSkills(skills.map(item => item.code === skill.code ? { ...item, proficiency } : item));
            }}>{volunteerLevels.map(level => <option key={level} value={level}>{v(level)}</option>)}</select>
          </label>
          <button type="button" className={opportunitySecondary} onClick={() => setSkills(skills.filter(item => item.code !== skill.code))}>
            {t("remove")}<span className="sr-only"> {skillNames[skill.code] ?? skill.code}</span>
          </button>
        </div>)}
        <div className="mt-2 grid gap-2">
          <button type="button" className={opportunitySecondary + " w-fit"} aria-expanded={preview} onClick={() => setPreview(!preview)}>{t("import")}</button>
          {preview && <>
            <label>{t("import")}<select className={institutionField} value={source} onChange={event => {
              setSource(event.target.value as Source); setCopied([]); setImportConfirmed(false);
            }}>{sources.map(item => <option key={item} value={item}>{item === "volunteer" ? t(item) : m(item)}</option>)}</select></label>
            {imports.error !== null && <ApiErrorNotice error={imports.error} retry={imports.refresh} signIn />}
            {imports.data && !imports.data.some(item => item.source === source) && <p>{t("noImport")}</p>}
            {imports.data?.filter(item => item.source === source).map(item => <label key={item.code} className="flex items-start gap-2">
              <input type="checkbox" checked={copied.some(skill => skill.code === item.code)}
                disabled={selectionCount >= 12 && !copied.some(skill => skill.code === item.code) && !skills.some(skill => skill.code === item.code)}
                onChange={event => { setImportConfirmed(false); setCopied(event.target.checked ? [...copied, item] : copied.filter(skill => skill.code !== item.code)); }} />
              {item.names[locale] ?? item.code} · {v(item.proficiency)}
            </label>)}
            {copied.length > 0 && <label className="flex items-start gap-2">
              <input type="checkbox" checked={importConfirmed} onChange={event => setImportConfirmed(event.target.checked)} />{t("importConfirm")}
            </label>}
          </>}
        </div>
      </SettingsOptions>}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.includes("experience") && <label>{m("experience")}
          <input name="experience" type="number" min={0} max={60} defaultValue={stored.experience ?? ""} className={institutionField} />
        </label>}
        <label>{t("expired")}<input name="expiresOn" type="date" defaultValue={data.expiresOn ?? ""} className={institutionField} /></label>
      </div>
      {fields.includes("objectives") && <label>{t("objectives")}
        <textarea name="objectives" maxLength={500} rows={3} defaultValue={stored.objectives} className={institutionField} />
      </label>}
      {fields.includes("compensation") && <SettingsOptions title={p("compensation")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>{t("minimum")}<input name="minimum" type="number" min={1} max={99999999} defaultValue={stored.compensation?.minimum ?? ""} className={institutionField} /></label>
          <label>{t("currency")}<input name="currency" maxLength={3} minLength={3} pattern="[A-Z]{3}" placeholder="HTG"
            defaultValue={stored.compensation?.currency ?? ""} className={institutionField} /></label>
          <label>{p("compensationPeriod")}<select name="period" defaultValue={stored.compensation?.period ?? "month"} className={institutionField}>
            {periods.map(period => <option key={period} value={period}>{p(period)}</option>)}
          </select></label>
        </div>
      </SettingsOptions>}
      {command.error !== null && <ApiErrorNotice error={command.error} retry={refresh} signIn />}
      <button type="submit" className={institutionAction + " w-fit"} disabled={command.busy || (copied.length > 0 && !importConfirmed)}>{t("savePreferences")}</button>
    </form>
    <section className={institutionCard + " grid gap-3 text-sm"}>
      <h2 className="text-lg font-semibold">{t("forYou")}</h2>
      <span className={opportunityTag}>{t(data.consent ? data.paused ? "paused" : "active" : "personalization_disabled")}</span>
      <p>{t("consentHelp")}</p><p>{t("advisory")}</p>
      {legalChoices.map(action => <details className="rounded-md border border-[var(--theme-border)] p-3" key={action}>
        <summary className="cursor-pointer font-semibold" onClick={() => setChoice("")}>{t(action)}</summary>
        <label className="mt-2 flex items-start gap-2">
          <input type="checkbox" checked={choice === action} onChange={event => setChoice(event.target.checked ? action : "")} />{t("confirm")}
        </label>
        <button type="button" className={opportunitySecondary + " mt-2"} disabled={choice !== action || command.busy}
          onClick={() => void command.send({ action, confirmed: true })}>{t(action)}</button>
      </details>)}
      {command.error !== null && <ApiErrorNotice error={command.error} retry={refresh} signIn />}
    </section>
  </div>;
}
