"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { locales, professionalOpportunityCategories, professionalOpportunityModes, volunteerDepartments,
  type Locale, type OpportunityDiscoveryItem, type OpportunityDiscoveryPage, type OpportunityDiscoveryView } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionCard, institutionField, useInstitutionResource, VerifiedCheck } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { useLocale } from "@/lib/locale-store";
import { discoveryOpportunityCopy } from "@/lib/opportunity-discovery-i18n";
import { opportunityCountries } from "@/lib/opportunity-countries";
import { publicationCopy } from "@/lib/opportunity-publication-i18n";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { departmentNames } from "@/lib/volunteer-i18n";
import { discoveryRead, useDiscoveryCommand } from "./discovery-api";
import { ExternalDestination, InterestForm } from "./publication-panels";
import { OpportunityPageHeader, OpportunityState, opportunitySecondary, opportunityTag } from "./presentation";

const views = ["latest", "forYou", "saved"] as const;
const jobTypes = ["full_time", "part_time", "temporary", "contract", "seasonal"] as const;

export function Opportunities() {
  const [locale] = useLocale();
  const params = useSearchParams();
  const requested = params.get("view");
  const view = requested === "forYou" || requested === "saved" ? requested : "latest";
  const t = discoveryOpportunityCopy(locale);
  const title = opportunityCopy(locale)("title");
  return <MemberShell><div className="grid min-w-0 gap-4">
    <OpportunityPageHeader title={title} description={t("intro")}
      back={{ href: "/discover", label: discoveryMessages[locale].discover }} />
    <nav className={institutionCard + " flex flex-wrap items-center gap-2 !p-3"} aria-label={title}>
      {views.map(tab => <Link key={tab} href={tab === "latest" ? "/opportunities" : "/opportunities?view=" + tab}
        aria-current={tab === view ? "page" : undefined}
        className={opportunitySecondary + " aria-[current=page]:bg-[var(--theme-selected)]"}>{t(tab)}</Link>)}
      <Link className={opportunitySecondary + " sm:ms-auto"} href="/opportunities/preferences">{t("preferences")}</Link>
    </nav>
    <DiscoveryResults key={view} view={view} />
  </div></MemberShell>;
}

function DiscoveryResults({ view }: { view: OpportunityDiscoveryView }) {
  const [locale] = useLocale();
  const t = discoveryOpportunityCopy(locale), p = publicationCopy(locale);
  const [query, setQuery] = useState(view === "forYou" ? "sort=relevance" : "");
  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages.at(-1);
  const load = useCallback((signal: AbortSignal) => {
    const params = new URLSearchParams(query);
    params.set("view", view);
    if (cursor) params.set("cursor", cursor);
    return discoveryRead<OpportunityDiscoveryPage>("?" + params, signal);
  }, [query, cursor, view]);
  const resource = useInstitutionResource(load);
  const data = resource.data;
  const command = useDiscoveryCommand(data?.version ?? 0, resource.refresh);
  function filter(values: URLSearchParams) {
    setPages([]);
    setQuery(values.toString());
  }
  return <>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {command.error !== null && <ApiErrorNotice error={command.error} retry={resource.refresh} signIn />}
    {!data && resource.error === null && <OpportunityState>{p("loading")}</OpportunityState>}
    {data && data.state !== "available" && <OpportunityState>{t(data.state)}</OpportunityState>}
    {data?.state === "available" && <>
      {view !== "saved" && <DiscoveryFilters data={data} view={view} apply={filter} />}
      {data.items.length === 0 && <OpportunityState>{t(view === "saved" ? "emptySaved" : "empty")}</OpportunityState>}
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        {data.items.map(item => "unavailable" in item
          ? <article key={item.id} className={institutionCard + " grid items-start gap-3"}>
              <p>{t("unavailable")}</p>
              <button className={opportunitySecondary + " w-fit"} disabled={command.busy}
                onClick={() => void command.send({ action: "unsave", id: item.id })}>{t("unsave")}</button>
            </article>
          : <DiscoveryCard key={item.id + ":" + item.revision} item={item} view={view}
              busy={command.busy} send={input => void command.send(input)} />)}
      </div>
      {(cursor || data.next) && <nav className="flex flex-wrap gap-2" aria-label={t(view)}>
        {cursor && <button className={opportunitySecondary} onClick={() => setPages(pages.slice(0, -1))}>{t("previous")}</button>}
        {data.next && <button className={opportunitySecondary} onClick={() => setPages([...pages, data.next!])}>{t("next")}</button>}
      </nav>}
    </>}
  </>;
}

function DiscoveryFilters({ view, data, apply }: {
  view: OpportunityDiscoveryView; data: OpportunityDiscoveryPage; apply: (values: URLSearchParams) => void;
}) {
  const [locale] = useLocale();
  const t = discoveryOpportunityCopy(locale), o = opportunityCopy(locale), p = publicationCopy(locale);
  const [type, setType] = useState("");
  const [skillQuery, setSkillQuery] = useState<string | null>(null);
  const lookup = useCallback((signal: AbortSignal) => skillQuery === null ? Promise.resolve([]) :
    discoveryRead<CatalogSkill[]>("/skills?" + new URLSearchParams({ q: skillQuery }), signal), [skillQuery]);
  const skills = useInstitutionResource(lookup);
  const dimensions = data.dimensions ?? [];
  const supports = (field: NonNullable<OpportunityDiscoveryPage["dimensions"]>[number]) => dimensions.includes(field);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string" && value.trim()) values.set(key, value.trim());
    });
    apply(values);
  }
  function options(values: readonly string[], label: (key: string) => string) {
    return <><option value="">{t("any")}</option>{values.map(value => <option key={value} value={value}>{label(value)}</option>)}</>;
  }
  const regions = regionOptions(locale);
  const languages = new Intl.DisplayNames([locale], { type: "language" });
  return <form className={institutionCard + " grid gap-3 !p-4 text-sm"} onSubmit={submit}>
    <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,13rem)_auto]">
      {supports("keyword") ? <label>{t("keyword")}<input className={institutionField} name="keyword" type="search" minLength={2} maxLength={80} /></label> : <span />}
      <label>{t("sort")}<select className={institutionField} name="sort" defaultValue={view === "forYou" ? "relevance" : "latest"}>
        <option value="latest">{t("latest")}</option><option value="closing">{t("closing")}</option>
        {view === "forYou" && <option value="relevance">{t("relevance")}</option>}
      </select></label>
      <button className={institutionAction + " min-h-11"}>{t("apply")}</button>
    </div>
    <details className="rounded-md border border-[var(--theme-border)] p-3">
      <summary className="cursor-pointer font-semibold text-[var(--theme-link)]">{t("filter")}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {supports("type") && <label>{o("type")}<select className={institutionField} name="type" value={type} onChange={event => setType(event.target.value)}>
          <option value="">{t("any")}</option>{data.types?.map(value => <option key={value} value={value}>{o(value)}</option>)}
        </select></label>}
        {supports("category") && <label>{o("category")}<select className={institutionField} name="category">
          <option value="">{t("any")}</option>{professionalOpportunityCategories.map(value => <option key={value} value={value}>{o(value)}</option>)}
        </select></label>}
        {supports("country") && <label>{o("country")}<select className={institutionField} name="country">
          {options(regions.filter(region => data.scopes?.includes(region.id === "HT" ? "haiti" : "international")).map(region => region.id),
            id => regions.find(region => region.id === id)?.label ?? id)}
        </select></label>}
        {supports("department") && data.scopes?.includes("haiti") && <label>{o("department")}<select className={institutionField} name="department">
          {options(volunteerDepartments, departmentLabel)}
        </select></label>}
        {supports("mode") && <label>{o("mode")}<select className={institutionField} name="mode"><option value="">{t("any")}</option>
          {professionalOpportunityModes.map(value => <option key={value} value={value}>{o(value)}</option>)}
        </select></label>}
        {supports("language") && <label>{o("language")}<select className={institutionField} name="language">
          {options(locales, value => languages.of(value) ?? value)}
        </select></label>}
        {supports("deadline") && <label>{o("closes")}<input className={institutionField} name="deadline" type="date" /></label>}
        {supports("skill") && <div className="grid gap-1">
          <label>{t("search")}<input className={institutionField} maxLength={80} type="search"
            onFocus={() => { if (skillQuery === null) setSkillQuery(""); }}
            onChange={event => setSkillQuery(event.target.value)} /></label>
          <label>{o("skills")}<select className={institutionField} name="skill"><option value="">{t("any")}</option>
            {skills.data?.map(skill => <option key={skill.code} value={skill.code}>{skill.names[locale] ?? skill.code}</option>)}
          </select></label>
          {skills.error !== null && <ApiErrorNotice error={skills.error} retry={skills.refresh} />}
        </div>}
        {supports("employmentType") && type === "employment" && <label>{p("employmentType")}<select className={institutionField} name="employmentType">
          <option value="">{t("any")}</option>{jobTypes.map(value => <option key={value} value={value}>{p(value)}</option>)}
        </select></label>}
        {supports("payment") && type && !["scholarship", "workshop"].includes(type) && <label>{t("payment")}<select className={institutionField} name="payment" key={type}>
          <option value="">{t("any")}</option><option value="paid">{p("paid")}</option>
          {["employment", "internship", "apprenticeship"].includes(type) ? <option value="unpaid">{p("unpaid")}</option> : <option value="free">{p("free")}</option>}
        </select></label>}
        {supports("funding") && type === "scholarship" && <label>{p("funding")}<select className={institutionField} name="funding">
          <option value="">{t("any")}</option><option value="full">{p("full")}</option><option value="partial">{p("partial")}</option>
        </select></label>}
      </div>
    </details>
  </form>;
}

function DiscoveryCard({ item, view, busy, send }: {
  item: OpportunityDiscoveryItem; view: OpportunityDiscoveryView; busy: boolean; send: (input: object) => void;
}) {
  const [locale] = useLocale();
  const t = discoveryOpportunityCopy(locale), o = opportunityCopy(locale), p = publicationCopy(locale);
  const { snapshot, amount, methods } = item;
  const current = { id: item.id, version: item.revision };
  const region = new Intl.DisplayNames([locale], { type: "region" }).of(snapshot.country);
  const money = (value: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  return <article className={institutionCard + " grid content-start gap-3"}>
    <header className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <span className={opportunityTag}>{o(snapshot.type)}</span><span className={opportunityTag}>{o(item.status)}</span>
      </div>
      <h2 className="break-words text-lg font-semibold" dir="auto">
        <Link className="hover:underline" href={"/organization/" + item.handle + "?section=opportunities&opportunity=" + item.id}>{snapshot.title}</Link>
      </h2>
      <Link className="inline-flex w-fit items-center gap-1.5 font-semibold text-[var(--theme-link)] hover:underline"
        href={"/organization/" + item.handle}>{item.organization}{item.verified && <VerifiedCheck label={p("verified")} />}</Link>
    </header>
    <p className="flex flex-wrap gap-x-3 text-sm text-[var(--theme-body)]">
      <span>{[departmentLabel(snapshot.department ?? ""), region, o(snapshot.mode)].filter(Boolean).join(" · ")}</span>
      {snapshot.closesOn && <span>{o("closes")} <time dateTime={snapshot.closesOn}>
        {new Date(snapshot.closesOn + "T00:00:00Z").toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" })}
      </time></span>}
    </p>
    <p className="text-sm"><strong>{t("payment")}</strong>{" · "}{amount.state === "range"
      ? amount.min === amount.max ? money(amount.min, amount.currency) : money(amount.min, amount.currency) + " – " + money(amount.max, amount.currency)
      : p(amount.state)}{item.period && " / " + p(item.period as Parameters<typeof p>[0])}</p>
    {item.reasons?.length ? <details className="text-sm"><summary className="cursor-pointer font-semibold">{t("why")}</summary>
      <ul className="mt-1 list-disc space-y-1 ps-5">{item.reasons.map(reason => <li key={reason}>{t(reason)}</li>)}</ul>
    </details> : null}
    <details className="rounded-md border border-[var(--theme-border)] p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-[var(--theme-link)]">{t("open")}</summary>
      <div className="mt-3 grid gap-3">
        <p className="whitespace-pre-wrap break-words" dir="auto">{snapshot.description}</p>
        {methods.event && <Link className={opportunitySecondary + " w-fit"} href={"/events/" + methods.event}>{p("nativeEvent")}</Link>}
        {methods.external && <ExternalDestination organization={item.organizationId} item={current} />}
        {methods.interest && <InterestForm organization={item.organizationId} item={current} exact />}
      </div>
    </details>
    <div className="flex flex-wrap gap-2">
      <button className={opportunitySecondary} type="button" disabled={busy} onClick={() => send(item.saved
        ? { action: "unsave", id: item.id } : { action: "save", id: item.id, revision: item.revision })}>{t(item.saved ? "unsave" : "save")}</button>
      {view === "forYou" && <button className={opportunitySecondary} type="button" disabled={busy}
        onClick={() => send({ action: "dismiss", id: item.id, revision: item.revision })}>{t("dismiss")}</button>}
    </div>
  </article>;
}

export type CatalogSkill = { code: string; names: Record<string, string> };

export function regionOptions(locale: Locale) {
  const display = new Intl.DisplayNames([locale], { type: "region" });
  return opportunityCountries.map(id => ({ id, label: display.of(id) ?? id })).sort((a, b) => a.label.localeCompare(b.label, locale));
}

export function departmentLabel(id: string) {
  const index = volunteerDepartments.findIndex(value => value === id);
  return index === -1 ? id : departmentNames[index];
}
