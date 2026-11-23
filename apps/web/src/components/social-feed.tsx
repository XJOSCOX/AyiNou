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
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
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
  return <section className={institutionCard}>
    <form role="search" onSubmit={submit} className="grid gap-3">
      <label className="text-sm font-semibold">{t.searchTags}
        <input type="search" className={institutionField} value={query} onChange={(event) => setQuery(event.target.value)} maxLength={49} required />
      </label>
      <button className={`${institutionAction} justify-self-start`}>{t.searchTags}</button>
    </form>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {term && !resource.data && resource.error === null && <p role="status">{f.working}</p>}
    {term && resource.data && !resource.data.tags.length && <p className="mt-3">{t.noTags}</p>}
    {!!resource.data?.tags.length && <ul className="mt-3 flex flex-wrap gap-3">{resource.data.tags.map((tag) =>
      <li key={tag}><Link className={institutionLink} href={`/feed/hashtag/${encodeURIComponent(tag)}`}>#{tag}</Link></li>)}</ul>}
  </section>;
}
