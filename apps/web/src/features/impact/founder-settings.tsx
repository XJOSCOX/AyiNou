"use client";

import { useCallback, useState } from "react";
import { impactSectors, locales, impactDepartments, type ImpactDefinition, type ImpactOverview } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { fetchDepartments } from "@/lib/api";
import { changeFounderImpact, loadFounderImpact } from "@/lib/impact-api";
import { impactCopy } from "@/lib/impact-i18n";
import { impactPreparationCopy } from "@/lib/impact-preparation-copy";
import { useLocale } from "@/lib/locale-store";
import { outcomeMessages } from "@/lib/project-outcome-i18n";
import { ReviewCommand, useReviewCopy } from "../projects/outcome-review/review-controls";
import { impactReceipt } from "./member-controls";
import { ReviewerPreparation } from "./preparation";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
type Command = { send: (body: string) => Promise<unknown>; after: () => void };
const languageNames = { en: "English", ht: "Kreyòl ayisyen", fr: "Français", es: "Español" };
const definitionFields = { names: "name", descriptions: "description", methods: "method", units: "unit" } as const;
const flags = { measurements: "measurements", needs: "includeNeeds", links: "includeLinks" } as const;

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
  const copy = impactPreparationCopy(locale);
  const [selected, select] = useState("");
  const latest = Array.from(new Map(data.catalog.slice().reverse().map((definition) => [definition.code, definition])).values())
    .sort((first, second) => first.code.localeCompare(second.code));
  const draft = latest.find((item) => item.code === selected);
  return <section className={institutionCard + " grid gap-3"}>
    <h3 className="text-lg font-semibold">{t("definitions")}</h3>
    {data.catalog.length === 0 ? <p className="text-sm">{copy.definitionEmpty}</p> :
      <ul className="grid gap-2 sm:grid-cols-2">{data.catalog.map((definition) => (
        <li className="break-words rounded-md border border-[var(--theme-border)] p-3 text-sm" key={definition.code + definition.version}>
          <span className="font-semibold">{definition.names[locale]}</span> · v{definition.version} · {t(definition.status)}
          {definition.status === "draft" && <> · {copy.pending}</>}
        </li>
      ))}</ul>}
    <label>{t("measurementCode")}<select className={institutionField} value={selected} onChange={(event) => select(event.target.value)}>
      <option value="">{t("define")}</option>
      {latest.map((item) => <option value={item.code} key={item.code}>{item.names[locale]} · v{item.version} · {t(item.status)}</option>)}
    </select></label>
    <DefinitionDraft key={selected + (draft?.version ?? 0)} selected={draft} send={send} after={after} />
    {data.preparation?.fixtureOperations && draft && draft.status !== "retired" && <ReviewCommand {...impactReceipt} action="retire_definition" label={t("retire")}
      version={draft.version} send={send} after={after} input={() => ({ code: draft.code })} />}
  </section>;
}

export function FounderImpact({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const { t: review } = useReviewCopy();
  const copy = impactPreparationCopy(locale);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState("");
  const resource = useInstitutionResource(useCallback((signal: AbortSignal) =>
    loadFounderImpact(workspace, search, signal), [workspace, search]));
  const departments = useInstitutionResource(fetchDepartments);
  const data = resource.data;
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  if (!data) return <ProjectLoading cards={1} className="grid" />;
  const settings = data.settings;
  const fixtureOperations = data.preparation?.fixtureOperations === true;
  const departmentLabel = (code: string) => code === "national" ? t("national") :
    departments.data?.find((department) => department.code === code)?.name ?? code;
  const actionLabels: Record<string, string> = { configure: t("configure"), define: t("define"), plan_reviewer: copy.plan,
    grant: review.actions.grant, revoke: review.actions.revoke, retire_definition: t("retire"), approve_definition: copy.pending };
  const send = (body: string) => changeFounderImpact(workspace, body);
  const common = { ...impactReceipt, send, after: resource.refresh };
  const previousYear = new Date().getFullYear() - 1;
  const years = Array.from({ length: Math.max(0, previousYear - 2019) }, (_, index) => previousYear - index);
  const selectedGrant = data.grants.find((item) => item.id === target);
  return <div className="grid min-w-0 gap-4">
    <section className={institutionCard + " grid gap-3"}>
      <h2 className="text-xl font-semibold">{t("settings")}</h2>
      <p>{copy.explain}</p>
      <dl className="grid gap-3 rounded-md bg-[var(--theme-surface-muted)] sm:grid-cols-3">
        <div><dt className="text-sm">{copy.preparation}</dt><dd className="font-semibold">{copy.available}</dd></div>
        <div><dt className="text-sm">{copy.reporting}</dt><dd className="font-semibold">{settings ? copy.prepared : copy.empty}</dd></div>
        <div><dt className="text-sm">{t("title")}</dt><dd className="font-semibold" role="status">{fixtureOperations ? copy.fixture : copy.disabled}</dd></div>
      </dl>
      <div className="rounded-md border border-[var(--theme-border)] p-3">
        <h3 className="font-semibold">{copy.readiness}</h3><p className="mt-1 text-sm">{copy.requirements}</p>
      </div>
      <h3 className="font-semibold">{copy.reporting}</h3>
      <ReviewCommand {...common} key={settings?.version ?? 0} action="configure" label={t("configure")} version={settings?.version ?? 0}
        input={(form) => ({ ...Object.fromEntries(Object.keys(flags).map((flag) => [flag, form.has(flag)])),
          years: form.getAll("years").map(Number), sectors: form.getAll("sectors"), departments: form.getAll("departments") })}>
        <>
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
              defaultChecked={settings?.departments.includes(item) ?? true} />{departmentLabel(item)}</label>)}
          </fieldset>
        </div>
        {(Object.entries(flags) as [keyof typeof flags, typeof flags[keyof typeof flags]][]).map(([flag, label]) =>
          <label className="flex gap-2" key={flag}><input type="checkbox" name={flag} defaultChecked={settings?.[flag] ?? false} />{t(label)}</label>)}
        </>
      </ReviewCommand>
    </section>
    <Catalog data={data} send={send} after={resource.refresh} />
    {data.preparation && <ReviewerPreparation data={data.preparation} departmentLabel={departmentLabel} send={send} after={resource.refresh} />}
    {fixtureOperations && <section className={institutionCard + " grid gap-3"}>
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
    </section>}
    {fixtureOperations && settings?.enabled && <section className={institutionCard + " grid gap-3"}>
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
    <section className={institutionCard}>
      <h3 className="font-semibold">{review.history}</h3>
      {data.history.length === 0 ? <p className="mt-2 text-sm">{copy.noHistory}</p> :
        <ol className="mt-3 grid gap-3">{data.history.map((event) => <li key={event.at + event.action} className="break-words text-sm">
          <time dateTime={event.at}>{new Date(event.at).toLocaleString(locale)}</time> · {actionLabels[event.action] ?? review.history} · v{event.version}
          <p>{event.reason}</p>
        </li>)}</ol>}
    </section>
  </div>;
}
