"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { useCursorPage } from "@/lib/feed-state";
import { feedMessages } from "@/lib/feed-i18n";
import { useLocale } from "@/lib/locale-store";
import { loadSocialFeed, searchHashtags } from "@/lib/social-api";
import { socialMessages } from "@/lib/social-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { PostCard } from "./feed-screen";
import { institutionAction, institutionCard, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { DiscoverSearchInput, DiscoverSearchButton } from "./discover-search";
import { SocialPostControls } from "./social-post";

export function SocialFeed({ scope, tag }: { scope: "saved" | "hashtag"; tag?: string }) {
  const [locale] = useLocale();
  const t = socialMessages[locale];
  const f = feedMessages[locale];
  const [revision, setRevision] = useState(0);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { posts, nextCursor } = await loadSocialFeed(scope, tag, cursor, signal);
    return { rows: posts, nextCursor };
  }, [scope, tag]);
  const resource = useCursorPage(load, revision);
  const refresh = () => setRevision((current) => current + 1);
  return <MemberShell><div className="grid gap-4">
    <PageHeader title={scope === "saved" ? t.saved : "#" + tag}
      actions={<Link className={institutionLink} href="/feed">{f.backToFeed}</Link>} />
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{f.working}</p>}
    {resource.page?.rows.length === 0 && <p className={institutionCard}>{scope === "saved" ? t.savedEmpty : t.tagEmpty}</p>}
    {resource.page?.rows.map((post) => post.unavailable
      ? <section className={institutionCard} key={post.timelineId ?? post.id}><p>{t.unavailable}</p>
        <SocialPostControls post={post} onChange={refresh} /></section>
      : <PostCard key={post.timelineId ?? post.id} post={post} changed={refresh} onBookmarkChange={scope === "saved" ? refresh : undefined} />)}
    {resource.page?.nextCursor && <button type="button" className={`${institutionAction} justify-self-start`}
      disabled={resource.loadingMore} onClick={() => { void resource.more(); }}>{f.loadMore}</button>}
  </div></MemberShell>;
}

export function HashtagSearch() {
  const [locale] = useLocale();
  const t = socialMessages[locale];
  const f = feedMessages[locale];
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const load = useCallback((signal: AbortSignal) => term ? searchHashtags(term, signal) : Promise.resolve({ tags: [] }), [term]);
  const resource = useInstitutionResource(load);
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim().replace(/^#/, "").normalize("NFC");
    if (/^[\p{L}\p{N}_]{1,48}$/u.test(value)) setTerm(value);
  }
  return <>
    <form role="search" onSubmit={submit} className={institutionCard + " flex min-w-0 items-center gap-2 !p-3 sm:!p-4"}>
      <div className="min-w-0 flex-1">
        <DiscoverSearchInput label={t.searchTags} placeholder={t.searchTags} value={query}
          onChange={(event) => setQuery(event.target.value)} maxLength={49} required />
      </div>
      <DiscoverSearchButton label={t.searchTags} />
    </form>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {term && !resource.data && resource.error === null && <p role="status">{f.working}</p>}
    {term && resource.data && !resource.data.tags.length && <p className={institutionCard}>{t.noTags}</p>}
    {!!resource.data?.tags.length && <ul className="flex min-w-0 flex-wrap gap-2">{resource.data.tags.map((tag) =>
      <li key={tag} className="min-w-0"><Link className="block break-all rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-selected)]" href={`/feed/hashtag/${encodeURIComponent(tag)}`}>#{tag}</Link></li>)}</ul>}
  </>;
}
