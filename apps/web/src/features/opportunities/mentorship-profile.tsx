"use client";

import Link from "next/link";
import { coordinationCopy } from "@/lib/mentorship-coordination-i18n";
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  mentorshipConsents, mentorshipRoles, volunteerDepartments, volunteerLanguages, volunteerLevels,
  type MentorshipConsent, type MentorshipOwnerView, type MentorshipPreferences, type MentorshipProfile,
  type MentorshipRole, type MentorshipSkill,
} from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { accountMessages } from "@/lib/account-i18n";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { mentorshipCopy } from "@/lib/mentorship-i18n";
import { opportunityCountries } from "@/lib/opportunity-countries";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { departmentNames, volunteerCopy } from "@/lib/volunteer-i18n";
import { OpportunityPageHeader, OpportunityState, opportunitySecondary, opportunityTag } from "./presentation";

const memberPath = "/api/v1/me/mentorship";
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const disclosure = "rounded-lg border border-[var(--theme-border)] p-3 sm:p-4";
const checkbox = "flex min-w-0 items-start gap-2 text-sm";
const inputs = "grid min-w-0 gap-4 sm:grid-cols-2";
const labelClass = "min-w-0 text-sm";
const consentLabel = (t: ReturnType<typeof mentorshipCopy>, role: MentorshipRole, purpose: MentorshipConsent) =>
  t(purpose === "recommendations" && role === "mentor" ? "menteeRecommendations" : purpose);

function useCommand(after: () => void) {
  const mutation = useFeedMutation();
  const receipt = useRef<{ body: string; id: string } | null>(null);
  function send(command: object) {
    const body = JSON.stringify(command);
    if (receipt.current?.body !== body) receipt.current = { body, id: crypto.randomUUID() };
    const requestId = receipt.current.id;
    return mutation.run(async () => {
      await authorizedSocialRequest(memberPath, { method: "PATCH", body: JSON.stringify({ ...command, requestId }) });
      receipt.current = null;
      after();
    });
  }
  return { ...mutation, send };
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className={disclosure + " grid min-w-0 gap-3"}>
    <legend className="px-1 text-base font-semibold">{title}</legend>
    {children}
  </fieldset>;
}

export function MentorshipProfileScreen() {
  const [locale] = useLocale();
  const t = mentorshipCopy(locale);
  const read = useCallback((signal: AbortSignal): Promise<MentorshipOwnerView> =>
    authorizedSocialRequest(memberPath, { cache: "no-store", signal }), []);
  const resource = useInstitutionResource(read);
  const [saved, setSaved] = useState(false);
  const data = resource.data;
  const roles = data?.profiles.filter(profile => profile.participation) ?? [];
  const roleSummary = roles.length === 2 ? "both" : roles[0]?.role ?? "neither";
  return <MemberShell><div className="grid min-w-0 gap-4">
    <OpportunityPageHeader title={t("title")} description={t("intro")}
      back={{ href: "/settings", label: accountMessages[locale].settings }} />
    <Link className={opportunitySecondary + " w-fit"} href="/settings/opportunities/mentorship/coordination">{coordinationCopy(locale)("title")}</Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!data && resource.error === null && <OpportunityState>{t("loading")}</OpportunityState>}
    {saved && <OpportunityState>{t("saved")}</OpportunityState>}
    {data && <>
      {!data.intake && <OpportunityState>{t("closed")}</OpportunityState>}
      <section className={institutionCard + " grid gap-3"}>
        <p className={opportunityTag}>{t(roleSummary)}</p>
        <p className="max-w-4xl text-sm leading-relaxed text-[var(--theme-body)]">{t("policy")}</p>
      </section>
      <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-2">
        {mentorshipRoles.map(role => {
          const profile = data.profiles.find(candidate => candidate.role === role);
          return <RolePanel key={role + (profile?.version ?? 0)} role={role} profile={profile} data={data}
            after={() => { resource.refresh(); setSaved(true); }} />;
        })}
      </div>
    </>}
  </div></MemberShell>;
}

function RolePanel({ role, data, profile, after }: {
  role: MentorshipRole; data: MentorshipOwnerView; profile?: MentorshipProfile; after: () => void;
}) {
  const [locale] = useLocale();
  const t = mentorshipCopy(locale);
  const v = volunteerCopy(locale);
  const [editing, setEditing] = useState(false);
  const command = useCommand(after);
  const allowed = data.intake && data.configuration.roles.includes(role) && (role === "mentee" || data.mentorIdentity)
    && data.configuration.modes.length > 0 && data.configuration.geographies.length > 0;
  const mutable = { role, expectedVersion: profile?.version ?? 0 };
  return <section className={institutionCard + " grid min-w-0 gap-4"}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold">{t(role)}</h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--theme-body)]">{t(role === "mentor" ? "mentorHelp" : "menteeHelp")}</p>
      </div>
      {profile && <span className={opportunityTag}>{profile.paused && profile.status === "unavailable" ? v("paused") : t(profile.status)}</span>}
    </header>
    {data.intake && role === "mentor" && !data.mentorIdentity && <OpportunityState>{t("identity")}</OpportunityState>}
    {data.intake && !data.configuration.roles.includes(role) && <OpportunityState>{t("unavailable")}</OpportunityState>}
    {allowed && <details className={disclosure} onToggle={event => setEditing(event.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold text-[var(--theme-link)]">{t(profile ? "edit" : "create")}</summary>
      {editing && <ProfileForm key={profile?.version ?? 0} role={role} profile={profile} data={data} after={after} />}
    </details>}
    {profile && <details className={disclosure}>
      <summary className="cursor-pointer font-semibold text-[var(--theme-link)]">{t("controls")}</summary>
      <div className="mt-3 grid gap-3">
        {profile.participation && (profile.paused ? allowed && profile.status !== "expired" && profile.status !== "incomplete" :
          profile.status !== "expired") &&
          <button type="button" className={opportunitySecondary + " w-fit"} disabled={command.busy}
            onClick={() => void command.send({ ...mutable, action: profile.paused ? "resume" : "pause" })}>
            {t(profile.paused ? "resume" : "pause")}
          </button>}
        {profile.participation && <form className="grid gap-2" onSubmit={event => {
          event.preventDefault();
          const purpose = field(new FormData(event.currentTarget), "purpose");
          void command.send({ ...mutable, action: "withdraw", ...(purpose ? { purpose } : {}) });
        }}>
          <p className="text-sm">{t("withdrawHelp")}</p>
          <label className={labelClass}>{t("withdraw")}
            <select name="purpose" className={institutionField}>
              <option value="">{t("allConsent")}</option>
              {mentorshipConsents.filter(purpose => profile.consent[purpose]).map(purpose =>
                <option key={purpose} value={purpose}>{consentLabel(t, role, purpose)}</option>)}
            </select>
          </label>
          <button className={opportunitySecondary + " w-fit"} disabled={command.busy}>{t("withdraw")}</button>
        </form>}
        {command.error !== null && <ApiErrorNotice error={command.error} signIn />}
      </div>
    </details>}
  </section>;
}

type SelectedSkill = { skill: MentorshipSkill; proficiency: MentorshipPreferences["skills"][number]["proficiency"]; imported?: boolean };

function ProfileForm({ profile, role, data, after }: {
  profile?: MentorshipProfile; role: MentorshipRole; data: MentorshipOwnerView; after: () => void;
}) {
  const [locale] = useLocale();
  const t = mentorshipCopy(locale);
  const common = opportunityCopy(locale);
  const v = volunteerCopy(locale);
  const searchInput = useRef<HTMLInputElement>(null);
  const configuration = data.configuration;
  const initial = profile?.preferences;
  const [mode, setMode] = useState(configuration.modes.includes(initial?.mode ?? "remote") ? initial?.mode ?? "remote" : configuration.modes[0]);
  const geographies = configuration.geographies.filter(value => value !== "worldwide_remote" || mode === "remote");
  const [geography, setGeography] = useState<MentorshipPreferences["geography"] | "">(
    initial?.geography && geographies.includes(initial.geography) ? initial.geography : "");
  const [topicFilter, setTopicFilter] = useState("");
  const [skills, setSkills] = useState<SelectedSkill[]>(() => initial?.skills.flatMap(selection => {
    const skill = profile?.skills.find(item => item.code === selection.code);
    return skill ? [{ skill, proficiency: selection.proficiency }] : [];
  }) ?? []);
  const [skillQuery, setSkillQuery] = useState<string | null>(null);
  const [countries, setCountries] = useState<string[]>(initial?.countries ?? []);
  const [countryToAdd, setCountryToAdd] = useState("");
  const [topics, setTopics] = useState<MentorshipPreferences["topics"]>(
    initial?.topics.filter(topic => configuration.topics.includes(topic)) ?? []);
  const command = useCommand(after);
  const search = useCallback((signal: AbortSignal): Promise<MentorshipSkill[]> => skillQuery === null
    ? Promise.resolve([]) : authorizedSocialRequest(memberPath + "/skills?" + new URLSearchParams({ q: skillQuery }), { signal, cache: "no-store" }), [skillQuery]);
  const catalog = useInstitutionResource(search);
  const displayNames = new Intl.DisplayNames([locale], { type: "region" });
  const languageNames = new Intl.DisplayNames([locale], { type: "language" });
  const countryOptions = opportunityCountries.filter(code => code !== "HT" && !countries.includes(code))
    .map(code => ({ code, name: displayNames.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, locale));

  function addSkill(skill: MentorshipSkill, imported = false) {
    setSkills(current => current.length >= 12 || current.some(item => item.skill.code === skill.code) ? current :
      [...current, { skill, proficiency: "beginner", imported }]);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const optional = (key: "summary" | "goals") => configuration.fields.includes(key) ? field(form, key) : initial?.[key] ?? "";
    const preferences = {
      topics, skills: skills.map(({ skill, proficiency }) => ({ code: skill.code, proficiency })),
      languages: volunteerLanguages.flatMap(code => {
        const proficiency = field(form, "language-" + code);
        return proficiency ? [{ code, proficiency }] : [];
      }),
      mode, geography, departments: geography === "haiti_departments" ? form.getAll("departments") : [],
      countries: geography === "international" ? countries : [],
      weeklyHours: Number(field(form, "weeklyHours")), sessionMinutes: Number(field(form, "sessionMinutes")),
      durationWeeks: Number(field(form, "durationWeeks")), capacity: role === "mentor" ? Number(field(form, "capacity")) : null,
      expiresOn: field(form, "expiresOn") || null, summary: optional("summary"), goals: optional("goals"),
      learningObjectives: role === "mentee" ? field(form, "learningObjectives") : "",
      experience: configuration.fields.includes("experience")
        ? field(form, "experience") ? Number(field(form, "experience")) : null : initial?.experience ?? null,
    };
    void command.send({ action: "save", role, expectedVersion: profile?.version ?? 0, preferences,
      adult: form.has("adult"), participation: form.has("participation"), safeguarding: form.has("safeguarding"),
      consent: Object.fromEntries(mentorshipConsents.map(purpose => [purpose, form.has(purpose)])),
      importSkills: skills.filter(item => item.imported).map(item => item.skill.code),
    });
  }
  return <form className="mt-4 grid min-w-0 gap-4" onSubmit={submit}>
    <Group title={t("topics")}>
      <label className={labelClass}>{t("topicSearch")}
        <input className={institutionField} type="search" maxLength={80} value={topicFilter}
          onChange={event => setTopicFilter(event.target.value)} />
      </label>
      <div className={inputs}>
        {configuration.topics.filter(topic => t(topic).toLocaleLowerCase(locale).includes(topicFilter.trim().toLocaleLowerCase(locale)))
          .map(topic => <label className={checkbox} key={topic}>
            <input type="checkbox" checked={topics.includes(topic)} disabled={!topics.includes(topic) && topics.length >= 8}
              onChange={event => setTopics(event.target.checked ? [...topics, topic] : topics.filter(value => value !== topic))} />
            {t(topic)}
          </label>)}
      </div>
      {role === "mentee" && <label className={labelClass}>{t("learningObjectives")}
        <textarea className={institutionField} name="learningObjectives" rows={3} maxLength={500} defaultValue={initial?.learningObjectives} />
      </label>}
      {configuration.fields.includes("summary") && <label className={labelClass}>{t("summary")}
        <textarea className={institutionField} name="summary" rows={3} maxLength={500} defaultValue={initial?.summary} />
      </label>}
      {configuration.fields.includes("goals") && <label className={labelClass}>{t("goals")}
        <textarea className={institutionField} name="goals" rows={3} maxLength={500} defaultValue={initial?.goals} />
      </label>}
      {configuration.fields.includes("experience") && <label className={labelClass}>{t("experience")}
        <input className={institutionField} name="experience" type="number" min={0} max={60} defaultValue={initial?.experience ?? ""} />
      </label>}
    </Group>
    <Group title={t("skills")}>
      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass + " flex-1 basis-48"}>{t("skillSearch")}
          <input className={institutionField} type="search" maxLength={80}
            onKeyDown={event => {
              if (event.key === "Enter") { event.preventDefault(); setSkillQuery(event.currentTarget.value.trim()); }
            }} ref={searchInput} />
        </label>
        <button type="button" className={opportunitySecondary} onClick={() => setSkillQuery(searchInput.current?.value.trim() ?? "")}>
          {t("skillSearch")}
        </button>
      </div>
      {catalog.error !== null && <ApiErrorNotice error={catalog.error} retry={catalog.refresh} signIn />}
      {skillQuery !== null && catalog.data?.length === 0 && <p className="text-sm">{t("noSkills")}</p>}
      {skillQuery !== null && <div className="flex flex-wrap gap-2">
        {catalog.data?.map(skill => <button type="button" key={skill.code} className={opportunitySecondary}
          disabled={skills.length >= 12 || skills.some(item => item.skill.code === skill.code)}
          onClick={() => addSkill(skill)}>{v("add")} {skill.names[locale]}</button>)}
      </div>}
      {data.volunteerSkills.length > 0 && <details className={disclosure}>
        <summary className="cursor-pointer font-semibold">{t("import")}</summary>
        <p className="my-2 text-sm">{t("importHelp")}</p>
        <div className="flex flex-wrap gap-2">
          {data.volunteerSkills.map(skill => <button key={skill.code} type="button" className={opportunitySecondary}
            disabled={skills.length >= 12 || skills.some(item => item.skill.code === skill.code)}
            onClick={() => addSkill(skill, true)}>{v("add")} {skill.names[locale]}</button>)}
        </div>
      </details>}
      {skills.length > 0 && <ul className="grid min-w-0 gap-2">{skills.map(({ skill, proficiency }) =>
        <li key={skill.code} className="flex flex-wrap items-end justify-between gap-2 rounded-md bg-[var(--theme-control)] p-3">
          <label className={labelClass}>{skill.names[locale]} · {t("proficiency")}
            {skill.status !== "active" && <span className="block text-xs">{t("retired")}</span>}
            <select className={institutionField} value={proficiency} disabled={skill.status !== "active"}
              onChange={event => setSkills(current => current.map(item => item.skill.code === skill.code ?
                { ...item, proficiency: event.target.value as SelectedSkill["proficiency"] } : item))}>
              {volunteerLevels.map(level => <option key={level} value={level}>{v(level)}</option>)}
            </select>
          </label>
          <button type="button" className={opportunitySecondary} onClick={() =>
            setSkills(current => current.filter(item => item.skill.code !== skill.code))}>{t("remove")} · {skill.names[locale]}</button>
        </li>)}</ul>}
    </Group>
    <Group title={t("languages")}>
      <div className={inputs}>{volunteerLanguages.map(code =>
        <label key={code} className={labelClass}>{code === "asl" ? v("asl") : languageNames.of(code)}
          <select className={institutionField} name={"language-" + code}
            defaultValue={initial?.languages.find(value => value.code === code)?.proficiency ?? ""}>
            <option value="">{v("blank")}</option>
            {volunteerLevels.map(level => <option key={level} value={level}>{v(level)}</option>)}
          </select>
        </label>)}</div>
    </Group>
    <Group title={t("availability")}>
      <div className={inputs}>
        {([
          ["weeklyHours", configuration.maxWeeklyHours, 1], ["sessionMinutes", configuration.maxSessionMinutes, 15],
          ["durationWeeks", configuration.maxDurationWeeks, 1], ...(role === "mentor" ? [["capacity", configuration.maxCapacity, 1] as const] : []),
        ] as const).map(([key, max, min]) =>
          <label className={labelClass} key={key}>{t(key)}
            <input className={institutionField} type="number" name={key} min={min} max={max} required
              defaultValue={Math.min(max, initial?.[key] ?? min)} />
          </label>)}
        <label className={labelClass}>{t("expiresOn")}
          <input className={institutionField} name="expiresOn" type="date" defaultValue={initial?.expiresOn ?? ""} />
        </label>
        <label className={labelClass}>{t("mode")}
          <select className={institutionField} value={mode} onChange={event => {
            const choice = event.target.value as MentorshipPreferences["mode"];
            setMode(choice);
            if (choice !== "remote" && geography === "worldwide_remote") setGeography("");
          }}>
            {configuration.modes.map(value => <option key={value} value={value}>{common(value)}</option>)}
          </select>
        </label>
        <label className={labelClass}>{t("geography")}
          <select className={institutionField} required value={geography} onChange={event =>
            setGeography(event.target.value as MentorshipPreferences["geography"] | "")}>
            <option value="">{v("blank")}</option>
            {geographies.map(value => <option key={value} value={value}>{t(value)}</option>)}
          </select>
        </label>
      </div>
      <fieldset hidden={geography !== "haiti_departments"} className={inputs}>
        <legend className="pb-2 text-sm font-semibold">{t("departments")}</legend>
        {volunteerDepartments.map((code, index) => <label key={code} className={checkbox}>
          <input type="checkbox" value={code} name="departments" defaultChecked={initial?.departments.includes(code)} />{departmentNames[index]}
        </label>)}
      </fieldset>
      {geography === "international" && <div className="grid gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className={labelClass + " flex-1 basis-48"}>{t("countries")}
            <select className={institutionField} value={countryToAdd} onChange={event => setCountryToAdd(event.target.value)}>
              <option value="">{v("blank")}</option>
              {countryOptions.map(({code,name}) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
          <button className={opportunitySecondary} type="button" disabled={!countryToAdd || countries.length >= 10}
            onClick={() => { setCountries([...countries, countryToAdd]); setCountryToAdd(""); }}>{v("add")}</button>
        </div>
        <div className="flex flex-wrap gap-2">{countries.map(code => <button type="button" key={code} className={opportunitySecondary}
          onClick={() => setCountries(countries.filter(value => value !== code))}>{t("remove")} · {displayNames.of(code)}</button>)}</div>
      </div>}
    </Group>
    <Group title={t("privacy")}>
      <p className="text-sm">{t("privacyHelp")}</p>
      {!data.nativeDiscovery && <p className="text-sm">{t("nativePrivacy")}</p>}
      {mentorshipConsents.map(purpose => <label key={purpose} className={checkbox}>
        <input type="checkbox" name={purpose} defaultChecked={profile?.consent[purpose]} />{consentLabel(t, role, purpose)}
      </label>)}
      <div className="grid gap-2 border-t border-[var(--theme-border)] pt-3">
        <label className={checkbox}><input type="checkbox" name="adult" required defaultChecked={profile?.adult} />{t("adult")}</label>
        <p className="text-sm text-[var(--theme-body)]">{t("ageNotice")}</p>
        <label className={checkbox}><input type="checkbox" name="participation" required defaultChecked={profile?.participation} />{t("participation")}</label>
        <label className={checkbox}><input type="checkbox" name="safeguarding" required defaultChecked={profile?.safeguarding} />{t("safeguarding")}</label>
      </div>
    </Group>
    {command.error !== null && <ApiErrorNotice error={command.error} signIn />}
    <button className={institutionAction + " w-fit"} disabled={command.busy}>{t("save")}</button>
  </form>;
}
