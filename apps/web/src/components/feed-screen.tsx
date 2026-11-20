"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { postBodyLimit, postVisibilities, type FeedPost, type FeedScope, type InterestCode, type Locale, type PostInput, type PostVisibility, type RecommendationAction } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { createPost, deletePost, editPost, loadFeed, loadFeedModerationAccess, reportPost } from "@/lib/feed-api";
import { loadSuggestions } from "@/lib/discovery-api";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { rememberFeedMode, usePreferredFeedMode } from "@/lib/feed-preference";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { isLocale, languageNames, locales } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { recommendationMessages } from "@/lib/recommendation-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { DiscoveryAccounts } from "./discovery-accounts";
import { ContentReportForm } from "./content-report-form";
import { PostDiscussion, ReactionPicker } from "./feed-discussion";
import { VerifiedCheck, institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { PostTopicLabels, RecommendationActions, RecommendationSettingsPanel, TopicOptions } from "./feed-recommendations";
import { MemberShell } from "./member-shell";

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
  const [notice, setNotice] = useState<PostNotice | null>(null);
  const [rankingRevision, setRankingRevision] = useState(0);
  const access = useInstitutionResource(loadFeedModerationAccess);

  function changed(message: PostNotice) {
  function setScope(next: FeedScope) {
    setVisited((open) => new Set([...open, scope, next]));
    setPersonal(next === "mine");
    if (next !== "mine") rememberFeedMode(next);
  }

  function refreshForYou() { setRankingRevision((current) => current + 1); }

    if (message === "draftSaved") setScope("mine");
    setNotice(message);
    setRevision((current) => current + 1);
  }

  return <MemberShell>
    <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(20rem,30%,30rem)] xl:items-start xl:gap-x-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--theme-border)] pb-5 xl:col-span-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.feed}</h1>
          <p className="mt-2 text-sm text-[var(--theme-body)]">{t.intro}</p>
        </div>
        {access.data?.allowed && <Link href="/feed/moderation" className={institutionLink}>{t.moderation}</Link>}
      </header>
      <div className="grid min-w-0 gap-4">
        <section className={institutionCard}>
          <h2 className="text-xl font-semibold">{t.write}</h2>
          <PostForm onSaved={changed} />
        </section>
        {notice && <p role="status" className="text-sm font-semibold text-[var(--theme-link)]">{t[notice]}</p>}
        <div role="group" aria-label={t.feed} className="flex flex-wrap gap-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1 sm:justify-self-start">
          <button type="button" className={tabStyle} aria-pressed={scope === "feed"} onClick={() => setScope("feed")}>{t.timeline}</button>
          <button type="button" className={tabStyle} aria-pressed={scope === "following"} onClick={() => setScope("following")}>
            {discoveryMessages[locale].followingFeed}
          </button>
        </div>
          <button type="button" className={tabStyle} aria-pressed={scope === "for_you"} onClick={() => setScope("for_you")}>
            {recommendationMessages[locale].forYou}
          </button>
          <button type="button" className={tabStyle} aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>{t.mine}</button>
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

  const [locale] = useLocale();
function Timeline({ scope, revision, changed, refreshForYou }: {
  scope: FeedScope; revision: number; changed: (message: PostNotice) => void; refreshForYou: () => void;
}) {
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

function PostForm({ post, onSaved, onCancel }: { post?: FeedPost; onSaved: (message: PostNotice) => void; onCancel?: () => void }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const hint = useId();
  const [body, setBody] = useState(post?.body ?? "");
  const [visibility, setVisibility] = useState<PostVisibility>(post?.visibility ?? "public");
  const [topics, setTopics] = useState<InterestCode[]>(post?.topics ?? []);
  const r = recommendationMessages[locale];
  const [languageChoice, setLanguage] = useState<Locale | null>(post?.language ?? null);
  const language = languageChoice ?? locale;
  const [editTarget] = useState(post);
  const mutation = useFeedMutation();
  const submissions = useRef(new Map<string, string>());
  const count = Array.from(body).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || count > postBodyLimit || mutation.busy) return;
    const input = { body, language, visibility, topics: [...topics].sort() } satisfies PostInput;
    const sent = await mutation.run(async () => {
      if (editTarget) { await editPost(editTarget, input); return; }
      const value = JSON.stringify(input);
      const key = submissions.current.get(value) ?? crypto.randomUUID();
      submissions.current.set(value, key);
      await createPost(input, key);
    });
    if (!sent) return;
    if (editTarget) { onSaved("editSaved"); return; }
    setBody("");
    submissions.current.clear();
    setTopics([]);
    onSaved(visibility === "private" ? "draftSaved" : "published");
  }

  return <form onSubmit={submit} className="mt-3 grid min-w-0 gap-3" aria-busy={mutation.busy}>
    <label className="block min-w-0 text-sm font-semibold">{t.body}
      <textarea className={institutionField} value={body} onChange={(event) => {
        if (languageChoice === null && event.target.value) setLanguage(locale);
        setBody(event.target.value);
      }} rows={4}
        required maxLength={postBodyLimit * 2} disabled={mutation.busy} aria-describedby={hint} />
    </label>
    <div className="flex min-w-0 items-center justify-between gap-2">
      <p id={hint} className={`min-w-0 text-sm ${count > postBodyLimit ? "text-[var(--theme-error-text)]" : "text-[var(--theme-body)]"}`}>
        {body ? t.bodyCount.replace("{count}", String(count)).replace("{max}", String(postBodyLimit)) : t.bodyHint.replace("{max}", String(postBodyLimit))}
      </p>
      <div className="flex shrink-0 gap-1">
        <label className={composerControl} title={`${t.visibility} ${t[visibility]}`}>
          <VisibilityIcon visibility={visibility} />
          <select aria-label={t.visibility} className={composerSelect} value={visibility} disabled={mutation.busy} onChange={(event) => {
            const next = postVisibilities.find((value) => value === event.target.value);
            if (next) setVisibility(next);
          }}>
            {postVisibilities.map((value) => <option value={value} key={value}>{t[value]}</option>)}
          </select>
        </label>
        <label className={composerControl} title={`${t.language} · ${languageNames[language]}`}>
          <span className="flex items-center gap-0.5 text-[10px] font-semibold uppercase" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h8v6H4zM12 14h8v6h-8zM4 14v3a3 3 0 0 0 3 3h2m11-10V7a3 3 0 0 0-3-3h-2" />
            </svg>
            {language}
          </span>
          <select aria-label={t.language} className={composerSelect} value={language} disabled={mutation.busy}
            onChange={(event) => { if (isLocale(event.target.value)) setLanguage(event.target.value); }}>
            {locales.map((value) => <option value={value} key={value} lang={value}>{languageNames[value]}</option>)}
          </select>
        </label>
      </div>
    </div>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    <details className="rounded-md border border-[var(--theme-border)] px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--theme-link)]">{r.topics} · {topics.length}/3</summary>
      <p className="my-2 text-sm text-[var(--theme-body)]">{r.topicsHelp}</p>
      <TopicOptions chosen={topics} limit={3} busy={mutation.busy} onChange={setTopics} />
    </details>
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className={institutionAction} disabled={mutation.busy || !body.trim() || count > postBodyLimit}>
        {mutation.busy ? t.working : post ? t.save : visibility === "private" ? t.saveDraft : t.publish}
      </button>
      {onCancel && <button type="button" className={institutionLink} disabled={mutation.busy} onClick={onCancel}>{t.cancel}</button>}
    </div>
  </form>;
}

const composerControl = "relative grid size-11 place-items-center rounded-md text-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-within:outline-2 focus-within:outline-[var(--theme-link)]";
const composerSelect = "absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default";

function VisibilityIcon({ visibility }: { visibility: PostVisibility }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {visibility === "public" && <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></>}
    {visibility === "members_only" && <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2m2-15a3 3 0 0 1 0 6m4 9v-2a5 5 0 0 0-4-5" /></>}
    {visibility === "private" && <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>}
  </svg>;
}

function PostCard({ post, changed, recommendation }: { post: FeedPost; changed: (message: PostNotice) => void; recommendation?: ReactNode }) {
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
            {post.author?.verified && <>{" "}<VerifiedCheck label={t.verified} /></>}
          </p>
          {post.author?.username && <p className="break-all text-xs text-[var(--theme-body)]">@{post.author.username}</p>}
        </div>
      </div>
      {!mode && (editable || (!post.own && !reported)) && <details className="text-sm">
        <summary className="cursor-pointer text-[var(--theme-link)]">{t.postActions}</summary>
        <div className="mt-2 flex flex-wrap gap-3">
          {editable ? <>
            <button type="button" className={institutionLink} onClick={() => setMode("edit")}>{t.edit}</button>
            <button type="button" className={institutionLink} onClick={() => setMode("delete")}>{t.delete}</button>
          </> : <button type="button" className={institutionLink} onClick={() => setMode("report")}>{t.report}</button>}
        </div>
      </details>}
    </header>
    <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--theme-body)]">
      <time dateTime={timestamp}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp))}</time>
      <span lang={post.language}>{languageNames[post.language]}</span>
      {post.editedAt && <span>{t.edited}</span>}
      {(post.own || post.visibility === "members_only") && <span>{t[post.visibility]}</span>}
      {post.status === "hidden" && <span>{t.hidden}</span>}
    {mode !== "edit" && !!post.topics?.length && <PostTopicLabels topics={post.topics} />}
    </p>
    {mode === "edit" ? <PostForm post={post} onCancel={() => setMode(null)}
      onSaved={(message) => { setMode(null); changed(message); }} /> :
      <p lang={post.language} dir="auto" className="mt-4 max-w-[75ch] whitespace-pre-wrap break-words text-sm leading-6 sm:text-base">{post.body}</p>}
    {mode === "delete" && <div className="mt-4 grid gap-3">
      <p>{t.confirmDelete}</p>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={institutionAction} disabled={mutation.busy} onClick={() => { void remove(); }}>{t.delete}</button>
        <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => setMode(null)}>{t.cancel}</button>
      </div>
    </div>}
    {mode === "report" && <ContentReportForm submitReport={(category, note) => reportPost(post.id, category, note)}
    {recommendation}
      cancel={() => setMode(null)} reported={() => { setMode(null); setReported(true); }} />}
    {reported && <p role="status" className="mt-3 text-sm text-[var(--theme-link)]">{t.reportSent}</p>}
    {post.reactions && <PostDiscussion postId={post.id}>
      <ReactionPicker target="posts" id={post.id} summary={post.reactions} />
    </PostDiscussion>}
  </article>;
}
