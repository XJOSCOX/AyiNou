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
import { ApiErrorNotice } from "./api-error-notice";
import { DisplayControls } from "./display-controls";
import { institutionAction, institutionCard, institutionField, institutionLink } from "./institution-ui";
import { SiteBrand } from "./site-brand";
import { SiteFooter } from "./site-footer";

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

  return <div id="top" className="flex min-h-dvh flex-col">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 sm:px-8">
      <SiteBrand />
      <DisplayControls />
    </header>
    <main className="grid flex-1 content-start gap-5 px-4 py-5 sm:px-8 sm:py-8">
      <section className={institutionCard}>
        <h1 className="text-3xl font-semibold sm:text-4xl">{t.title}</h1>
        <p className="mt-3 max-w-prose">{t.meaning}</p>
        <p className="mt-2 max-w-prose text-sm text-[var(--theme-body)]">{t.boundaries}</p>
        <h2 className="mt-5 text-lg font-semibold">{t.criteriaTitle}</h2>
        <ul className="mt-2 grid list-disc gap-1 ps-5 text-sm sm:grid-cols-2">
          {Object.entries(t.criteria).map(([key, label]) => <li key={key}>{label}</li>)}
        </ul>
        <p className="mt-3 max-w-prose text-sm text-[var(--theme-body)]">{t.fairness}</p>
        <p className="mt-2 max-w-prose text-sm text-[var(--theme-body)]">{t.selection}</p>
        {signedIn && <Link className={`${institutionLink} mt-4 inline-block`} href="/settings/ambassadors">{t.myProgram}</Link>}
      </section>
      <section aria-labelledby="ambassador-directory">
        <h2 id="ambassador-directory" className="text-2xl font-semibold">{t.directory}</h2>
        <form className="my-3 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setFilter({ q: String(data.get("q") ?? "").trim(), category: String(data.get("category") ?? "") });
        }}>
          <label className="min-w-0 text-sm font-semibold">{t.searchLabel}<input type="search" name="q" maxLength={80} className={institutionField} /></label>
          <label className="min-w-0 text-sm font-semibold">{t.category}
            <select name="category" className={institutionField}>
              <option value="">{t.allCategories}</option>
              {ambassadorCategories.map((category) => <option key={category} value={category}>{t.categories[category]}</option>)}
            </select>
          </label>
          <button className={institutionAction}>{t.search}</button>
        </form>
        {error !== null && <ApiErrorNotice error={error} retry={retry} signIn={signedIn} />}
        {!page && error === null && <p role="status">{authMessages[locale].working}</p>}
        {page?.rows.length === 0 && <p className={institutionCard}>{filter.q || filter.category ? t.noResults : t.emptyDirectory}</p>}
        {!!page?.rows.length && <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
    </main>
    <SiteFooter />
  </div>;
}
