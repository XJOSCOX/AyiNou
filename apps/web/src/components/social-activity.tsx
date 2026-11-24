"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { interestCodes, locales, type FeedPost, type ProfileReply } from "@ayinou/shared";
import { loadMemberActivity, loadTrending, localeNames, searchPosts, type ActivityTab } from "@/lib/f24-api";
import { f24Messages } from "@/lib/f24-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import { FilterPanel } from "./filter-panel";
import { ApiErrorNotice } from "./api-error-notice";
import { discoveryTab } from "./discovery-accounts";
import { SocialText } from "./social-text";
import { PostCard } from "./feed-screen";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

type Row = { id: string; post: FeedPost } | { id: string; reply: ProfileReply };
type Loader = (cursor: string | null, signal: AbortSignal) => Promise<{ rows: Row[]; nextCursor: string | null }>;

export function MemberActivity({ username, signedIn }: { username: string; signedIn: boolean }) {
  const [locale] = useLocale();
  const t = f24Messages[locale];
  const [tab, setTab] = useState<ActivityTab>("posts");
  const [keywords, setKeywords] = useState("");
  const [invalidKeywords, setInvalidKeywords] = useState(false);
  const load = useCallback<Loader>(async (cursor, signal) => {
    const { posts, replies, nextCursor } = await loadMemberActivity(username, tab, signedIn, keywords, cursor, signal);
    return { rows: posts?.map((post) => ({ id: post.id, post })) ?? replies?.map((reply) => ({ id: reply.id, reply })) ?? [], nextCursor };
  }, [username, tab, signedIn, keywords]);

  return <section className="grid min-w-0 gap-3">
    <div className="flex flex-wrap gap-2">
      {(["posts", "replies", "media"] as const).map((value) => <button type="button" key={value} className={discoveryTab}
        aria-pressed={tab === value} onClick={() => setTab(value)}>{t[value]}</button>)}
    </div>
    {tab !== "replies" && <form role="search" className={`${institutionCard} flex flex-wrap items-end gap-3`} onSubmit={(event) => {
      event.preventDefault();
      const query = String(new FormData(event.currentTarget).get("q") ?? "").trim();
      const invalid = Array.from(query).length === 1;
      setInvalidKeywords(invalid);
      if (!invalid) setKeywords(query);
    }}>
      <label className="grow text-sm font-semibold">{t.keywords}
        <input type="search" name="q" maxLength={100} defaultValue={keywords} className={institutionField} aria-invalid={invalidKeywords || undefined} />
      </label>
      <button type="submit" className={institutionAction}>{t.postSearch}</button>
    </form>}
    {invalidKeywords && tab !== "replies" && <p role="alert">{t.chooseFilter}</p>}
    <ActivityResults key={tab + ":" + keywords} load={load} signedIn={signedIn} />
  </section>;
}

function ActivityResults({ load, signedIn }: { load: Loader; signedIn: boolean }) {
  const [locale] = useLocale();
  const t = f24Messages[locale];
  const feedback = feedMessages[locale];
  const [revision, setRevision] = useState(0);
  const resource = useCursorPage(load, revision);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return <div className="grid min-w-0 gap-3">
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{feedback.working}</p>}
    {resource.page?.rows.length === 0 && <p className={institutionCard}>{t.emptyActivity}</p>}
    {resource.page?.rows.map((row) => "post" in row
      ? <PostCard key={row.id} post={row.post} changed={() => setRevision((value) => value + 1)} guest={!signedIn} />
      : <article key={row.id} className={institutionCard}>
        <Link href={`/posts/${row.reply.postId}?comment=${row.reply.id}`} className={institutionLink}>
          <time dateTime={row.reply.createdAt}>{date.format(new Date(row.reply.createdAt))}</time>
        </Link>
        <p className="mt-2 whitespace-pre-wrap break-words" lang={row.reply.language}><SocialText body={row.reply.body} mentions={row.reply.mentions} /></p>
      </article>)}
    {resource.page?.nextCursor && <button type="button" disabled={resource.loadingMore} className={`${discoveryTab} justify-self-start`}
      onClick={() => { void resource.more(); }}>{feedback.loadMore}</button>}
  </div>;
}

export function SearchPosts() {
  const [locale] = useLocale();
  const t = f24Messages[locale];
  const [filters, setFilters] = useState<Record<string, string> | null>(null);
  const [invalid, setInvalid] = useState(false);
  const trending = useInstitutionResource(loadTrending);
  const load = useCallback<Loader>(async (cursor, signal) => {
    const { posts, nextCursor } = await searchPosts(filters ?? {}, cursor, signal);
    return { rows: (posts ?? []).map((post) => ({ id: post.id, post })), nextCursor };
  }, [filters]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    for (const [key, value] of new FormData(event.currentTarget)) {
      const cleaned = String(value).trim();
      if (cleaned) next[key] = key === "since" ? new Date(`${cleaned}T00:00:00`).toISOString() : cleaned;
    }
    const tag = next.tag?.replace(/^#/, "");
    if (tag) next.tag = tag;
    const invalid = !Object.keys(next).length || next.q?.length === 1 || next.tag === "#" ||
      (next.tag && !/^[\p{L}\p{N}_]{1,48}$/u.test(next.tag));
    setInvalid(Boolean(invalid));
    if (!invalid) setFilters(next);
  }

  return <>
    <form role="search" className={`${institutionCard} grid gap-3`} onSubmit={submit}>
      <FilterPanel active={filters ? Object.keys(filters).filter((key) => key !== "q").length : 0} search={<label className="block max-w-sm text-sm font-semibold">{t.keywords}<input type="search" name="q" maxLength={100} className={institutionField} /></label>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-semibold">{t.hashtag}<input name="tag" maxLength={49} className={institutionField} /></label>
          <LanguageFilter />
          <InterestFilter name="topic" />
          <label className="text-sm font-semibold">{t.since}<input type="date" name="since" className={institutionField} /></label>
        </div>
      </FilterPanel>
      {invalid && <p role="alert">{t.chooseFilter}</p>}
      <button type="submit" className={`${institutionAction} justify-self-start`}>{t.postSearch}</button>
    </form>
    {!!trending.data?.tags.length && <section className={institutionCard}>
      <h2 className="mb-2 font-semibold">{t.trending}</h2>
      <div className="flex flex-wrap gap-2">{trending.data.tags.map((tag) => <button key={tag} type="button" className={discoveryTab}
        aria-pressed={filters?.tag === tag} onClick={() => { setFilters({ tag }); setInvalid(false); }}>#{tag}</button>)}</div>
    </section>}
    {trending.error !== null && <ApiErrorNotice error={trending.error} retry={trending.refresh} />}
    {filters && <ActivityResults key={JSON.stringify(filters)} load={load} signedIn />}
  </>;
}

export function LanguageFilter() {
  const [locale] = useLocale();
  const t = f24Messages[locale];
  return <label className="text-sm font-semibold">{t.language}<select name="language" className={institutionField}>
    <option value="">{t.any}</option>
    {locales.map((code) => <option key={code} value={code}>{localeNames[code]}</option>)}
  </select></label>;
}

export function InterestFilter({ name }: { name: "interest" | "topic" }) {
  const [locale] = useLocale();
  const t = f24Messages[locale];
  return <label className="text-sm font-semibold">{t.interest}<select name={name} className={institutionField}>
    <option value="">{t.any}</option>
    {interestCodes.map((code) => <option key={code} value={code}>{membershipMessages[locale][code]}</option>)}
  </select></label>;
}
