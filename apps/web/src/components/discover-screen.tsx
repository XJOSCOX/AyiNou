"use client";

import { useCallback, useState, type FormEvent } from "react";
import { interestCodes, locales, organizationKinds, type DiscoveryFilter, type DiscoveryKind } from "@ayinou/shared";
import { fetchDepartments } from "@/lib/api";
import { loadSuggestions, searchDiscovery } from "@/lib/discovery-api";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { FilterPanel } from "./filter-panel";
import { ApiErrorNotice } from "./api-error-notice";
import { DiscoveryAccounts, DiscoveryResults, FollowAccountList, discoveryTab } from "./discovery-accounts";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { socialMessages } from "@/lib/social-i18n";
import { f24Messages } from "@/lib/f24-i18n";
import { InterestFilter, LanguageFilter, SearchPosts } from "./social-activity";
import { FollowRequestsPanel } from "./social-privacy-settings";
import { HashtagSearch } from "./social-feed";
import { PageHeader } from "./page-header";

type View = DiscoveryKind | "following" | "hashtags" | "posts" | "followRequests";
const views = ["people", "institutions", "posts", "hashtags", "following", "followRequests"] as const;
const getDepartments = () => fetchDepartments();

export function DiscoverScreen({ initial }: { initial: View }) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const [view, setView] = useState<View>(initial);

  return <MemberShell>
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t.discover} description={t.intro} />
      <div role="group" aria-label={t.accounts} className="flex flex-wrap gap-2">
        {views.map((value) => <button key={value} type="button" className={discoveryTab} aria-pressed={value === view} onClick={() => setView(value)}>
          {value === "following" ? t.myFollowing : value === "hashtags" ? socialMessages[locale].hashtags : value === "posts" || value === "followRequests" ? f24Messages[locale][value] : t[value]}
        </button>)}
      </div>
      {view === "following" ? <FollowAccountList target={null} list="following" /> : view === "hashtags" ? <HashtagSearch /> : view === "posts" ? <SearchPosts /> : view === "followRequests" ? <FollowRequestsPanel /> : <SearchForm key={view} kind={view} />}
    </div>
  </MemberShell>;
}

function SearchForm({ kind }: { kind: DiscoveryKind }) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const labels = institutionMessages[locale];
  const [filter, setFilter] = useState<DiscoveryFilter>({ kind });
  const [invalid, setInvalid] = useState(false);
  const suggestions = useInstitutionResource(loadSuggestions);
  const suggested = suggestions.data?.accounts.filter((account) => account.kind === "member");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const q = String(form.get("q") ?? "").trim();
    if (Array.from(q).length === 1) { setInvalid(true); return; }
    setInvalid(false);
    const category = organizationKinds.find((value) => value === form.get("category"));
    const country = String(form.get("country") ?? "").trim().toUpperCase();
    const department = String(form.get("department") ?? "");
    const interest = interestCodes.find((value) => value === form.get("interest"));
    const language = locales.find((value) => value === form.get("language"));
    setFilter({ kind, q, verified: form.has("verified"), category, country, department, interest, language });
  }

  return <>
    <form onSubmit={submit} role="search" className={`${institutionCard} grid gap-4`}>
      <FilterPanel active={Number(Boolean(filter.category)) + Number(Boolean(filter.country)) + Number(Boolean(filter.department))
        + Number(Boolean(filter.interest)) + Number(Boolean(filter.language)) + Number(Boolean(filter.verified))} search={<>
        <label className="block min-w-0 text-sm font-semibold">{t.search}
          <input type="search" name="q" className={institutionField} placeholder={t.searchPlaceholder} maxLength={80}
            aria-invalid={invalid || undefined} onChange={() => setInvalid(false)} />
        </label>
        {invalid && <p role="alert" className="text-sm text-[var(--theme-error-text)]">{t.invalidSearch}</p>}
      </>}>
        <div className="grid gap-3">
          <LocationFilters labels={kind === "institutions" ? labels : undefined} />
          {kind === "people" && <div className="grid gap-3 sm:grid-cols-2"><InterestFilter name="interest" /><LanguageFilter /></div>}
          <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="verified" />{t.verifiedOnly}</label>
        </div>
      </FilterPanel>
      <button type="submit" className={institutionAction + " justify-self-start"}>{t.search}</button>
    </form>
    {kind === "people" && Object.keys(filter).length === 1 && !!suggested?.length && <section className="grid gap-3">
      <h2 className="font-semibold">{f24Messages[locale].suggestedMembers}</h2>
      <DiscoveryAccounts rows={suggested} />
    </section>}
    <SearchResults key={JSON.stringify(filter)} filter={filter} />
  </>;
}

function LocationFilters({ labels }: { labels?: typeof institutionMessages.en }) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const departments = useInstitutionResource(getDepartments);
  return <div className="grid min-w-0 gap-3 lg:grid-cols-3">
    {labels && <label className="min-w-0 text-sm font-semibold">{t.category}
      <select name="category" className={institutionField}>
        <option value="">{t.allCategories}</option>
        {organizationKinds.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}
      </select>
    </label>}
    <label className="min-w-0 text-sm font-semibold">{t.country}
      <input name="country" className={institutionField} placeholder={t.countryHint} maxLength={2} pattern="[A-Za-z]{2}" autoCapitalize="characters" />
    </label>
    <label className="min-w-0 text-sm font-semibold">{t.department}
      <select name="department" className={institutionField} disabled={!departments.data}>
        <option value="">{t.allDepartments}</option>
        {departments.data?.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
      </select>
    </label>
    {departments.error !== null && <div className="lg:col-span-3"><ApiErrorNotice error={departments.error} retry={departments.refresh} /></div>}
  </div>;
}

function SearchResults({ filter }: { filter: DiscoveryFilter }) {
  const [locale] = useLocale();
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { accounts, nextCursor } = await searchDiscovery(filter, cursor, signal);
    return { rows: accounts, nextCursor };
  }, [filter]);
  return <DiscoveryResults load={load} empty={discoveryMessages[locale].empty} />;
}
