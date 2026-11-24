"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { type FeedPost, type FeedScope, type RecommendationAction } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { deletePost, loadFeed, loadFeedModerationAccess, reportPost } from "@/lib/feed-api";
import { loadInstitutionAccounts } from "@/lib/institution-api";
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
import { PostAuthorAvatar } from "./feed-avatar";
import { FeedActions, FeedIcon, feedIconButton, feedToolbarButton } from "./feed-actions";
import { PostDiscussion, ReactionPicker } from "./feed-discussion";
import { PostTopicLabels, RecommendationActions, RecommendationSettingsPanel } from "./feed-recommendations";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { PersonalClaimChecks, institutionAction, institutionCard, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { OrganizationPostBadges, QuotePreview, SocialPostControls, usePostBookmark } from "./social-post";
import { FeedLanguageControl, TranslatableText, TranslationEnabled } from "./feed-languages";
import { loadFeedLanguages, type FeedLanguageSettings } from "@/lib/feed-languages-api";
import { eventMessages } from "@/lib/events-i18n";
import { SocialText } from "./social-text";
import { canPublishAsOrganization, setOrganizationPin } from "@/lib/social-api";
import { socialMessages } from "@/lib/social-i18n";
import { PostComposer } from "./post-composer";
import { PostMediaGallery } from "./post-media";

const feedCard = "min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5";
const feedUtility = "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-visible:outline-2 focus-visible:outline-offset-2";
const tabStyle = "min-h-11 flex-1 rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-body)] hover:text-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)] aria-pressed:text-[var(--theme-link)] sm:flex-none";
type PostNotice = "published" | "draftSaved" | "editSaved" | "deleted";
const scopes = ["feed", "following", "for_you", "mine"] as const;

export function FeedScreen() {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const r = recommendationMessages[locale];
  const recommendationPanel = useId();
  const [recommendationsOpen, setRecommendationsOpen] = useState<boolean | null>(null);
  const preferred = usePreferredFeedMode();
  const [personal, setPersonal] = useState(false);
  const scope: FeedScope = personal ? "mine" : preferred;
  const [visited, setVisited] = useState<ReadonlySet<FeedScope>>(() => new Set());
  const [revision, setRevision] = useState(0);
  const [rankingRevision, setRankingRevision] = useState(0);
  const [notice, setNotice] = useState<PostNotice | null>(null);
  const access = useInstitutionResource(loadFeedModerationAccess);
  const accounts = useInstitutionResource(loadInstitutionAccounts);
  const publishers = accounts.data?.organizations.filter(({ role }) => canPublishAsOrganization(role));
  const preferences = useInstitutionResource(loadFeedLanguages);
  const [savedLanguages, setSavedLanguages] = useState<FeedLanguageSettings | null>(null);
  const languageSettings = savedLanguages ?? preferences.data;


  function setScope(next: FeedScope) {
    setVisited((open) => new Set([...open, scope, next]));
    setPersonal(next === "mine");
    if (next !== "mine") rememberFeedMode(next);
  }

  function refreshForYou() { setRankingRevision((current) => current + 1); }

  function changed(message: PostNotice) {
    if (message === "draftSaved") setScope("mine");
    setNotice(message === "published" ? null : message);
    setRevision((current) => current + 1);
  }

  const views = <div role="group" aria-label={t.feed} className="flex flex-wrap gap-1">
    <button type="button" className={tabStyle} aria-pressed={scope === "feed"} onClick={() => setScope("feed")}>{t.timeline}</button>
    <button type="button" className={tabStyle} aria-pressed={scope === "following"} onClick={() => setScope("following")}>
      {discoveryMessages[locale].followingFeed}
    </button>
    <button type="button" className={tabStyle} aria-pressed={scope === "for_you"} onClick={() => setScope("for_you")}>
      {r.forYou}
    </button>
    <button type="button" className={tabStyle} aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>{t.mine}</button>
  </div>;

  const recommendationTools = scope === "for_you" && <div role="group" aria-label={r.forYou} className="ms-auto flex shrink-0 items-center gap-1">
      <button type="button" className={feedToolbarButton} aria-label={r.refresh} title={r.refresh} onClick={refreshForYou}>
        <FeedIcon name="refresh" />
      </button>
      <button type="button" className={feedToolbarButton} aria-label={r.preferences} title={r.preferences}
        aria-expanded={recommendationsOpen === true} aria-controls={recommendationPanel}
        onClick={() => setRecommendationsOpen((current) => !current)}>
        <FeedIcon name="sliders" />
      </button>
  </div>;

  return <TranslationEnabled.Provider value={languageSettings?.translationEnabled ?? false}><MemberShell>
    <div className="grid w-full min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_clamp(16rem,23%,23rem)] xl:items-start xl:gap-x-6">
      <header className={feedCard + " flex flex-wrap items-center justify-between gap-x-6 gap-y-4 xl:col-span-2"}>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight sm:text-[2rem]" dir="auto">{t.feed}</h1>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-[var(--theme-body)]" dir="auto">{t.intro}</p>
        </div>
        <nav aria-label={t.feed} className="flex max-w-full flex-wrap items-center gap-1 rounded-xl bg-[var(--theme-control)] p-1">
          <Link href="/feed/saved" className={feedUtility}><FeedIcon name="bookmark" />{socialMessages[locale].saved}</Link>
          {access.data?.allowed && <details className="relative" onKeyDown={(event) => {
            if (event.key !== "Escape" || !event.currentTarget.open) return;
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }}>
            <summary className={feedUtility + " cursor-pointer list-none [&::-webkit-details-marker]:hidden"}>
              <FeedIcon name="report" />{t.moderation}
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg>
            </summary>
            <div className="absolute end-0 z-20 mt-1 grid w-48 gap-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1.5 shadow-md">
              <Link href="/feed/moderation" className={feedUtility}>{t.moderation}</Link>
              <Link href="/events/moderation" className={feedUtility}>{eventMessages[locale].moderation}</Link>
            </div>
          </details>}
        </nav>
      </header>
      <div className="grid min-w-0 gap-3">
        <section className={feedCard} aria-label={t.write}>
          <PostComposer onSaved={changed} publishers={publishers ?? (accounts.error ? [] : null)} />
        </section>
        {notice && <p role="status" className="text-sm font-semibold text-[var(--theme-link)]">{t[notice]}</p>}
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1.5">
          {scope !== "mine" && languageSettings
            ? <FeedLanguageControl settings={languageSettings} views={views} actions={recommendationTools}
                onSave={(result) => { setSavedLanguages(result); setRevision((current) => current + 1); }} />
            : <div className="flex flex-wrap items-center justify-between gap-2">{views}{recommendationTools}</div>}
          <div id={recommendationPanel} hidden={scope !== "for_you" || recommendationsOpen !== true}>
            {recommendationsOpen !== null && <RecommendationSettingsPanel onChange={refreshForYou} />}
          </div>
        </div>
        {scope !== "mine" && preferences.error !== null && <ApiErrorNotice error={preferences.error} retry={preferences.refresh} />}
        {scopes.filter((mode) => mode === scope || visited.has(mode)).map((mode) => <div key={mode} hidden={mode !== scope}>
          <Timeline scope={mode} revision={revision + (mode === "for_you" ? rankingRevision : 0)}
            changed={changed} refreshForYou={refreshForYou} />
        </div>)}
      </div>
      <aside aria-label={t.discover} className="min-w-0">
        <SuggestedAccounts onChange={() => { if (scope === "following") setRevision((current) => current + 1); }} />
      </aside>
    </div>
  </MemberShell></TranslationEnabled.Provider>;
}

function SuggestedAccounts({ onChange }: { onChange: () => void }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const resource = useInstitutionResource(loadSuggestions);
  const hasSuggestions = Boolean(resource.data?.accounts.length);
  return <section className={feedCard}>
    <h2 className="text-base font-semibold">{hasSuggestions ? t.suggestedAccounts : t.discover}</h2>
    {resource.error !== null && <div className="mt-2"><ApiErrorNotice error={resource.error} retry={resource.refresh} /></div>}
    {!resource.data && resource.error === null && <p role="status" className="mt-2 text-sm">{t.working}</p>}
    {hasSuggestions && resource.data && <div className="mt-3"><DiscoveryAccounts rows={resource.data.accounts} compact onChange={onChange} /></div>}
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
  useEffect(() => {
    if (!resource.page) return;
    const saved = window.sessionStorage.getItem("ayinou-feed-scroll");
    if (!saved) return;
    const [savedScope, position] = saved.split(":");
    if (savedScope !== scope) return;
    window.sessionStorage.removeItem("ayinou-feed-scroll");
    const frame = requestAnimationFrame(() => window.scrollTo(0, Number(position)));
    return () => cancelAnimationFrame(frame);
  }, [resource.page, scope]);

  function hideRecommendation(post: FeedPost, action: RecommendationAction) {
    const key = action === "not_interested" ? post.id : post.author?.username ?? post.id;
    setSuppressed((current) => ({
      revision, keys: new Set([...(current?.revision === revision ? current.keys : []), key]),
    }));
  }

  return <section aria-label={title} className="grid gap-3">
    {hidden?.size ? <p role="status" className="text-sm text-[var(--theme-link)]">{r.feedbackSaved}</p> : null}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={expired ? refreshForYou : resource.retry} />}
    {!resource.page && resource.error === null && <div role="status" aria-label={t.working} aria-busy="true" className="grid gap-3">
      {[0, 1].map((item) => <div key={item} className="h-44 animate-pulse rounded-xl border border-[var(--theme-border)] bg-[var(--theme-control)] motion-reduce:animate-none" />)}
    </div>}
    {rows?.length === 0 && <div className={institutionCard}>
      <p>{ranked ? r.empty : scope === "following" ? d.followingFeedEmpty : scope === "feed" ? t.empty : t.mineEmpty}</p>
      {scope === "following" && <Link href="/discover" className={`${institutionLink} mt-3 inline-block`}>{d.viewAll}</Link>}
    </div>}
    {rows?.map((post) => <PostCard key={post.timelineId ?? post.id} post={post} changed={changed} returnScope={scope}
      recommendation={ranked && post.recommendationReason ? <RecommendationActions id={post.id} reason={post.recommendationReason}
        onFeedback={(action) => hideRecommendation(post, action)} /> : undefined} />)}
    {!expired && resource.page?.nextCursor && <button type="button" className={`${institutionAction} justify-self-start`}
      disabled={resource.loadingMore} onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.working : t.loadMore}</button>}
  </section>;
}

export function PostCard({ post, changed, recommendation, onBookmarkChange, returnScope, guest = false, organizationTimeline = false }: {
  post: FeedPost; changed: (message: PostNotice) => void; recommendation?: ReactNode; onBookmarkChange?: () => void; returnScope?: FeedScope; guest?: boolean; organizationTimeline?: boolean;
}) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const [mode, setMode] = useState<"edit" | "delete" | "report" | null>(null);
  const [reported, setReported] = useState(false);
  const mutation = useFeedMutation();
  const bookmark = usePostBookmark(post, onBookmarkChange);
  const social = socialMessages[locale];
  const organization = post.social?.organization;
  const accountHref = organization ? `/organization/${organization.handle}`
    : post.author?.username ? `/members/${post.author.username}` : undefined;
  const name = post.social?.organization?.name ?? post.author?.displayName ?? (post.own ? t.you : t.unknownAuthor);
  const handle = post.social?.organization?.handle ?? post.author?.username;
  const timestamp = post.publishedAt ?? post.createdAt;
  const reactions = post.reactions;
  const editable = post.own && (post.status === "published" || post.status === "draft");

  async function remove() {
    if (await mutation.run(() => deletePost(post))) { setMode(null); changed("deleted"); }
  }

  const saveAction = post.social && post.status === "published" ? [{ icon: "bookmark" as const,
    label: bookmark.value ? social.removeBookmark : social.bookmark, run: () => { void bookmark.toggle(); } }] : [];
  return <article className={feedCard}>
    {post.repostBy && <p className="mb-2 text-sm text-[var(--theme-body)]">
      {post.repostBy.username ? <Link className="hover:underline" href={`/members/${post.repostBy.username}`}>
        {social.repostedBy.replace("{actor}", post.repostBy.displayName)}</Link> : social.repostedBy.replace("{actor}", post.repostBy.displayName)}
    </p>}
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <PostAuthorAvatar post={post} name={name} guest={guest} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 break-words font-semibold">
              {accountHref ? <Link className="hover:underline" href={accountHref}>{name}</Link> : name}
              {!organization && !!post.author?.personalClaims?.length && <>{" "}<PersonalClaimChecks claims={post.author.personalClaims} /></>}
              {!organization && post.author?.founderVerified && <>{" "}<FounderVerifiedMark compact /></>}
            </p>
            {organization && <OrganizationPostBadges post={post} />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--theme-body)]">
            {handle && <span className="break-all">@{handle}</span>}
            {organization && handle && <span aria-hidden="true">·</span>}
            <Link className="hover:underline" href={`/posts/${post.id}`} aria-label={mediaNotificationMessages[locale].openPost}
              onClick={() => { if (returnScope) window.sessionStorage.setItem("ayinou-feed-scroll", `${returnScope}:${window.scrollY}`); }}>
              <time dateTime={timestamp}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp))}</time>
            </Link>
            {organization && <span aria-hidden="true">·</span>}
            <span lang={post.language}>{languageNames[post.language]}</span>
            {organizationTimeline && post.social?.pinned && <span className="font-semibold">{social.pinned}</span>}
            {post.editedAt && <span>{t.edited}</span>}
            {((post.own && !organization) || post.visibility === "members_only" || post.visibility === "followers") && <span>{t[post.visibility]}</span>}
            {post.status === "hidden" && <span>{t.hidden}</span>}
          </p>
        </div>
      </div>
      {!guest && !mode && (editable || (!post.own && !reported) || saveAction.length > 0) && <FeedActions label={t.postActions} actions={editable ? [
        { icon: "edit", label: t.edit, run: () => setMode("edit") },
        { icon: "delete", label: t.delete, run: () => setMode("delete") },
        ...saveAction,
      ] : [...(!post.own && !reported ? [{ icon: "report" as const, label: t.report, run: () => setMode("report") }] : []), ...saveAction]} />}
    </header>
    {mode === "edit" ? <PostComposer post={post} onCancel={() => setMode(null)}
      onSaved={(message) => { setMode(null); changed(message); }} /> :
      <TranslatableText key={post.version} kind="post" id={post.id} language={post.language} allowed={!guest && post.visibility === "public" && post.status === "published" && !post.community && !post.social?.event} mentions={post.social?.mentions} hashtags={post.social?.hashtags} className="mt-3 max-w-[75ch] whitespace-pre-wrap break-words text-[0.95rem] leading-6 sm:text-base"><SocialText body={post.body} mentions={post.social?.mentions} hashtags={post.social?.hashtags} /></TranslatableText>}
    {mode !== "edit" && !!post.topics?.length && <PostTopicLabels topics={post.topics} />}
    {mode !== "edit" && post.attachments && <PostMediaGallery post={post.id} attachments={post.attachments} guest={guest} />}
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
    {post.social?.project && <aside className="mt-3 grid gap-1 rounded-md border border-[var(--theme-border)] p-3 text-sm">
      <Link className={institutionLink} href={"/projects/" + post.social.project.id}>{post.social.project.title}</Link>
      <p className="break-words">{post.social.project.summary}</p>
      {post.social.project.opportunities?.map((item) => <Link key={item.id} className={institutionLink}
        href={"/projects/" + post.social?.project?.id + "/work"}>{item.title}</Link>)}
    </aside>}
    {organizationTimeline && post.social?.canPin && <div className="mt-3 grid gap-2">
      <button type="button" className={institutionLink + " min-h-11 justify-self-start"} disabled={mutation.busy}
        onClick={() => { void mutation.run(async () => {
          await setOrganizationPin(post.id, post.version, !post.social?.pinned);
          changed("published");
        }); }}>{post.social.pinned ? social.unpin : social.pin}</button>
      {mutation.error !== null && mode !== "delete" && <ApiErrorNotice error={mutation.error} />}
    </div>}
    {mode !== "edit" && <QuotePreview post={post} />}
    {!guest && mode !== "edit" && (reactions
      ? <PostDiscussion postId={post.id}>
          {(comments) => <SocialPostControls post={post} bookmark={bookmark} trailing={recommendation} onChange={() => changed("published")}
            leading={<><ReactionPicker target="posts" id={post.id} summary={reactions} compact />{comments}</>} />}
        </PostDiscussion>
      : <SocialPostControls post={post} bookmark={bookmark} trailing={recommendation} onChange={() => changed("published")} />)}
  </article>;
}
