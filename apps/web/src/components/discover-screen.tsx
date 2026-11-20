"use client";

import { useCallback, useState, type FormEvent } from "react";
import { organizationKinds, type DiscoveryFilter, type DiscoveryKind } from "@ayinou/shared";
import { fetchDepartments } from "@/lib/api";
import { searchDiscovery } from "@/lib/discovery-api";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { DiscoveryResults, FollowAccountList, discoveryTab } from "./discovery-accounts";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";

type View = DiscoveryKind | "following";
const views = ["people", "institutions", "following"] as const;
const getDepartments = () => fetchDepartments();

export function DiscoverScreen({ initial }: { initial: View }) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const [view, setView] = useState<View>(initial);

  return <MemberShell>
    <div className="grid min-w-0 gap-4">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.discover}</h1>
        <p className="mt-2 text-sm text-[var(--theme-body)]">{t.intro}</p>
      </header>
      <div role="group" aria-label={t.accounts} className="flex flex-wrap gap-2">
        {views.map((value) => <button key={value} type="button" className={discoveryTab} aria-pressed={value === view} onClick={() => setView(value)}>
          {value === "following" ? t.myFollowing : t[value]}
        </button>)}
      </div>
      {view === "following" ? <FollowAccountList target={null} list="following" /> : <SearchForm key={view} kind={view} />}
    </div>
  </MemberShell>;
}

function SearchForm({ kind }: { kind: DiscoveryKind }) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const labels = institutionMessages[locale];
  const [filter, setFilter] = useState<DiscoveryFilter>({ kind });
  const [invalid, setInvalid] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const q = String(form.get("q") ?? "").trim();
    if (Array.from(q).length === 1) { setInvalid(true); return; }
    setInvalid(false);
    const category = organizationKinds.find((value) => value === form.get("category"));
    const country = String(form.get("country") ?? "").trim().toUpperCase();
    const department = String(form.get("department") ?? "");
    setFilter({ kind, q, verified: form.has("verified"), category, country, department });
  }

  return <>
    <form onSubmit={submit} role="search" className={`${institutionCard} grid gap-4`}>
      <label className="min-w-0 text-sm font-semibold">{t.search}
        <input type="search" name="q" className={institutionField} placeholder={t.searchPlaceholder} maxLength={80}
          aria-invalid={invalid || undefined} onChange={() => setInvalid(false)} />
      </label>
      {invalid && <p role="alert" className="text-sm text-[var(--theme-error-text)]">{t.invalidSearch}</p>}
      {kind === "institutions" && <InstitutionFilters labels={labels} />}
      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="verified" />{t.verifiedOnly}</label>
        <button type="submit" className={institutionAction}>{t.search}</button>
      </div>
    </form>
    <SearchResults key={JSON.stringify(filter)} filter={filter} />
  </>;
}

function InstitutionFilters({ labels }: { labels: typeof institutionMessages.en }) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const departments = useInstitutionResource(getDepartments);
  return <div className="grid min-w-0 gap-3 lg:grid-cols-3">
    <label className="min-w-0 text-sm font-semibold">{t.category}
      <select name="category" className={institutionField}>
        <option value="">{t.allCategories}</option>
        {organizationKinds.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}
      </select>
    </label>
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
