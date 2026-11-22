"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { type FeedPost, type FeedScope, type RecommendationAction } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { deletePost, loadFeed, loadFeedModerationAccess, reportPost } from "@/lib/feed-api";
import { loadSuggestions } from "@/lib/discovery-api";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { rememberFeedMode, usePreferredFeedMode } from "@/lib/feed-preference";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { languageNames } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { recommendationMessages } from "@/lib/recommendation-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { DiscoveryAccounts } from "./discovery-accounts";
import { ContentReportForm } from "./content-report-form";
import { FeedActions, FeedIcon, feedIconButton } from "./feed-actions";
import { PostDiscussion, ReactionPicker } from "./feed-discussion";
import { PostTopicLabels, RecommendationActions, RecommendationSettingsPanel } from "./feed-recommendations";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { PersonalClaimChecks, institutionAction, institutionCard, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { PostComposer } from "./post-composer";
import { PostMediaGallery } from "./post-media";

const tabStyle = "min-h-11 flex-1 rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-body)] hover:text-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)] aria-pressed:text-[var(--theme-link)] sm:flex-none";
type PostNotice = "published" | "draftSaved" | "editSaved" | "deleted";
const scopes = ["feed", "following", "for_you", "mine"] as const;

export function FeedScreen() {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const preferred = usePreferredFeedMode();
  const [personal, setPersonal] = useState(false);
  const scope: FeedScope = personal ? "mine" : preferred;
  const [visited, setVisited] = useState<ReadonlySet<FeedScope>>(() => new Set());
  const [revision, setRevision] = useState(0);
  const [rankingRevision, setRankingRevision] = useState(0);
  const [notice, setNotice] = useState<PostNotice | null>(null);
  const access = useInstitutionResource(loadFeedModerationAccess);

  function setScope(next: FeedScope) {
    setVisited((open) => new Set([...open, scope, next]));
    setPersonal(next === "mine");
    if (next !== "mine") rememberFeedMode(next);
  }

  function refreshForYou() { setRankingRevision((current) => current + 1); }

  function changed(message: PostNotice) {
    if (message === "draftSaved") setScope("mine");
    setNotice(message);
    setRevision((current) => current + 1);
  }

  return <MemberShell>
    <div className="grid w-full min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_clamp(17rem,28%,30rem)] xl:items-start xl:gap-5">
      <PageHeader className="xl:col-span-2" title={t.feed} description={t.intro}
        actions={access.data?.allowed && <Link href="/feed/moderation" className={institutionLink}>{t.moderation}</Link>} />
      <div className="grid min-w-0 gap-4">
        <section className={`${institutionCard} max-sm:p-3`} aria-label={t.write}>
          <PostComposer onSaved={changed} />
        </section>
        {notice && <p role="status" className="text-sm font-semibold text-[var(--theme-link)]">{t[notice]}</p>}
        <div role="group" aria-label={t.feed} className="flex flex-wrap gap-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1 sm:justify-self-start">
          <button type="button" className={tabStyle} aria-pressed={scope === "feed"} onClick={() => setScope("feed")}>{t.timeline}</button>
          <button type="button" className={tabStyle} aria-pressed={scope === "following"} onClick={() => setScope("following")}>
            {discoveryMessages[locale].followingFeed}
          </button>
          <button type="button" className={tabStyle} aria-pressed={scope === "for_you"} onClick={() => setScope("for_you")}>
            {recommendationMessages[locale].forYou}
          </button>
          <button type="button" className={tabStyle} aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>{t.mine}</button>
        </div>
        {scopes.filter((mode) => mode === scope || visited.has(mode)).map((mode) => <div key={mode} hidden={mode !== scope}>
          <Timeline scope={mode} revision={revision + (mode === "for_you" ? rankingRevision : 0)}
            changed={changed} refreshForYou={refreshForYou} />
        </div>)}
      </div>
      <aside aria-label={t.discover} className="grid min-w-0 gap-3">
        <SuggestedAccounts onChange={() => { if (scope === "following") setRevision((current) => current + 1); }} />
        <section className={institutionCard}>
          <h2 className="text-lg font-semibold">{t.communityNews}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{t.newsEmpty}</p>
        </section>
      </aside>
    </div>
  </MemberShell>;
}

function SuggestedAccounts({ onChange }: { onChange: () => void }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const resource = useInstitutionResource(loadSuggestions);
  return <section className={institutionCard}>
    <h2 className="text-lg font-semibold">{t.suggestedAccounts}</h2>
    {resource.error !== null && <div className="mt-2"><ApiErrorNotice error={resource.error} retry={resource.refresh} /></div>}
    {!resource.data && resource.error === null && <p role="status" className="mt-2 text-sm">{t.working}</p>}
    {resource.data && (resource.data.accounts.length ? <DiscoveryAccounts rows={resource.data.accounts} compact onChange={onChange} />
      : <p className="mt-2 text-sm text-[var(--theme-body)]">{t.suggestionsEmpty}</p>)}
    <Link href="/discover" className={`${institutionLink} mt-3 inline-block`}>{discoveryMessages[locale].viewAll}</Link>
  </section>;
}

function Timeline({ scope, revision, changed, refreshForYou }: {
  scope: FeedScope; revision: number; changed: (message: PostNotice) => void; refreshForYou: () => void;
}) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const loader = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { posts, nextCursor } = await loadFeed(scope, cursor, signal);
    return { rows: posts, nextCursor };
  }, [scope]);
  const resource = useCursorPage(loader, revision);
  const [suppressed, setSuppressed] = useState<{ revision: number; keys: ReadonlySet<string> } | null>(null);

  const d = discoveryMessages[locale];
  const r = recommendationMessages[locale];
  const ranked = scope === "for_you";
  const title = ranked ? r.forYou : scope === "following" ? d.followingFeed : scope === "feed" ? t.timeline : t.mine;
  const hidden = suppressed?.revision === revision ? suppressed.keys : null;
  const rows = resource.page?.rows.filter((post) => !hidden?.has(post.id) && !hidden?.has(post.author?.username ?? ""));
  const expired = ranked && apiErrorCode(resource.error) === "FEED_REFRESH_REQUIRED";

  function hideRecommendation(post: FeedPost, action: RecommendationAction) {
    const key = action === "not_interested" ? post.id : post.author?.username ?? post.id;
    setSuppressed((current) => ({
      revision, keys: new Set([...(current?.revision === revision ? current.keys : []), key]),
    }));
  }

  return <section aria-label={title} className="grid gap-3">
    {ranked && <div className="grid gap-2">
      <RecommendationSettingsPanel onChange={refreshForYou} />
      <button className={`${institutionLink} justify-self-start`} type="button" onClick={refreshForYou}>{r.refresh}</button>
    </div>}
    {hidden?.size ? <p role="status" className="text-sm text-[var(--theme-link)]">{r.feedbackSaved}</p> : null}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={expired ? refreshForYou : resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{t.working}</p>}
    {rows?.length === 0 && <div className={institutionCard}>
      <p>{ranked ? r.empty : scope === "following" ? d.followingFeedEmpty : scope === "feed" ? t.empty : t.mineEmpty}</p>
      {scope === "following" && <Link href="/discover" className={`${institutionLink} mt-3 inline-block`}>{d.viewAll}</Link>}
    </div>}
    {rows?.map((post) => <PostCard key={post.id} post={post} changed={changed}
      recommendation={ranked && post.recommendationReason ? <RecommendationActions id={post.id} reason={post.recommendationReason}
        onFeedback={(action) => hideRecommendation(post, action)} /> : undefined} />)}
    {!expired && resource.page?.nextCursor && <button type="button" className={`${institutionAction} justify-self-start`}
      disabled={resource.loadingMore} onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.working : t.loadMore}</button>}
  </section>;
}

export function PostCard({ post, changed, recommendation }: { post: FeedPost; changed: (message: PostNotice) => void; recommendation?: ReactNode }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const [mode, setMode] = useState<"edit" | "delete" | "report" | null>(null);
  const [reported, setReported] = useState(false);
  const mutation = useFeedMutation();
  const name = post.author?.displayName ?? (post.own ? t.you : t.unknownAuthor);
  const timestamp = post.publishedAt ?? post.createdAt;
  const editable = post.own && (post.status === "published" || post.status === "draft");

  async function remove() {
    if (await mutation.run(() => deletePost(post))) { setMode(null); changed("deleted"); }
  }

  return <article className={institutionCard}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {post.author?.avatarUrl ? <Image src={post.author.avatarUrl} alt="" width={40} height={40}
          className="size-10 shrink-0 rounded-full object-cover" unoptimized />
          : <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--theme-selected)] font-semibold text-[var(--theme-link)]">
            {Array.from(name)[0]?.toLocaleUpperCase(locale)}
          </span>}
        <div className="min-w-0">
          <p className="break-words font-semibold">
            {post.author?.username ? <Link className="hover:underline" href={`/members/${post.author.username}`}>{name}</Link> : name}
            {!!post.author?.personalClaims?.length && <>{" "}<PersonalClaimChecks claims={post.author.personalClaims} /></>}
            {post.author?.founderVerified && <>{" "}<FounderVerifiedMark compact /></>}
          </p>
          {post.author?.username && <p className="break-all text-xs text-[var(--theme-body)]">@{post.author.username}</p>}
        </div>
      </div>
      {!mode && (editable || (!post.own && !reported)) && <FeedActions label={t.postActions} actions={editable ? [
        { icon: "edit", label: t.edit, run: () => setMode("edit") },
        { icon: "delete", label: t.delete, run: () => setMode("delete") },
      ] : [{ icon: "report", label: t.report, run: () => setMode("report") }]} />}
    </header>
    <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--theme-body)]">
      <Link className="hover:underline" href={`/posts/${post.id}`} aria-label={mediaNotificationMessages[locale].openPost}>
        <time dateTime={timestamp}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp))}</time>
      </Link>
      <span lang={post.language}>{languageNames[post.language]}</span>
      {post.editedAt && <span>{t.edited}</span>}
      {(post.own || post.visibility === "members_only") && <span>{t[post.visibility]}</span>}
      {post.status === "hidden" && <span>{t.hidden}</span>}
    </p>
    {mode === "edit" ? <PostComposer post={post} onCancel={() => setMode(null)}
      onSaved={(message) => { setMode(null); changed(message); }} /> :
      <p lang={post.language} dir="auto" className="mt-4 max-w-[75ch] whitespace-pre-wrap break-words text-sm leading-6 sm:text-base">{post.body}</p>}
    {mode !== "edit" && !!post.topics?.length && <PostTopicLabels topics={post.topics} />}
    {mode !== "edit" && post.attachments && <PostMediaGallery post={post.id} attachments={post.attachments} />}
    {mode === "delete" && <div className="mt-4 grid gap-3">
      <p>{t.confirmDelete}</p>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={feedIconButton} aria-label={t.delete} title={t.delete} disabled={mutation.busy} onClick={() => { void remove(); }}>
          <FeedIcon name="delete" />
        </button>
        <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => setMode(null)}>{t.cancel}</button>
      </div>
    </div>}
    {mode === "report" && <ContentReportForm submitReport={(category, note) => reportPost(post.id, category, note)}
      cancel={() => setMode(null)} reported={() => { setMode(null); setReported(true); }} />}
    {reported && <p role="status" className="mt-3 text-sm text-[var(--theme-link)]">{t.reportSent}</p>}
    {recommendation}
    {post.reactions && <PostDiscussion postId={post.id}>
      <ReactionPicker target="posts" id={post.id} summary={post.reactions} />
    </PostDiscussion>}
  </article>;
}
