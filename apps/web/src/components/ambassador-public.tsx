"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ambassadorCategories, type PublicAmbassador } from "@ayinou/shared";
import { loadAmbassadors } from "@/lib/ambassador-api";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useCursorPage } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { DiscoverSearchButton, DiscoverSearchInput } from "./discover-search";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

export function AmbassadorRecognition({ ambassador, compact = false }: {
  ambassador: Pick<PublicAmbassador, "category" | "statement">; compact?: boolean;
}) {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  return <div className={compact ? "grid gap-3" : "mt-3 grid gap-3"}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[var(--theme-selected)] px-2.5 py-1 text-xs font-semibold leading-snug text-[var(--theme-link)]">
        <Image src="/ambassador.png" width={100} height={100} alt="" unoptimized className="size-5 shrink-0" />
        <span className="min-w-0 break-words">{t.designation}</span>
      </span>
      <span className="min-w-0 break-words text-xs font-medium text-[var(--theme-body)]">{t.categories[ambassador.category]}</span>
    </div>
    {!compact && ambassador.statement && <p className="whitespace-pre-line break-words border-s-2 border-[var(--theme-border)] ps-3 text-sm leading-relaxed text-[var(--theme-body)]" dir="auto">{ambassador.statement}</p>}
    {!compact && <p className="text-sm text-[var(--theme-body)]">{t.meaning} <Link className={institutionLink} href="/ambassadors">{t.about}</Link></p>}
  </div>;
}

export function AmbassadorDirectory({ signedIn }: { signedIn: boolean }) {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  const [filter, setFilter] = useState({ q: "", category: "" });
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const result = await loadAmbassadors(signedIn, filter.q, filter.category, cursor, signal);
    return { rows: result.ambassadors.map((person) => ({ ...person, id: person.username })), nextCursor: result.nextCursor };
  }, [signedIn, filter]);
  const { page, error, retry, more, loadingMore } = useCursorPage(load);

  const filtered = Boolean(filter.q || filter.category);
  const loading = !page && error === null;
  const content = <div className="grid min-w-0 gap-4">
    <PageHeader title={t.title} description={t.meaning}
      actions={signedIn && <Link className={institutionAction} href="/settings/ambassadors">{t.myProgram}</Link>} />

    <section aria-labelledby="ambassador-directory" className="min-w-0 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className="grid gap-4 border-b border-[var(--theme-border)] p-5 sm:p-6">
        <h2 id="ambassador-directory" className="text-xl font-semibold sm:text-2xl">{t.directory}</h2>
        <form className="grid items-end gap-3 sm:flex sm:flex-wrap" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setFilter({ q: String(data.get("q") ?? "").trim(), category: String(data.get("category") ?? "") });
        }} onReset={() => setFilter({ q: "", category: "" })}>
          <div className="min-w-0 sm:max-w-xl sm:grow sm:basis-52">
            <DiscoverSearchInput label={t.searchLabel} placeholder={t.searchLabel} name="q" maxLength={80} />
          </div>
          <label className="block min-w-0 sm:max-w-64">
            <span className="sr-only">{t.category}</span>
            <select name="category" className={institutionField + " !mt-0 text-sm"}>
              <option value="">{t.allCategories}</option>
              {ambassadorCategories.map((category) => <option key={category} value={category}>{t.categories[category]}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <DiscoverSearchButton label={t.search} />
            {filtered && <button type="reset" className={institutionLink + " min-h-11"}>{t.clearFilters}</button>}
          </div>
        </form>
      </div>

      <div className="p-5 sm:p-6">
        {error !== null && <ApiErrorNotice error={error} retry={retry} signIn={signedIn} />}
        {loading && <div role="status" className="grid gap-3 sm:grid-cols-2">
          <span className="sr-only">{authMessages[locale].working}</span>
          {[0, 1].map((placeholder) => <div key={placeholder} aria-hidden="true"
            className="h-24 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] motion-safe:animate-pulse" />)}
        </div>}
        {page?.rows.length === 0 && <p role="status"
          className="rounded-lg bg-[var(--theme-control)] px-4 py-5 text-sm leading-relaxed text-[var(--theme-body)]">
          {filtered ? t.noResults : t.emptyDirectory}
        </p>}
        {!!page?.rows.length && <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3">
          {page.rows.map((person) => <li key={person.username} className="min-w-0">
            <Link href={`/members/${person.username}`} className="group grid h-full grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border border-[var(--theme-border)] p-2.5 hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--theme-link)]">
              {person.avatarUrl
                ? <Image src={person.avatarUrl} width={104} height={104} alt="" unoptimized className="size-26 rounded-md object-cover" />
                : <span aria-hidden="true" className="grid size-26 place-items-center rounded-md bg-[var(--theme-selected)] text-3xl font-semibold text-[var(--theme-link)]">{Array.from(person.displayName.trim())[0]?.toLocaleUpperCase(locale)}</span>}
              <div className="grid min-w-0 gap-2 py-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p dir="auto" className="break-words font-semibold group-hover:underline">{person.displayName}</p>
                    <p className="break-all text-xs text-[var(--theme-body)]">@{person.username}</p>
                  </div>
                  <svg aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--theme-link)]" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </div>
                <AmbassadorRecognition ambassador={person} compact />
              </div>
            </Link>
          </li>)}
        </ul>}
        {page?.nextCursor && <button className={`${institutionAction} mt-3`} type="button" disabled={loadingMore}
          onClick={() => { void more(); }}>{loadingMore ? authMessages[locale].working : t.more}</button>}
      </div>
    </section>

    <section aria-labelledby="ambassador-criteria" className={institutionCard + " grid items-start gap-5 text-sm leading-relaxed lg:grid-cols-2"}>
      <div>
        <h2 id="ambassador-criteria" className="text-xl font-semibold">{t.criteriaTitle}</h2>
        <ul className="mt-3 list-disc space-y-1.5 ps-5 marker:text-[var(--theme-link)]">
          {Object.entries(t.criteria).map(([key, label]) => <li key={key}>{label}</li>)}
        </ul>
      </div>
      <div className="grid gap-3 rounded-lg bg-[var(--theme-control)] p-4 text-[var(--theme-body)]">
        <p>{t.fairness}</p>
        <p>{t.selection}</p>
        <p>{t.boundaries}</p>
      </div>
    </section>
  </div>;

  return <MemberShell signedIn={signedIn}>{content}</MemberShell>;
}
