"use client";

import { useCallback, useState } from "react";
import { loadOrganizationPosts } from "@/lib/social-api";
import { useCursorPage } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { socialMessages } from "@/lib/social-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { PostCard } from "./feed-screen";
import { institutionAction, institutionCard, institutionField } from "./institution-ui";
import { OrganizationPublisher } from "./social-post";

export function OrganizationTimeline({ handle, signedIn }: { handle: string; signedIn: boolean }) {
  const [locale] = useLocale();
  const labels = socialMessages[locale];
  const feed = feedMessages[locale];
  const [filter, setFilter] = useState("all");
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const result = await loadOrganizationPosts(handle, filter, signedIn, cursor, signal);
    return { rows: result.posts, nextCursor: result.nextCursor };
  }, [handle, filter, signedIn]);
  const result = useCursorPage(load, revision);

  return <section className="grid min-w-0 gap-3" aria-label={labels.organizationPosts}>
    <div className={institutionCard + " grid gap-3"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{labels.organizationPosts}</h2>
        {(filter !== "all" || Boolean(result.page?.rows.length)) && <select className={institutionField + " mt-0 w-auto max-w-full text-sm"} aria-label={labels.filterPosts} value={filter}
          onChange={(event) => setFilter(event.target.value)}>
          <option value="all">{labels.allPosts}</option>
          <option value="announcements">{labels.announcements}</option>
        </select>}
      </div>
      {signedIn && <OrganizationPublisher handle={handle} onPublished={refresh} />}
    </div>
    {result.error !== null && <ApiErrorNotice error={result.error} retry={result.retry} />}
    {!result.page && result.error === null && <p role="status">{feed.working}</p>}
    {result.page?.rows.length === 0 && <p className={institutionCard + " text-sm text-[var(--theme-body)]"}>
      {filter === "announcements" ? labels.noOrganizationAnnouncements : labels.noOrganizationPosts}
    </p>}
    {result.page?.rows.map((post) => <PostCard key={post.id} post={post} changed={refresh} guest={!signedIn} organizationTimeline />)}
    {result.page?.nextCursor && <button type="button" className={institutionAction + " justify-self-start"}
      disabled={result.loadingMore} onClick={() => { void result.more(); }}>{result.loadingMore ? feed.working : feed.loadMore}</button>}
  </section>;
}
