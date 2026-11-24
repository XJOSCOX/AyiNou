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
import { FilterPanel } from "./filter-panel";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

export function AmbassadorRecognition({ ambassador, compact = false }: {
  ambassador: Pick<PublicAmbassador, "category" | "statement">; compact?: boolean;
}) {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  return <div className="mt-3 grid gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded border border-dashed border-current px-2 py-1 text-xs font-semibold text-[var(--theme-link)]">
        <span aria-hidden="true">✦</span> {t.designation}
      </span>
      <span className="text-xs text-[var(--theme-body)]">{t.categories[ambassador.category]}</span>
    </div>
    {ambassador.statement && <p className="whitespace-pre-line break-words" dir="auto">{ambassador.statement}</p>}
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

  const content = <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_clamp(20rem,32%,36rem)]">
      <PageHeader className="xl:col-span-2" title={t.title} description={t.meaning}
        actions={signedIn && <Link className={institutionAction} href="/settings/ambassadors">{t.myProgram}</Link>} />
      <section aria-labelledby="ambassador-directory" className={institutionCard}>
        <h2 id="ambassador-directory" className="text-2xl font-semibold">{t.directory}</h2>
        <form className="my-4 grid gap-3" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setFilter({ q: String(data.get("q") ?? "").trim(), category: String(data.get("category") ?? "") });
        }}>
          <FilterPanel active={Number(Boolean(filter.category))} search={<label className="block max-w-sm text-sm font-semibold">{t.searchLabel}<input type="search" name="q" maxLength={80} className={institutionField} /></label>}>
            <label className="block max-w-sm text-sm font-semibold">{t.category}
              <select name="category" className={institutionField}>
                <option value="">{t.allCategories}</option>
                {ambassadorCategories.map((category) => <option key={category} value={category}>{t.categories[category]}</option>)}
              </select>
            </label>
          </FilterPanel>
          <button className={institutionAction + " justify-self-start"}>{t.search}</button>
        </form>
        {error !== null && <ApiErrorNotice error={error} retry={retry} signIn={signedIn} />}
        {!page && error === null && <p role="status">{authMessages[locale].working}</p>}
        {page?.rows.length === 0 && <p className="border-t border-[var(--theme-border)] pt-4 text-sm text-[var(--theme-body)]">{filter.q || filter.category ? t.noResults : t.emptyDirectory}</p>}
        {!!page?.rows.length && <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
          {page.rows.map((person) => <li key={person.username} className={institutionCard}>
            <div className="flex items-center gap-3">
              {person.avatarUrl && <Image src={person.avatarUrl} width={44} height={44} alt="" unoptimized className="size-11 shrink-0 rounded-full object-cover" />}
              <div className="min-w-0">
                <Link className={`${institutionLink} break-words`} href={`/members/${person.username}`}>{person.displayName}</Link>
                <p className="break-all text-sm text-[var(--theme-body)]">@{person.username}</p>
              </div>
            </div>
            <AmbassadorRecognition ambassador={person} compact />
          </li>)}
        </ul>}
        {page?.nextCursor && <button className={`${institutionAction} mt-3`} type="button" disabled={loadingMore}
          onClick={() => { void more(); }}>{loadingMore ? authMessages[locale].working : t.more}</button>}
      </section>
      <section aria-labelledby="ambassador-criteria" className={institutionCard + " grid gap-4 text-sm leading-relaxed"}>
        <div>
          <h2 id="ambassador-criteria" className="text-xl font-semibold">{t.criteriaTitle}</h2>
          <ul className="mt-3 list-disc space-y-1.5 ps-5">
            {Object.entries(t.criteria).map(([key, label]) => <li key={key}>{label}</li>)}
          </ul>
        </div>
        <div className="grid gap-3 border-t border-[var(--theme-border)] pt-4 text-[var(--theme-body)]">
          <p>{t.fairness}</p>
          <p>{t.selection}</p>
          <p>{t.boundaries}</p>
        </div>
      </section>
    </div>;

  return <MemberShell signedIn={signedIn}>{content}</MemberShell>;
}
