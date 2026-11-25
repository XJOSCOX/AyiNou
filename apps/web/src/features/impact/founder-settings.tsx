"use client";

import { useCallback, useState } from "react";
import { impactSectors, locales, impactDepartments, type ImpactDefinition, type ImpactOverview } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { fetchDepartments } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { changeFounderImpact, loadFounderImpact } from "@/lib/impact-api";
import { impactCopy } from "@/lib/impact-i18n";
import { useLocale } from "@/lib/locale-store";
import { outcomeMessages } from "@/lib/project-outcome-i18n";
import { ReviewCommand, useReviewCopy } from "../projects/outcome-review/review-controls";
import { impactReceipt } from "./member-controls";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
type Command = { send: (body: string) => Promise<unknown>; after: () => void };
const languageNames = { en: "English", ht: "Kreyòl ayisyen", fr: "Français", es: "Español" };
const definitionFields = { names: "name", descriptions: "description", methods: "method", units: "unit" } as const;
const flags = { enabled: "enabled", measurements: "measurements", needs: "includeNeeds", links: "includeLinks" } as const;

function DefinitionDraft({ selected, send, after }: Command & { selected?: ImpactDefinition }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  return <ReviewCommand {...impactReceipt} action="define" label={t("define")} version={selected?.version ?? 0}
    send={send} after={after} input={(form) => ({
      code: text(form, "code"), sector: text(form, "sector"), unit: text(form, "unit"),
      methodologyCode: text(form, "methodologyCode"), classification: text(form, "classification"),
      privacy: text(form, "privacy"), aggregatable: form.has("aggregatable"),
      ...Object.fromEntries(Object.keys(definitionFields).map((field) =>
        [field, Object.fromEntries(locales.map((lang) => [lang, text(form, field + "-" + lang)]))])),
    })}>
    <div className="grid gap-2 sm:grid-cols-2">
      <label>{t("measurementCode")}<input name="code" className={institutionField} required minLength={3} maxLength={40}
        defaultValue={selected?.code} readOnly={!!selected} /></label>
      <label>{t("sector")}<select name="sector" className={institutionField} defaultValue={selected?.sector}>
        {impactSectors.filter((item) => !selected || item === selected.sector).map((item) =>
          <option key={item} value={item}>{t(item)}</option>)}
      </select></label>
      <label>{t("unit")}<input name="unit" className={institutionField} required minLength={2} maxLength={24} defaultValue={selected?.unit} /></label>
      <label>{t("methodCode")}<input name="methodologyCode" className={institutionField} required minLength={5} maxLength={64}
        defaultValue={selected?.methodologyCode} /></label>
      <label>{t("class")}<select name="classification" className={institutionField} defaultValue={selected?.classification}>
        <option value="output">{outcomeMessages[locale].output}</option><option value="outcome">{outcomeMessages[locale].outcome}</option>
      </select></label>
      <label>{t("privacy")}<select name="privacy" className={institutionField} defaultValue={selected?.privacy}>
        <option value="public_nonsensitive">{t("publicSafe")}</option><option value="restricted">{t("private")}</option>
      </select></label>
    </div>
    <p className="text-sm">{t("codeHelp")}</p>
    <label className="flex items-start gap-2"><input type="checkbox" name="aggregatable" defaultChecked={selected?.aggregatable} />{t("allowTotal")}</label>
    <div className="grid gap-3 xl:grid-cols-2">
      {locales.map((lang) => <fieldset key={lang} className="grid gap-2 rounded-md border border-[var(--theme-border)] p-3">
        <legend className="px-1 font-medium" lang={lang}>{languageNames[lang]}</legend>
        {Object.entries(definitionFields).map(([field, label]) => (
          <label key={field}>{t(label)}<input name={field + "-" + lang} className={institutionField} required maxLength={500}
            defaultValue={selected?.[field as keyof typeof definitionFields][lang]} /></label>
        ))}
      </fieldset>)}
    </div>
  </ReviewCommand>;
}

function Catalog({ data, send, after }: Command & { data: ImpactOverview }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const [selected, select] = useState("");
  const latest = Array.from(new Map(data.catalog.slice().reverse().map((definition) => [definition.code, definition])).values())
    .sort((first, second) => first.code.localeCompare(second.code));
  const draft = latest.find((item) => item.code === selected);
  return <section className={institutionCard + " grid gap-3"}>
    <h3 className="text-lg font-semibold">{t("definitions")}</h3>
    <label>{t("measurementCode")}<select className={institutionField} value={selected} onChange={(event) => select(event.target.value)}>
      <option value="">{t("define")}</option>
      {latest.map((item) => <option value={item.code} key={item.code}>{item.names[locale]} · v{item.version} · {t(item.status)}</option>)}
    </select></label>
    <DefinitionDraft key={selected + (draft?.version ?? 0)} selected={draft} send={send} after={after} />
    {draft && draft.status !== "retired" && <ReviewCommand {...impactReceipt} action="retire_definition" label={t("retire")}
      version={draft.version} send={send} after={after} input={() => ({ code: draft.code })} />}
  </section>;
}

export function FounderImpact({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const { t: review } = useReviewCopy();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState("");
  const resource = useInstitutionResource(useCallback((signal: AbortSignal) =>
    loadFounderImpact(workspace, search, signal), [workspace, search]));
  const departments = useInstitutionResource(fetchDepartments);
  const data = resource.data;
  if (apiErrorCode(resource.error) === "IMPACT_DISABLED") return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t("settings")}</h2><p className="mt-2" role="status">{t("closed")}</p>
  </section>;
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  if (!data) return <ProjectLoading cards={1} className="grid" />;
  const settings = data.settings;
  const send = (body: string) => changeFounderImpact(workspace, body);
  const common = { ...impactReceipt, send, after: resource.refresh };
  const previousYear = new Date().getFullYear() - 1;
  const years = Array.from({ length: Math.max(0, previousYear - 2019) }, (_, index) => previousYear - index);
  const selectedGrant = data.grants.find((item) => item.id === target);
  return <div className="grid min-w-0 gap-4">
    <section className={institutionCard + " grid gap-3"}>
      <h2 className="text-xl font-semibold">{t("settings")}</h2>
      <p>{t("limits")}</p>
      <ReviewCommand {...common} key={settings?.version ?? 0} action="configure" label={t("configure")} version={settings?.version ?? 0}
        input={(form) => ({ ...Object.fromEntries(Object.keys(flags).map((flag) => [flag, form.has(flag)])),
          years: form.getAll("years").map(Number), sectors: form.getAll("sectors"), departments: form.getAll("departments") })}>
        <div className="grid gap-3 xl:grid-cols-3">
          <fieldset className="grid content-start gap-2"><legend className="font-semibold">{t("year")}</legend>
            {years.map((year) => <label className="flex gap-2" key={year}><input type="checkbox" name="years" value={year}
              defaultChecked={settings?.years.includes(year) ?? year === previousYear} />{year}</label>)}
          </fieldset>
          <fieldset className="grid content-start gap-2"><legend className="font-semibold">{t("sector")}</legend>
            {impactSectors.map((item) => <label className="flex gap-2" key={item}><input type="checkbox" name="sectors" value={item}
              defaultChecked={settings?.sectors.includes(item) ?? true} />{t(item)}</label>)}
          </fieldset>
          <fieldset className="grid content-start gap-2"><legend className="font-semibold">{t("department")}</legend>
            {impactDepartments.map((item) => <label className="flex gap-2" key={item}><input type="checkbox" name="departments" value={item}
              defaultChecked={settings?.departments.includes(item) ?? true} />{departments.data?.find((value) => value.code === item)?.name ?? item}</label>)}
          </fieldset>
        </div>
        {(Object.entries(flags) as [keyof typeof flags, typeof flags[keyof typeof flags]][]).map(([flag, label]) =>
          <label className="flex gap-2" key={flag}><input type="checkbox" name={flag} defaultChecked={settings?.[flag] ?? false} />{t(label)}</label>)}
      </ReviewCommand>
    </section>
    <Catalog data={data} send={send} after={resource.refresh} />
    <section className={institutionCard + " grid gap-3"}>
      <h3 className="text-lg font-semibold">{t("grants")}</h3>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
        event.preventDefault(); const query = text(new FormData(event.currentTarget), "search");
        setTarget(""); if (query === search) resource.refresh(); else setSearch(query);
      }}>
        <label className="min-w-0 flex-1">{review.search}<input name="search" type="search" required minLength={2} maxLength={60}
          className={institutionField} /></label>
        <button className={institutionAction}>{review.searchButton}</button>
      </form>
      {!!data.candidates.length && <label>{review.target}<select className={institutionField} value={target} onChange={(event) => setTarget(event.target.value)}>
        <option value="">{review.noOption}</option>
        {data.candidates.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
      </select></label>}
      {target && <ReviewCommand {...common} key={target + (selectedGrant?.version ?? 0)} action="grant" label={review.actions.grant}
        version={selectedGrant?.version ?? 0} input={(form) => ({ target, expiresAt: new Date(text(form, "expiry")).toISOString() })}>
        <label>{review.expiry}<input className={institutionField} name="expiry" type="datetime-local" required /></label>
      </ReviewCommand>}
      {data.grants.map((grant) => <div className="grid gap-2 rounded-md border border-[var(--theme-border)] p-3" key={grant.id}>
        <p>{grant.label} · {grant.revoked ? review.revoked : new Date(grant.expiresAt).toLocaleString(locale)}</p>
        {!grant.revoked && <ReviewCommand {...common} key={grant.version} action="revoke" label={review.actions.revoke}
          version={grant.version} input={() => ({ target: grant.id })} />}
      </div>)}
    </section>
    {settings?.enabled && <section className={institutionCard + " grid gap-3"}>
      <h3 className="text-lg font-semibold">{t("propose")}</h3>
      {settings.years.flatMap((year) => settings.sectors.map((sector) => {
        const release = data.releases.find((item) => item.sector === sector && item.year === year);
        return <div className="grid gap-2 rounded-md border border-[var(--theme-border)] p-3" key={year + sector}>
          <p className="font-medium">{year} · {t(sector)}{release && " · " + t(release.state)}</p>
          {release?.state !== "sealed" && release?.state !== "suppressed" &&
            <ReviewCommand {...common} key={release?.version ?? 0} action="propose_report" label={t("propose")}
              version={release?.version ?? 0} input={() => ({ year, scope: sector })} />}
        </div>;
      }))}
    </section>}
    {!!data.history.length && <section className={institutionCard}>
      <details><summary className="cursor-pointer font-semibold">{review.history}</summary>
        <ol className="mt-3 grid gap-3">{data.history.map((event) => <li key={event.at + event.action} className="break-words">
          <time dateTime={event.at}>{new Date(event.at).toLocaleString(locale)}</time> · v{event.version}
          <p>{event.reason}</p>
        </li>)}</ol>
      </details>
    </section>}
  </div>;
}
