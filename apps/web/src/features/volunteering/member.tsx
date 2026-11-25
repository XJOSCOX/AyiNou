"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { volunteerCategories, volunteerCommitments, volunteerDepartments, volunteerLanguages, volunteerLevels, volunteerModes,
  type Locale, type VolunteerConsent, type VolunteerOwnerView, type VolunteerProfile } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { ProjectLoading } from "@/components/project-ui";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { loadVolunteer, saveVolunteer } from "@/lib/volunteer-api";
import { volunteerCategory, volunteerCopy } from "@/lib/volunteer-i18n";

export const departmentNames = ["Artibonite","Centre","Grand’Anse","Nippes","Nord","Nord-Est","Nord-Ouest","Ouest","Sud","Sud-Est"];
const consentKeys = ["matching","discovery","profileDisplay"] as const;
const blank: VolunteerProfile = {
  version: 0, summary: "", skills: [], languages: [], mode: "remote", commitment: "occasional",
  departments: [], nationwide: false, availability: "paused", expiresOn: null,
  consent: { matching: false, discovery: false, profileDisplay: false },
};
const simplify = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const fieldset = "grid min-w-0 content-start gap-3 rounded-lg border border-[var(--theme-border)] p-4";
const button = institutionLink + " w-fit min-h-10";

function Editor({ data, locale, reload }: { data: VolunteerOwnerView; locale: Locale; reload: () => void }) {
  const t = volunteerCopy(locale);
  const [profile, set] = useState(data.profile ?? blank);
  const [query, search] = useState("");
  const [category, filter] = useState("");
  const [language, chooseLanguage] = useState("");
  const display = new Intl.DisplayNames([locale], { type: "language", fallback: "code" });
  const languageName = (code: string) => code === "asl" ? t("asl") : display.of(code) ?? code;
  const mutation = useFeedMutation();
  const receipt = useRef<{ command: string; requestId: string } | null>(null);
  const update = (next: Partial<VolunteerProfile>) => set((previous) => ({ ...previous, ...next }));
  const visible = data.catalog.filter((skill) => skill.status === "active" && data.settings.categories.includes(skill.category)
      && (!category || skill.category === category) && !profile.skills.some((item) => item.code === skill.code)
      && [skill.names[locale], skill.code, ...skill.aliases].some((value) => simplify(value).includes(simplify(query.trim()))));
  function send(action: "save" | "pause" | "withdraw", consentKey?: keyof VolunteerConsent) {
    if (mutation.busy) return;
    const { version, ...fields } = profile;
    const command = { action, expectedVersion: version, ...(action === "save" ? fields : {}), ...(consentKey ? { consentKey } : {}) };
    const content = JSON.stringify(command);
    if (receipt.current?.command !== content) receipt.current = { command: content, requestId: crypto.randomUUID() };
    const requestId = receipt.current.requestId;
    void mutation.run(async () => { await saveVolunteer(JSON.stringify({ ...command, requestId })); receipt.current = null; reload(); });
  }

  return <form className="grid min-w-0 gap-4" onSubmit={(event) => { event.preventDefault(); if (data.intake) send("save"); }}>
    {data.intake && <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <fieldset className={fieldset}>
        <legend className="px-1 font-semibold">{t("skills")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>{t("search")}<input type="search" className={institutionField} value={query} onChange={(event) => search(event.target.value)} /></label>
          <label>{t("category")}<select className={institutionField} value={category} onChange={(event) => filter(event.target.value)}>
            <option value="">{t("all")}</option>
            {volunteerCategories.filter((item) => data.settings.categories.includes(item)).map((item) => <option key={item} value={item}>{volunteerCategory(item,locale)}</option>)}
          </select></label>
        </div>
        <ul className="grid max-h-56 gap-1 overflow-auto">
          {visible.map((item) => <li className="flex flex-wrap items-center justify-between gap-2" key={item.code}>
            <span>{item.names[locale]}{item.descriptions && <span className="block text-sm">{item.descriptions[locale]}</span>}</span>
            <button className={button} type="button" aria-label={t("add") + " " + item.names[locale]} disabled={profile.skills.length >= 20}
              onClick={() => update({ skills: [...profile.skills,{ code: item.code, proficiency: "beginner", experience: null }] })}>{t("add")}</button>
          </li>)}
          {!visible.length && <li>{t("none")}</li>}
        </ul>
        {profile.skills.map((item) => {
          const name = data.catalog.find((skill) => skill.code === item.code)?.names[locale] ?? item.code;
          const updateSkill = (value: Partial<typeof item>) => update({ skills: profile.skills.map((selected) => selected.code === item.code ? { ...selected, ...value } : selected) });
          return <fieldset key={item.code} className={fieldset}>
            <legend className="px-1">{name}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label>{t("proficiency")}<select value={item.proficiency} className={institutionField}
                onChange={(event) => updateSkill({ proficiency: event.target.value as typeof item.proficiency })}>
                {volunteerLevels.map((level) => <option key={level} value={level}>{t(level)}</option>)}
              </select></label>
              {data.settings.fields.includes("experience") && <label>{t("experience")}<input type="number" min={0} max={60} value={item.experience ?? ""}
                className={institutionField} onChange={(event) => updateSkill({ experience: event.target.value === "" ? null : event.target.valueAsNumber })} /></label>}
            </div>
            <button className={button} type="button" aria-label={t("remove") + " " + name}
              onClick={() => update({ skills: profile.skills.filter((selected) => selected.code !== item.code) })}>{t("remove")}</button>
          </fieldset>;
        })}
        {data.settings.fields.includes("summary") && <label>{t("summary")}<textarea rows={3} maxLength={500} value={profile.summary}
          className={institutionField} onChange={(event) => update({ summary: event.target.value })} /></label>}
        {data.settings.fields.includes("languages") && <fieldset className={fieldset}>
          <legend className="px-1">{t("languages")}</legend>
          {profile.languages.map((item) => <div key={item.code} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label>{languageName(item.code)} · {t("proficiency")}<select value={item.proficiency} className={institutionField}
              onChange={(event) => update({ languages: profile.languages.map((selected) => selected.code === item.code ?
                { ...selected, proficiency: event.target.value as typeof item.proficiency } : selected) })}>
              {volunteerLevels.map((level) => <option key={level} value={level}>{t(level)}</option>)}
            </select></label>
            <button className={button} type="button" aria-label={t("remove") + " " + languageName(item.code)}
              onClick={() => update({ languages: profile.languages.filter((selected) => selected.code !== item.code) })}>{t("remove")}</button>
          </div>)}
          <label>{t("language")}<select value={language} className={institutionField} onChange={(event) => chooseLanguage(event.target.value)}>
            <option value="">{t("blank")}</option>
            {volunteerLanguages.filter((code) => !profile.languages.some((item) => item.code === code)).map((code) => <option key={code} value={code}>{languageName(code)}</option>)}
          </select></label>
          <button className={button} type="button" disabled={!language} aria-label={t("add") + " " + t("language")} onClick={() => {
            const code = volunteerLanguages.find((value) => value === language);
            if (code) update({ languages: [...profile.languages,{ code, proficiency: "beginner" }] });
            chooseLanguage("");
          }}>{t("add")}</button>
        </fieldset>}
      </fieldset>
      <div className="grid min-w-0 content-start gap-4">
        <fieldset className={fieldset}>
          <legend className="px-1 font-semibold">{t("availability")}</legend>
          <label>{t("availability")}<select value={profile.availability} className={institutionField}
            onChange={(event) => update({ availability: event.target.value as VolunteerProfile["availability"] })}>
            <option value="paused">{t("paused")}</option><option value="available">{t("available")}</option>
          </select></label>
          <label>{t("mode")}<select value={profile.mode} className={institutionField} onChange={(event) => update({ mode: event.target.value as VolunteerProfile["mode"] })}>
            {volunteerModes.map((mode) => <option key={mode} value={mode}>{t(mode)}</option>)}
          </select></label>
          <label>{t("commitment")}<select value={profile.commitment} className={institutionField}
            onChange={(event) => update({ commitment: event.target.value as VolunteerProfile["commitment"] })}>
            {volunteerCommitments.map((item) => <option key={item} value={item}>{t(item)}</option>)}
          </select></label>
          <label>{t("expiration")}<input type="date" value={profile.expiresOn ?? ""} className={institutionField}
            onChange={(event) => update({ expiresOn: event.target.value || null })} /></label>
          <fieldset className="grid gap-2">
            <legend className="font-medium">{t("departments")}</legend>
            <label className="flex items-center gap-2"><input type="checkbox" checked={profile.nationwide}
              onChange={(event) => update({ nationwide: event.target.checked, departments: [] })} />{t("nationwide")}</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {volunteerDepartments.map((code, index) => <label key={code} className="flex items-center gap-2">
                <input type="checkbox" disabled={profile.nationwide} checked={profile.nationwide || profile.departments.includes(code)}
                  onChange={(event) => update({ departments: event.target.checked ? [...profile.departments,code] : profile.departments.filter((item) => item !== code) })} />
                {departmentNames[index]}</label>)}
            </div>
          </fieldset>
        </fieldset>
        <fieldset className={fieldset}>
          <legend className="px-1 font-semibold">{t("privacy")}</legend>
          <p className="text-sm">{t("privacyHelp")}</p>
          {consentKeys.map((key) => <label key={key} className="flex items-start gap-2">
            <input type="checkbox" checked={profile.consent[key]} onChange={(event) => update({ consent: { ...profile.consent, [key]: event.target.checked } })} />{t(key)}
          </label>)}
        </fieldset>
      </div>
    </div>}
    {!data.intake && data.profile && <section className={fieldset}>
      <h2 className="font-semibold">{t("skills")}</h2>
      <ul>{profile.skills.map((item) => <li key={item.code}>{data.catalog.find((skill) => skill.code === item.code)?.names[locale] ?? item.code} · {t(item.proficiency)}</li>)}</ul>
      {profile.summary && <p className="break-words">{profile.summary}</p>}
      <h2 className="font-semibold">{t("privacy")}</h2>
      <p>{t("privacyHelp")}</p>
      {consentKeys.filter((key) => profile.consent[key]).map((key) => <div key={key} className="flex flex-wrap items-center gap-2">{t(key)}
        <button type="button" className={button} disabled={mutation.busy} onClick={() => send("withdraw",key)}>{t("revoke")}</button></div>)}
    </section>}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
    <div className="flex flex-wrap gap-3">
      {data.intake && <button className={institutionAction} disabled={mutation.busy}>{t("save")}</button>}
      {data.profile?.availability === "available" && <button className={button} type="button" disabled={mutation.busy} onClick={() => send("pause")}>{t("pause")}</button>}
      {data.profile && Object.values(data.profile.consent).some(Boolean) &&
        <button className={button} type="button" disabled={mutation.busy} onClick={() => send("withdraw")}>{t("withdraw")}</button>}
    </div>
  </form>;
}

export function MemberVolunteer() {
  const [locale] = useLocale();
  const t = volunteerCopy(locale);
  const resource = useInstitutionResource(loadVolunteer);
  const [saved, setSaved] = useState(false);
  return <MemberShell>
    <div className={institutionCard + " grid min-w-0 gap-4 p-4 sm:p-6"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-3xl font-bold">{t("title")}</h1><p className="mt-2 max-w-3xl">{t("intro")}</p></div>
        <Link href="/settings" className={button}>{t("settings")}</Link>
      </div>
      {!resource.data && resource.error === null && <ProjectLoading />}
      {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
      {resource.data && <><p className="font-medium" role="status">{t(resource.data.status)}</p>
        {!resource.data.intake && <p>{t("closed")}</p>}
        <p className="max-w-3xl text-sm">{t("integrity")}</p>
        <Editor key={resource.data.profile?.version ?? 0} data={resource.data} locale={locale}
          reload={() => { setSaved(true); resource.refresh(); }} />
        {saved && <p role="status">{t("saved")}</p>}
      </>}
    </div>
  </MemberShell>;
}
