"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import { postBodyLimit, postVisibilities, type FeedPost, type FeedScope, type Locale, type PostInput, type PostVisibility } from "@ayinou/shared";
import { createPost, deletePost, editPost, loadFeed, loadFeedModerationAccess, reportPost } from "@/lib/feed-api";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { isLocale, languageNames, locales } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { ContentReportForm } from "./content-report-form";
import { PostDiscussion, ReactionPicker } from "./feed-discussion";
import { VerifiedCheck, institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";

const tabStyle = "min-h-11 flex-1 rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-body)] hover:text-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)] aria-pressed:text-[var(--theme-link)] sm:flex-none";
type PostNotice = "published" | "draftSaved" | "editSaved" | "deleted";

export function FeedScreen() {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const [scope, setScope] = useState<FeedScope>("feed");
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<PostNotice | null>(null);
  const access = useInstitutionResource(loadFeedModerationAccess);

  function changed(message: PostNotice) {
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
        <div role="group" aria-label={t.feed} className="flex gap-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1 sm:justify-self-start">
          <button type="button" className={tabStyle} aria-pressed={scope === "feed"} onClick={() => setScope("feed")}>{t.timeline}</button>
          <button type="button" className={tabStyle} aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>{t.mine}</button>
        </div>
        <Timeline key={scope} scope={scope} revision={revision} changed={changed} />
      </div>
      <aside aria-label={t.discover} className="grid min-w-0 gap-3">
        <section className={institutionCard}>
          <h2 className="text-lg font-semibold">{t.suggestedAccounts}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{t.suggestionsEmpty}</p>
          <Link href="/institutions" className={`${institutionLink} mt-3 inline-block`}>{t.browseInstitutions}</Link>
        </section>
        <section className={institutionCard}>
          <h2 className="text-lg font-semibold">{t.communityNews}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{t.newsEmpty}</p>
        </section>
      </aside>
    </div>
  </MemberShell>;
}

function Timeline({ scope, revision, changed }: { scope: FeedScope; revision: number; changed: (message: PostNotice) => void }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const loader = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { posts, nextCursor } = await loadFeed(scope, cursor, signal);
    return { rows: posts, nextCursor };
  }, [scope]);
  const resource = useCursorPage(loader, revision);

  return <section aria-label={scope === "feed" ? t.timeline : t.mine} className="grid gap-3">
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{t.working}</p>}
    {resource.page?.rows.length === 0 && <p className={institutionCard}>{scope === "feed" ? t.empty : t.mineEmpty}</p>}
    {resource.page?.rows.map((post) => <PostCard key={post.id} post={post} changed={changed} />)}
    {resource.page?.nextCursor && <button type="button" className={`${institutionAction} justify-self-start`}
      disabled={resource.loadingMore} onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.working : t.loadMore}</button>}
  </section>;
}

function PostForm({ post, onSaved, onCancel }: { post?: FeedPost; onSaved: (message: PostNotice) => void; onCancel?: () => void }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const hint = useId();
  const [body, setBody] = useState(post?.body ?? "");
  const [visibility, setVisibility] = useState<PostVisibility>(post?.visibility ?? "public");
  const [languageChoice, setLanguage] = useState<Locale | null>(post?.language ?? null);
  const language = languageChoice ?? locale;
  const [editTarget] = useState(post);
  const mutation = useFeedMutation();
  const submissions = useRef(new Map<string, string>());
  const count = Array.from(body).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || count > postBodyLimit || mutation.busy) return;
    const input = { body, language, visibility } satisfies PostInput;
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

function PostCard({ post, changed }: { post: FeedPost; changed: (message: PostNotice) => void }) {
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
          <p className="break-words font-semibold">{name}{post.author?.verified && <>{" "}<VerifiedCheck label={t.verified} /></>}</p>
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
      cancel={() => setMode(null)} reported={() => { setMode(null); setReported(true); }} />}
    {reported && <p role="status" className="mt-3 text-sm text-[var(--theme-link)]">{t.reportSent}</p>}
    {post.reactions && <PostDiscussion postId={post.id}>
      <ReactionPicker target="posts" id={post.id} summary={post.reactions} />
    </PostDiscussion>}
  </article>;
}
