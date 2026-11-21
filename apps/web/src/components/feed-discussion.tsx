"use client";

import { useCallback, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  commentBodyLimit, locales, reactionKinds, type CommentInput, type FeedComment, type Locale,
  type ReactionKind, type ReactionSummary,
} from "@ayinou/shared";
import { ApiErrorNotice } from "./api-error-notice";
import { ContentReportForm } from "./content-report-form";
import { FeedActions, FeedIcon, feedIconButton } from "./feed-actions";
import { VerifiedCheck, institutionAction, institutionField, institutionLink } from "./institution-ui";
import { apiErrorCode } from "@/lib/api-errors";
import { createComment, deleteComment, editComment, loadComments, loadReaction, reportComment, setReaction } from "@/lib/feed-api";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { isLocale, languageNames } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { reconcileReaction } from "@/lib/reaction-state";

const compact = "inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-2.5 py-1.5 text-start text-sm font-medium text-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-visible:outline-2 aria-expanded:bg-[var(--theme-selected)] aria-pressed:bg-[var(--theme-selected)] disabled:opacity-60";
type VisibleComment = Extract<FeedComment, { available: true }>;

export function ReactionPicker({ target, id, summary }: { target: "posts" | "comments"; id: string; summary: ReactionSummary }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const panelId = useId();
  const [openMode, setOpenMode] = useState<"hover" | "explicit" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [local, setLocal] = useState<{ base: ReactionSummary; value: ReactionSummary } | null>(null);
  const mutation = useFeedMutation();
  const state = local?.base === summary ? local.value : summary;
  const total = reactionKinds.reduce((sum, kind) => sum + state.counts[kind], 0);
  const number = new Intl.NumberFormat(locale);
  const reactionLabel = state.mine ? `${t.reactionPicked} ${t[state.mine]}` : t.reactions;

  async function choose(kind: ReactionKind | null) {
    await mutation.run(() => reconcileReaction(kind, () => setReaction(target, id, kind),
      () => loadReaction(target, id), (value) => setLocal({ base: summary, value })));
  }

  return <div className="min-w-0">
    <div className="relative w-fit" onPointerLeave={(event) => {
      if (event.pointerType === "mouse") setOpenMode((mode) => mode === "hover" ? null : mode);
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpenMode(null);
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && openMode) {
        setOpenMode(null);
        trigger.current?.focus();
      }
    }}>
      <button ref={trigger} type="button" aria-expanded={openMode !== null} aria-controls={panelId} className={feedIconButton}
        aria-label={total ? `${reactionLabel} ${number.format(total)}` : reactionLabel} title={reactionLabel}
        data-selected={state.mine !== null}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpenMode((mode) => mode ?? "hover");
        }} onClick={(event) => {
          const keyboard = event.detail === 0;
          setOpenMode((mode) => mode === "hover" && !keyboard ? mode : mode ? null : "explicit");
        }}>
        <FeedIcon name={state.mine ?? "like"} />
        {total > 0 && <ReactionCount value={number.format(total)} />}
      </button>
      <div id={panelId} hidden={!openMode} className="absolute start-0 top-full z-20 w-48 pt-1 sm:w-60">
        <div role="group" aria-label={t.reactions} aria-busy={mutation.busy}
          className="flex w-fit flex-wrap gap-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1 shadow-lg">
          {reactionKinds.map((kind) => <button key={kind} type="button" aria-pressed={state.mine === kind} aria-label={`${t[kind]} ${number.format(state.counts[kind])}`}
            title={t[kind]} className={`${feedIconButton} size-10`} disabled={mutation.busy}
            onClick={() => { void choose(state.mine === kind ? null : kind); }}>
            <FeedIcon name={kind} />
            {state.counts[kind] > 0 && <ReactionCount value={number.format(state.counts[kind])} />}
          </button>)}
          {state.mine && <button type="button" className={`${feedIconButton} size-10`} title={t.removeReaction} aria-label={t.removeReaction}
            disabled={mutation.busy} onClick={() => { void choose(null); }}>
            <FeedIcon name="remove" />
          </button>}
        </div>
      </div>
    </div>
    {mutation.error !== null && <div className="mt-2"><ApiErrorNotice error={mutation.error} /></div>}
  </div>;
}

function ReactionCount({ value }: { value: string }) {
  return <span aria-hidden="true" className="absolute end-0 top-0 max-w-full truncate rounded-sm bg-[var(--theme-surface)] px-0.5 text-[10px] leading-3 tabular-nums">{value}</span>;
}

export function PostDiscussion({ postId, children }: { postId: string; children: ReactNode }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return <div className="mt-4 border-t border-[var(--theme-border)] pt-3">
    <div className="flex flex-wrap items-start gap-2">
      <button type="button" className={feedIconButton} aria-label={t.comments} title={t.comments} aria-controls={panelId} aria-expanded={open} onClick={() => {
        setOpen(!open);
        setLoaded(true);
      }}><FeedIcon name="comments" /></button>
      {children}
    </div>
    <div id={panelId} hidden={!open}>
      {loaded && <Thread postId={postId} parentId={null} compose />}
    </div>
  </div>;
}

function Thread({ postId, parentId, compose, onCancel, onReplySaved }: {
  postId: string;
  parentId: string | null;
  compose: boolean;
  onCancel?: () => void;
  onReplySaved?: () => void;
}) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const [revision, setRevision] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { comments, nextCursor } = await loadComments(postId, parentId, cursor, signal);
    return { rows: comments, nextCursor };
  }, [postId, parentId]);
  const resource = useCursorPage(load, revision);
  const inaccessible = ["NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN"].includes(apiErrorCode(resource.error));
  const refresh = () => setRevision((count) => count + 1);

  return <section aria-label={parentId ? t.replies : t.comments} className="mt-3 grid min-w-0 gap-3">
    {compose && <CommentForm postId={postId} parentId={parentId} cancel={onCancel} canSubmit={!inaccessible} onSaved={() => {
      setSubmitted(true);
      refresh();
      onReplySaved?.();
    }} />}
    {submitted && <p role="status" className="text-sm text-[var(--theme-link)]">{parentId ? t.replySent : t.commentSent}</p>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status" className="text-sm">{t.working}</p>}
    {!inaccessible && resource.page?.rows.length === 0 && <p className="text-sm text-[var(--theme-body)]">{parentId ? t.replyEmpty : t.commentEmpty}</p>}
    {!inaccessible && resource.page?.rows.map((comment) =>
      <CommentCard key={comment.id} value={comment} postId={postId} refresh={refresh} />)}
    {!inaccessible && resource.page?.nextCursor && <button type="button" className={`${compact} justify-self-start`} disabled={resource.loadingMore}
      onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.working : t.loadMore}</button>}
  </section>;
}

function CommentForm({ postId, parentId, editing, onSaved, cancel, canSubmit = true }: {
  postId: string;
  parentId: string | null;
  editing?: VisibleComment;
  onSaved: () => void;
  cancel?: () => void;
  canSubmit?: boolean;
}) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const hint = useId();
  const [body, setBody] = useState(editing?.body ?? "");
  const [language, setLanguage] = useState<Locale | null>(editing?.language ?? null);
  const mutation = useFeedMutation();
  const attempted = useRef(new Map<string, string>());
  const count = Array.from(body).length;
  const blocked = !canSubmit || !body.trim() || count > commentBodyLimit || mutation.busy;
  const [editVersion] = useState(editing?.version);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const input: CommentInput = { body, language: language ?? locale };
    const saved = await mutation.run(async () => {
      if (editing && editVersion !== undefined) {
        await editComment(editing.id, editVersion, input);
        return;
      }
      const payload = JSON.stringify(input);
      const key = attempted.current.get(payload) ?? crypto.randomUUID();
      attempted.current.set(payload, key);
      await createComment(postId, parentId, input, key);
    });
    if (saved) {
      setBody("");
      attempted.current.clear();
      onSaved();
    }
  }

  return <form className="grid min-w-0 gap-2" aria-busy={mutation.busy} onSubmit={save}>
    <label className="min-w-0 text-sm font-semibold">
      {editing ? t.editComment : parentId ? t.writeReply : t.writeComment}
      <textarea className={institutionField} value={body} rows={2} aria-describedby={hint} maxLength={commentBodyLimit * 2}
        required disabled={mutation.busy} onChange={(event) => {
          if (language === null && event.target.value) setLanguage(locale);
          setBody(event.target.value);
        }} />
    </label>
    <p id={hint} className={`text-xs ${count > commentBodyLimit ? "text-[var(--theme-error-text)]" : "text-[var(--theme-body)]"}`}>
      {body ? t.bodyCount.replace("{count}", String(count)).replace("{max}", String(commentBodyLimit)) : t.bodyHint.replace("{max}", String(commentBodyLimit))}
    </p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 text-xs font-semibold">{t.commentLanguage}
        <select className={institutionField} disabled={mutation.busy} value={language ?? locale} onChange={(event) => {
          if (isLocale(event.target.value)) setLanguage(event.target.value);
        }}>
          {locales.map((value) => <option key={value} value={value} lang={value}>{languageNames[value]}</option>)}
        </select>
      </label>
      <button type="submit" className={institutionAction} disabled={blocked}>
        {mutation.busy ? t.working : editing ? t.save : parentId ? t.sendReply : t.sendComment}
      </button>
      {cancel && <button type="button" className={compact} disabled={mutation.busy} onClick={cancel}>{t.cancel}</button>}
    </div>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
  </form>;
}

function CommentCard({ value, postId, refresh }: { value: FeedComment; postId: string; refresh: () => void }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const replyId = useId();
  const [replies, setReplies] = useState(false);
  const [loadedReplies, setLoadedReplies] = useState(false);
  const [addedReply, setAddedReply] = useState(false);
  const [replying, setReplying] = useState(false);
  const [action, setAction] = useState<"edit" | "delete" | "report" | null>(null);
  const [reported, setReported] = useState(false);
  const mutation = useFeedMutation();
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return <article className="min-w-0 rounded-md border border-[var(--theme-border)] p-3 text-sm">
    {value.available ? <>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 break-words font-semibold">
          {value.author?.displayName ?? (value.own ? t.you : t.unknownAuthor)}
          {value.author?.verified && <>{" "}<VerifiedCheck label={t.verified} /></>}
        </p>
        <p className="flex flex-wrap gap-x-2 text-xs text-[var(--theme-body)]">
          <time dateTime={value.createdAt}>{format.format(new Date(value.createdAt))}</time>
          <span lang={value.language}>{languageNames[value.language]}</span>
          {value.editedAt && <span>{t.edited}</span>}
        </p>
      </header>
      {action === "edit" ? <div className="mt-2">
        <CommentForm postId={postId} parentId={value.parentId} editing={value} cancel={() => setAction(null)}
          onSaved={() => { setAction(null); refresh(); }} />
      </div> : <p lang={value.language} dir="auto" className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{value.body}</p>}

      <div className="mt-2 flex min-w-0 flex-wrap items-start gap-2">
        <ReactionPicker target="comments" id={value.id} summary={value.reactions} />
        {!value.parentId && <button type="button" className={feedIconButton} aria-label={t.reply} title={t.reply}
          aria-expanded={replying && replies} aria-controls={replyId} onClick={() => {
          const showComposer = !(replying && replies);
          setReplying(showComposer);
          if (showComposer) { setReplies(true); setLoadedReplies(true); }
        }}><FeedIcon name="reply" /></button>}
        {!action && (value.own || !reported) && <FeedActions label={t.commentActions} actions={value.own ? [
          { icon: "edit", label: t.editComment, run: () => setAction("edit") },
          { icon: "delete", label: t.deleteComment, run: () => setAction("delete") },
        ] : [{ icon: "report", label: t.reportComment, run: () => setAction("report") }]} />}
      </div>
      {action === "delete" && <div className="mt-3 grid gap-2">
        <p>{t.confirmDeleteComment}</p>
        {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} />}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={feedIconButton} aria-label={t.deleteComment} title={t.deleteComment} disabled={mutation.busy} onClick={async () => {
            if (await mutation.run(() => deleteComment(value.id, value.version))) { setAction(null); refresh(); }
          }}><FeedIcon name="delete" /></button>
          <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => setAction(null)}>{t.cancel}</button>
        </div>
      </div>}
      {action === "report" && <ContentReportForm submitReport={(category, note) => reportComment(value.id, category, note)}
        cancel={() => setAction(null)} reported={() => { setAction(null); setReported(true); }} />}
      {reported && <p role="status" className="mt-2">{t.reportSent}</p>}
    </> : <p className="text-[var(--theme-body)]">{t.commentUnavailable}</p>}
    {(value.hasReplies || addedReply || replies) && <button type="button" className={`${feedIconButton} mt-2`} aria-label={t.replies} title={t.replies}
      aria-expanded={replies} aria-controls={replyId} onClick={() => { setReplies(!replies); setLoadedReplies(true); }}><FeedIcon name="thread" /></button>}
    {!value.parentId && <div id={replyId} className="min-w-0 border-s border-[var(--theme-border)] ps-2 sm:ps-3" hidden={!replies}>
      {loadedReplies && <Thread postId={postId} parentId={value.id}
        compose={replying && value.available} onReplySaved={() => setAddedReply(true)} onCancel={() => setReplying(false)} />}
    </div>}
  </article>;
}
