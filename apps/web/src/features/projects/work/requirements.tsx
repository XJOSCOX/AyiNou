"use client";

import { useCallback, useRef, useState } from "react";
import { requirementPriorities, volunteerLanguages, volunteerLevels, volunteerModes,
  type Locale, type OpportunityRequirements, type OpportunityRequirementsView, type OpportunityRequirementRevision,
  type ProjectWork } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { ProjectDisclosure } from "@/components/project-ui";

import { volunteerDepartments } from "@ayinou/shared";
import { useFeedMutation } from "@/lib/feed-state";
import { changeOpportunityRequirements, loadOpportunityRequirements } from "@/lib/requirement-api";
import { requirementCopy } from "@/lib/requirement-i18n";
import { departmentNames, volunteerCopy } from "@/lib/volunteer-i18n";
import { useWorkMessages } from "./work-controls";

type View = Extract<OpportunityRequirementsView,{ state:"fixture" }>;
type Item = View["items"][number];
type Opportunity = ProjectWork["opportunities"][number];
const button = institutionLink + " min-h-10 w-fit";
const group = "grid min-w-0 gap-2 rounded-lg border border-[var(--theme-border)] p-3";
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
const departmentName = (code: View["department"]) => code && departmentNames[volunteerDepartments.indexOf(code)];

export function useRequirements(id: string) {
  const loader = useCallback((signal: AbortSignal) => loadOpportunityRequirements(id,signal),[id]);
  return useInstitutionResource(loader);
}

export function RequirementPreview({ revision, locale }: { revision: OpportunityRequirementRevision; locale: Locale }) {
  const t = requirementCopy(locale), v = volunteerCopy(locale);
  const languageNames = new Intl.DisplayNames([locale],{ type:"language",fallback:"code" });
  return <div className="grid gap-2 text-sm">
    <p>{departmentName(revision.department)} · {v(revision.mode)} · {v("version")} {revision.version}</p>
    {revision.beginnerFriendly && <p>{t("beginnerFriendly")}</p>}
    {revision.screening && <p><strong>{t("screening")}</strong> · {t("screeningHelp")}</p>}
    <ul className="grid gap-1">
      {revision.skills.map((skill) => <li className="break-words" key={skill.code}>
        <strong>{skill.names[locale]}</strong> · {t(skill.priority)}{skill.proficiency && " · " + v(skill.proficiency)}
        {skill.experienceMin !== null && " · " + t("minimum") + " " + skill.experienceMin}
        {skill.experienceMax !== null && " · " + t("maximum") + " " + skill.experienceMax}
      </li>)}
      {revision.languages.map((language) => <li key={language.code}>{language.code === "asl" ? v("asl") : languageNames.of(language.code)}
        {" · "}{t(language.priority)}{language.proficiency && " · " + v(language.proficiency)}</li>)}
    </ul>
    {(revision.hoursPerWeek !== null || revision.durationWeeks !== null) && <dl className="flex flex-wrap gap-x-4">
      {revision.hoursPerWeek !== null && <div><dt className="inline font-medium">{t("hours")} · </dt><dd className="inline">{revision.hoursPerWeek}</dd></div>}
      {revision.durationWeeks !== null && <div><dt className="inline font-medium">{t("weeks")} · </dt><dd className="inline">{revision.durationWeeks}</dd></div>}
    </dl>}
  </div>;
}

function initial(opportunity: Opportunity, view: View, item: Item): OpportunityRequirements {
  const previous = item.draft ?? item.published;
  if (previous) {
    const { mode,hoursPerWeek,durationWeeks,beginnerFriendly,screening,languages,skills } = previous;
    const fields = view.settings.fields;
    return { mode,hoursPerWeek,durationWeeks,beginnerFriendly,screening:fields.includes("screening") && screening,
      languages:fields.includes("languages") ? languages : [],
      skills:skills.map(({ code,priority,proficiency,experienceMin,experienceMax }) => ({
        code,priority,proficiency,experienceMin:fields.includes("experience") ? experienceMin : null,
        experienceMax:fields.includes("experience") ? experienceMax : null,
      })) };
  }
  const mode = opportunity.remote ? (view.settings.modes.includes("remote") ? "remote" : "hybrid") : "on_site";
  return { mode, skills:[], languages:[], hoursPerWeek:null, durationWeeks:null, beginnerFriendly:false, screening:false };
}

function Editor({ opportunity, view, item, send, busy }: {
  opportunity: Opportunity; view: View; item: Item; busy: boolean; send: (body: OpportunityRequirements) => void;
}) {
  const { locale } = useWorkMessages();
  const t = requirementCopy(locale), v = volunteerCopy(locale);
  const [draft, set] = useState(() => initial(opportunity,view,item));
  const [query, search] = useState("");
  const [languageCode, selectLanguage] = useState("");
  const update = (value: Partial<OpportunityRequirements>) => set((previous) => ({ ...previous,...value }));
  const fields = view.settings.fields;
  const skills = view.catalog.filter((skill) => !draft.skills.some((item) => item.code === skill.code) &&
    [skill.names[locale],skill.code,...skill.aliases].some((label) => normalize(label).includes(normalize(query.trim()))));
  const display = new Intl.DisplayNames([locale],{ type:"language",fallback:"code" });
  const languageName = (code: string) => code === "asl" ? v("asl") : display.of(code) ?? code;
  const number = (input: HTMLInputElement) => input.value === "" ? null : input.valueAsNumber;
  const modes = volunteerModes.filter((item) => (item !== "on_site") === opportunity.remote && view.settings.modes.includes(item));
  return <form className="grid gap-3" onSubmit={(event) => {
    event.preventDefault();
    if (!busy && modes.includes(draft.mode)) send(draft);
  }}>
    <p>{t("scope")} · {departmentName(view.department)}</p>
    <div className="grid gap-3 md:grid-cols-3">
      <label>{v("mode")}<select className={institutionField} value={draft.mode} required onChange={(event) => update({ mode:event.target.value as OpportunityRequirements["mode"] })}>
        {!modes.includes(draft.mode) && <option value={draft.mode} disabled>{v("blank")}</option>}
        {modes.map((mode) => <option value={mode} key={mode}>{v(mode)}</option>)}
      </select></label>
      <label>{t("hours")}<input className={institutionField} type="number" min={1} max={40} value={draft.hoursPerWeek ?? ""}
        onChange={(event) => update({ hoursPerWeek:number(event.target) })} /></label>
      <label>{t("weeks")}<input className={institutionField} type="number" min={1} max={52} value={draft.durationWeeks ?? ""}
        onChange={(event) => update({ durationWeeks:number(event.target) })} /></label>
    </div>
    <label className="flex items-start gap-2"><input type="checkbox" checked={draft.beginnerFriendly}
      onChange={(event) => update({ beginnerFriendly:event.target.checked })} />{t("beginnerFriendly")}</label>
    {fields.includes("screening") && <label className="flex items-start gap-2"><input type="checkbox" checked={draft.screening}
      onChange={(event) => update({ screening:event.target.checked })} />{t("screening")}</label>}
    <fieldset className={group}>
      <legend className="px-1">{v("skills")}</legend>
      <label>{v("search")}<input className={institutionField} type="search" value={query} onChange={(event) => search(event.target.value)} /></label>
      <ul className="grid max-h-40 gap-1 overflow-auto">{skills.map((skill) => <li key={skill.code} className="flex flex-wrap items-center justify-between gap-2">
        <span>{skill.names[locale]}</span><button type="button" className={button} aria-label={v("add") + " " + skill.names[locale]}
          disabled={draft.skills.length>=view.settings.maxSkills}
          onClick={() => update({ skills:[...draft.skills,{ code:skill.code,priority:"preferred",proficiency:null,experienceMin:null,experienceMax:null }] })}>{v("add")}</button>
      </li>)}</ul>
      {draft.skills.map((skill) => {
        const name = view.catalog.find((item) => item.code === skill.code)?.names[locale] ??
          (item.draft ?? item.published)?.skills.find((item) => item.code === skill.code)?.names[locale] ?? skill.code;
        const change = (patch: Partial<typeof skill>) => update({ skills:draft.skills.map((entry) => entry.code===skill.code ? { ...entry,...patch } : entry) });
        return <fieldset key={skill.code} className={group}>
          <legend className="px-1">{name}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label>{t("classification")}<select className={institutionField} value={skill.priority}
              onChange={(event) => change({ priority:event.target.value as typeof skill.priority })}>
              {requirementPriorities.map((priority) => <option key={priority} value={priority}>{t(priority)}</option>)}</select></label>
            <label>{v("proficiency")}<select className={institutionField} value={skill.proficiency ?? ""}
              onChange={(event) => change({ proficiency:(event.target.value || null) as typeof skill.proficiency })}>
              <option value="">{v("blank")}</option>{volunteerLevels.map((level) => <option key={level} value={level}>{v(level)}</option>)}</select></label>
            {fields.includes("experience") && <>
              <label>{t("minimum")}<input className={institutionField} type="number" min={0} max={skill.experienceMax ?? 60}
                value={skill.experienceMin ?? ""} onChange={(event) => change({ experienceMin:number(event.target) })} /></label>
              <label>{t("maximum")}<input className={institutionField} type="number" min={skill.experienceMin ?? 0} max={60}
                value={skill.experienceMax ?? ""} onChange={(event) => change({ experienceMax:number(event.target) })} /></label>
            </>}
          </div>
          <button type="button" className={button} aria-label={v("remove") + " " + name}
            onClick={() => update({ skills:draft.skills.filter((item) => item.code!==skill.code) })}>{v("remove")}</button>
        </fieldset>;
      })}
    </fieldset>
    {fields.includes("languages") && <fieldset className={group}>
      <legend className="px-1">{v("languages")}</legend>
      {draft.languages.map((language) => {
        const change = (patch: Partial<typeof language>) => update({ languages:draft.languages.map((item) =>
          item.code===language.code ? { ...item,...patch } : item) });
        return <fieldset key={language.code} className={group}>
          <legend className="px-1">{languageName(language.code)}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label>{t("classification")}<select className={institutionField} value={language.priority}
              onChange={(event) => change({ priority:event.target.value as typeof language.priority })}>
              {requirementPriorities.map((priority) => <option key={priority} value={priority}>{t(priority)}</option>)}</select></label>
            <label>{v("proficiency")}<select className={institutionField} value={language.proficiency ?? ""}
              onChange={(event) => change({ proficiency:(event.target.value || null) as typeof language.proficiency })}>
              <option value="">{v("blank")}</option>{volunteerLevels.map((level) => <option key={level} value={level}>{v(level)}</option>)}</select></label>
          </div>
          <button type="button" className={button} aria-label={v("remove") + " " + languageName(language.code)}
            onClick={() => update({ languages:draft.languages.filter((item) => item.code!==language.code) })}>{v("remove")}</button>
        </fieldset>;
      })}
      <label>{v("language")}<select className={institutionField} value={languageCode} onChange={(event) => selectLanguage(event.target.value)}>
        <option value="">{v("blank")}</option>
        {volunteerLanguages.filter((code) => !draft.languages.some((item) => item.code===code)).map((code) =>
          <option key={code} value={code}>{languageName(code)}</option>)}</select></label>
      <button type="button" className={button} aria-label={v("add") + " " + v("language")}
        disabled={!languageCode || draft.languages.length>=view.settings.maxLanguages} onClick={() => {
          const code = volunteerLanguages.find((code) => code===languageCode);
          if (code) update({ languages:[...draft.languages,{ code,priority:"preferred",proficiency:null }] });
          selectLanguage("");
        }}>{v("add")}</button>
    </fieldset>}
    <button className={institutionAction + " justify-self-start"} disabled={busy || !modes.includes(draft.mode)}>{t("save")}</button>
  </form>;
}

export function RequirementCard({ view, project, opportunity, refresh }: { view: View; project: string; opportunity: Opportunity; refresh: () => void }) {
  const { locale,t: native } = useWorkMessages();
  const t = requirementCopy(locale), v = volunteerCopy(locale);
  const item = view.items.find((item) => item.opportunityId === opportunity.id);
  const mutation = useFeedMutation();
  const [saved, setSaved] = useState(false);
  const attempt = useRef<{ content: string; id: string } | null>(null);
  if (!item) return null;
  function submit(version: number, body: object) {
    const content = JSON.stringify({ ...body,expectedVersion:version });
    if (attempt.current?.content !== content) attempt.current = { content,id:crypto.randomUUID() };
    const requestId = attempt.current.id;
    void mutation.run(async () => {
      await changeOpportunityRequirements(project,opportunity.id,JSON.stringify({ ...body,expectedVersion:version,requestId }));
      attempt.current=null;
      setSaved(true);
      refresh();
    });
  }
  return <div className={group}>
    <h4 className="font-semibold">{t("title")}</h4>
    <p className="text-sm">{t("intent")}</p>
    {item.published && <section className="grid gap-2"><h5 className="font-medium">{t("published")}</h5>
      <RequirementPreview revision={item.published} locale={locale} /></section>}
    {item.editable && <ProjectDisclosure title={t("edit")}>
      <Editor key={item.version} view={view} item={item} opportunity={opportunity} busy={mutation.busy}
        send={(requirements) => submit(item.version,{ action:"draft", requirements })} />
    </ProjectDisclosure>}
    {item.draft && <ProjectDisclosure title={t("draft") + " · " + v("version") + " " + item.draft.version}>
      <div className="grid gap-2">
        <h5 className="font-semibold">{t("preview")}</h5>
        <p className="break-words">{opportunity.title} · {t("unpaid")}</p>
        <p className="whitespace-pre-line break-words">{opportunity.description}</p>
        <p className="break-words">{native.skills} · {opportunity.skills}<br />{native.commitment} · {opportunity.commitment}</p>
        <p>{native.capacity} · {item.draft.capacity}
          {item.draft.deadline && <><br />{native.closesOn} · {item.draft.deadline}</>}</p>
        <RequirementPreview revision={item.draft} locale={locale} />
        {item.editable && <form key={item.version} className="grid gap-2" onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.busy) submit(item.version,{ action:"publish",confirmed:true });
        }}>
          <label className="flex items-start gap-2"><input type="checkbox" required />{t("confirm")}</label>
          <button className={institutionAction + " justify-self-start"} disabled={mutation.busy}>{t("publish")}</button>
        </form>}
      </div>
    </ProjectDisclosure>}
    {!item.editable && item.history.length>0 && <p className="text-sm">{t("frozen")}</p>}
    {item.history.length>0 && <ProjectDisclosure title={t("history")}>
      <ul className="grid gap-1 text-sm">{item.history.map((event) => <li key={event.version}>
        {t(event.action==="draft" ? "draft" : "published")} · v{event.version} · <time dateTime={event.at}>
          {new Intl.DateTimeFormat(locale,{ dateStyle:"medium",timeStyle:"short" }).format(new Date(event.at))}</time>
      </li>)}</ul>
    </ProjectDisclosure>}
    {saved && <p role="status">{v("saved")}</p>}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
  </div>;
}
