"use client";

import { interestCodes, postBodyLimit, postVisibilities, type FeedPost, type InterestCode, type Locale, type PostInput, type PostVisibility } from "@ayinou/shared";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiRequestError } from "@/lib/api-errors";
import { MentionSuggestions } from "./social-text";
import { createPost, editPost } from "@/lib/feed-api";
import { feedMessages } from "@/lib/feed-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { isLocale, languageNames, locales } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { useMemberIdentity } from "@/lib/member-display-name";
import { attachmentInput, postImageMaxBytes, stagePostImage, type SelectedPostImage } from "@/lib/post-media-api";
import { recommendationMessages } from "@/lib/recommendation-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { TopicOptions } from "./feed-recommendations";
import { institutionAction, institutionLink } from "./institution-ui";
import { PostImageEditor } from "./post-media";

type SavedPost = "published" | "draftSaved" | "editSaved";
const control = "relative grid h-11 w-10 shrink-0 place-items-center rounded-md text-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)] focus-within:outline-2 focus-within:outline-[var(--theme-link)] aria-expanded:bg-[var(--theme-selected)] disabled:opacity-45 sm:w-11";
const nativeControl = "absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default";
const paths = {
  images: "M7 3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm-3 13 4.5-4.5L12 15l3-3 5 5m-5-9h.01",
  topics: "M3.5 5.5H12l8.4 8.4-6.5 6.5L5.5 12V5.5H3.5Zm5 3h.01",
  public: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  members_only: "M12 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2m2-15a3 3 0 0 1 0 6m4 9v-2a5 5 0 0 0-4-5",
  private: "M7 10h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm1 0V7a4 4 0 0 1 8 0v3m-4 5v2",
};

function ComposerIcon({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]} />
  </svg>;
}

export function PostComposer({ post, community, groupVersion, onSaved, onCancel }: {
  post?: FeedPost; community?: string; groupVersion?: number; onSaved: (message: SavedPost) => void; onCancel?: () => void;
}) {
  const [locale] = useLocale();
  const { displayName, memberId } = useMemberIdentity();
  const t = feedMessages[locale];
  const r = recommendationMessages[locale];
  const m = mediaNotificationMessages[locale];
  const hint = useId();
  const topicPanel = useId();
  const imageHelp = useId();
  const [body, setBody] = useState(post?.body ?? "");
  const [topics, setTopics] = useState<InterestCode[]>(post?.topics ?? []);
  const [showTopics, setShowTopics] = useState(false);
  const [images, setImages] = useState<SelectedPostImage[]>(() => post?.attachments?.map(({ id, alt }) => ({ id, alt: alt ?? "" })) ?? []);
  const [fileError, setFileError] = useState<ApiRequestError | "limit" | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const room = community ?? post?.community?.slug;
  const draftKey = memberId && !post ? `ayinou-post-draft:${memberId}:${room ?? "feed"}` : null;
  const [readyDraft, setReadyDraft] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<PostVisibility>(room ? "members_only" : post?.visibility ?? "public");
  const [languageChoice, setLanguage] = useState<Locale | null>(post?.language ?? null);
  const language = languageChoice ?? locale;
  const [editTarget] = useState(post);
  const mutation = useFeedMutation();
  const uploaded = useRef(new Map<string, number>());
  const submissions = useRef(new Map<string, string>());
  const count = Array.from(body).length;
  useEffect(() => {
    if (!draftKey) return;
    const frame = requestAnimationFrame(() => {
    setBody("");
    setTopics([]);
    setImages([]);
    setLanguage(null);
    setVisibility(room ? "members_only" : "public");
    try {
      const stored = window.sessionStorage.getItem(draftKey);
      if (stored) {
        const draft = JSON.parse(stored) as { body?: string; language?: Locale; visibility?: PostVisibility; topics?: InterestCode[] };
        if (typeof draft.body === "string") setBody(draft.body.slice(0, postBodyLimit));
        if (draft.language && isLocale(draft.language)) setLanguage(draft.language);
        if (!room && draft.visibility && postVisibilities.includes(draft.visibility)) setVisibility(draft.visibility);
        if (Array.isArray(draft.topics)) setTopics(draft.topics.filter((topic): topic is InterestCode => interestCodes.includes(topic)).slice(0, 3));
      }
    } catch { /* Browser storage may be unavailable. */ }
    setReadyDraft(draftKey);
    });
    return () => cancelAnimationFrame(frame);
  }, [draftKey, room]);
  useEffect(() => {
    if (!draftKey || readyDraft !== draftKey) return;
    try {
      if (body.trim() || topics.length) window.sessionStorage.setItem(draftKey, JSON.stringify({ body, language: languageChoice, visibility, topics }));
      else window.sessionStorage.removeItem(draftKey);
    } catch { /* Keep the working draft in component state. */ }
  }, [body, draftKey, languageChoice, readyDraft, topics, visibility]);

  function selectImages(files: File[]) {
    setFileError(null);
    if (images.length + files.length > 4) { setFileError("limit"); return; }
    if (files.some(({ size }) => size > postImageMaxBytes)) { setFileError(new ApiRequestError("PAYLOAD_TOO_LARGE", 413)); return; }
    if (files.some(({ type }) => type && !["image/jpeg", "image/png", "image/webp"].includes(type))) {
      setFileError(new ApiRequestError("UNSUPPORTED_IMAGE", 422));
      return;
    }
    setImages([...images, ...files.map((file) => ({ id: crypto.randomUUID(), alt: "", file }))]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || count > postBodyLimit || mutation.busy) return;
    const input = { body, language, visibility, topics: [...topics].sort(),
      ...(images.length || editTarget?.attachments?.length ? { attachments: attachmentInput(images) } : {}),
    } satisfies PostInput;
    const sent = await mutation.run(async () => {
      const pending = images.flatMap(({ id, file }) => file && Date.now() - (uploaded.current.get(id) ?? 0) > 23 * 60 * 60 * 1000 ? [{ id, file }] : []);
      for (const [index, item] of pending.entries()) {
        setProgress({ current: index + 1, total: pending.length });
        await stagePostImage(item.id, item.file);
        uploaded.current.set(item.id, Date.now());
      }
      setProgress(null);
      if (editTarget) { await editPost(editTarget, input); return; }
      const value = JSON.stringify(input);
      const key = submissions.current.get(value) ?? crypto.randomUUID();
      submissions.current.set(value, key);
      await createPost(input, key, room, groupVersion);
    });
    setProgress(null);
    if (!sent) return;
    if (editTarget) { onSaved("editSaved"); return; }
    if (draftKey) {
      try { window.sessionStorage.removeItem(draftKey); } catch { /* Storage may be unavailable. */ }
    }
    setBody("");
    setTopics([]);
    setShowTopics(false);
    setImages([]);
    setFileError(null);
    uploaded.current.clear();
    submissions.current.clear();
    onSaved(visibility === "private" ? "draftSaved" : "published");
  }

  return <form onSubmit={submit} className={`grid min-w-0 gap-3 ${post ? "mt-4" : ""}`} aria-busy={mutation.busy}>
    <div className="flex min-w-0 items-start gap-3">
      {!post && <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--theme-selected)] text-sm font-semibold text-[var(--theme-link)] sm:size-11">
        {Array.from(displayName ?? "A")[0]?.toLocaleUpperCase(locale)}
      </span>}
      <textarea aria-label={t.body} aria-describedby={hint} placeholder={t.write} value={body} onChange={(event) => {
        if (languageChoice === null && event.target.value) setLanguage(locale);
        setBody(event.target.value);
      }} rows={body ? 3 : 2} required maxLength={postBodyLimit * 2} disabled={mutation.busy}
        className="min-w-0 flex-1 resize-y rounded-md border border-transparent bg-transparent px-2 py-1.5 text-base text-[var(--theme-text)] placeholder:text-[var(--theme-body)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)] sm:text-lg" />
      <span id={hint} className="sr-only">{t.bodyHint.replace("{max}", String(postBodyLimit))}</span>
    </div>
    <MentionSuggestions value={body} onChange={setBody} />
    <PostImageEditor post={post?.id} images={images} onChange={(next) => {
      for (const id of uploaded.current.keys()) if (!next.some((image) => image.id === id)) uploaded.current.delete(id);
      setFileError(null);
      setImages(next);
    }} busy={mutation.busy} />
    {fileError === "limit" ? <p role="alert" className="text-sm text-[var(--theme-error-text)]">{m.tooMany}</p>
      : fileError && <ApiErrorNotice error={fileError} />}
    {progress && <p role="status" className="text-sm text-[var(--theme-body)]">
      {m.uploading.replace("{current}", String(progress.current)).replace("{total}", String(progress.total))}
    </p>}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-[var(--theme-border)] pt-2">
      <div className="flex min-w-0 flex-wrap items-center">
        <label className={`${control} ${mutation.busy || images.length >= 4 ? "opacity-45" : ""}`} title={m.add}>
          <ComposerIcon name="images" />
          <input type="file" aria-label={m.add} aria-describedby={imageHelp} accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple className={nativeControl} disabled={mutation.busy || images.length >= 4} onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length) selectImages(files);
            }} />
          <span id={imageHelp} className="sr-only">{m.help}</span>
        </label>
        <button type="button" className={control} aria-label={r.topics} title={r.topics}
          aria-expanded={showTopics} aria-controls={topicPanel} disabled={mutation.busy} onClick={() => setShowTopics((visible) => !visible)}>
          <ComposerIcon name="topics" />
          {topics.length > 0 && <span aria-hidden="true" className="absolute end-0.5 top-1 text-[10px] font-semibold">{topics.length}</span>}
        </button>
        {!room && <label className={control} title={`${t.visibility} · ${t[visibility]}`}>
          <ComposerIcon name={visibility} />
          <select aria-label={t.visibility} className={nativeControl} value={visibility} disabled={mutation.busy} onChange={(event) => {
            const next = postVisibilities.find((value) => value === event.target.value);
            if (next) setVisibility(next);
          }}>
            {postVisibilities.map((value) => <option value={value} key={value}>{t[value]}</option>)}
          </select>
        </label>}
        <label className={control} title={`${t.language} · ${languageNames[language]}`}>
          <span className="rounded border border-current px-1 py-px text-[10px] font-semibold uppercase" aria-hidden="true">{language}</span>
          <select aria-label={t.language} className={nativeControl} value={language} disabled={mutation.busy}
            onChange={(event) => { if (isLocale(event.target.value)) setLanguage(event.target.value); }}>
            {locales.map((value) => <option value={value} key={value} lang={value}>{languageNames[value]}</option>)}
          </select>
        </label>
      </div>
      <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
        {!!body && <span aria-label={t.bodyCount.replace("{count}", String(count)).replace("{max}", String(postBodyLimit))}
          className={`text-xs tabular-nums ${count > postBodyLimit ? "text-[var(--theme-error-text)]" : "text-[var(--theme-body)]"}`}>{count}/{postBodyLimit}</span>}
        {onCancel && <button type="button" className={institutionLink} disabled={mutation.busy} onClick={onCancel}>{t.cancel}</button>}
        <button type="submit" className={`${institutionAction} max-sm:px-3`} disabled={mutation.busy || !body.trim() || count > postBodyLimit}>
          {mutation.busy ? t.working : post ? t.save : visibility === "private" ? t.saveDraft : t.publish}
        </button>
      </div>
    </div>
    <div id={topicPanel} hidden={!showTopics} className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] p-3">
      <p className="mb-2 text-sm text-[var(--theme-body)]">{r.topicsHelp}</p>
      <TopicOptions chosen={topics} limit={3} busy={mutation.busy} onChange={setTopics} />
    </div>
  </form>;
}
