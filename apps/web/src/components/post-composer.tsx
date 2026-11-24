"use client";

import { interestCodes, postBodyLimit, postVisibilities, type FeedPost, type InstitutionAccounts, type InterestCode, type Locale, type PostInput, type PostVisibility } from "@ayinou/shared";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiRequestError } from "@/lib/api-errors";
import { MentionSuggestions } from "./social-text";
import { createPost, editPost } from "@/lib/feed-api";
import { feedMessages } from "@/lib/feed-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { isLocale, languageNames, locales } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionMessages } from "@/lib/institution-i18n";
import { publishedProjectId, publishSocialPost } from "@/lib/social-api";
import { socialMessages } from "@/lib/social-i18n";
import { f24Messages } from "@/lib/f24-i18n";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { useMemberIdentity } from "@/lib/member-display-name";
import { attachmentInput, postImageMaxBytes, stagePostImage, type SelectedPostImage } from "@/lib/post-media-api";
import { recommendationMessages } from "@/lib/recommendation-i18n";
import { FeedAvatar } from "./feed-avatar";
import { ApiErrorNotice } from "./api-error-notice";
import { TopicOptions } from "./feed-recommendations";
import { institutionField, institutionLink } from "./institution-ui";
import { PostImageEditor } from "./post-media";

type SavedPost = "published" | "draftSaved" | "editSaved";
type PublishingAccount = InstitutionAccounts["organizations"][number];
const control = "relative grid h-11 w-10 shrink-0 place-items-center rounded-md text-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)] focus-within:outline-2 focus-within:outline-[var(--theme-link)] aria-expanded:bg-[var(--theme-selected)] disabled:opacity-45 sm:w-11";
const nativeControl = "absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default";
const paths = {
  images: "M7 3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm-3 13 4.5-4.5L12 15l3-3 5 5m-5-9h.01",
  topics: "M3.5 5.5H12l8.4 8.4-6.5 6.5L5.5 12V5.5H3.5Zm5 3h.01",
  public: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  followers: "M4 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m-2-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm2 6a4 4 0 0 1 4 4v3",
  members_only: "M12 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2m2-15a3 3 0 0 1 0 6m4 9v-2a5 5 0 0 0-4-5",
  private: "M7 10h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm1 0V7a4 4 0 0 1 8 0v3m-4 5v2",
};

function ComposerIcon({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]} />
  </svg>;
}

export function PostComposer({ post, community, groupVersion, onSaved, onCancel, publishers }: {
  post?: FeedPost; community?: string; groupVersion?: number; onSaved: (message: SavedPost) => void; onCancel?: () => void;
  publishers?: PublishingAccount[] | null;
}) {
  const [locale] = useLocale();
  const { displayName, memberId, avatarUrl } = useMemberIdentity();
  const t = feedMessages[locale];
  const social = socialMessages[locale];
  const supportsPublishingIdentity = publishers !== undefined;
  const r = recommendationMessages[locale];
  const m = mediaNotificationMessages[locale];
  const hint = useId();
  const topicPanel = useId();
  const imageHelp = useId();
  const [body, setBody] = useState(post?.body ?? "");
  const [justShared, setJustShared] = useState(false);
  const [publisher, setPublisher] = useState("");
  const [announcement, setAnnouncement] = useState(false);
  const [project, setProject] = useState("");
  const organization = publisher ? publishers?.find(({ handle }) => handle === publisher) : undefined;
  const projectId = publishedProjectId(project);
  const invalidProject = Boolean(publisher && project.trim() && !projectId);
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
    if (!justShared) return;
    const timer = window.setTimeout(() => setJustShared(false), 3200);
    return () => window.clearTimeout(timer);
  }, [justShared]);
  useEffect(() => {
    if (!draftKey) return;
    const frame = requestAnimationFrame(() => {
    setBody("");
    setTopics([]);
    setImages([]);
    setLanguage(null);
    setPublisher("");
    setAnnouncement(false);
    setProject("");
    setJustShared(false);
    setVisibility(room ? "members_only" : "public");
    try {
      const stored = window.sessionStorage.getItem(draftKey);
      if (stored) {
        const draft = JSON.parse(stored) as {
          body?: string; language?: Locale; visibility?: PostVisibility; topics?: InterestCode[];
          publisher?: string; announcement?: boolean; project?: string;
        };
        if (supportsPublishingIdentity && typeof draft.publisher === "string") {
          setPublisher(draft.publisher);
          setAnnouncement(draft.announcement === true);
          if (typeof draft.project === "string") setProject(draft.project.slice(0, 400));
        }
        if (typeof draft.body === "string") setBody(draft.body.slice(0, postBodyLimit));
        if (draft.language && isLocale(draft.language)) setLanguage(draft.language);
        if (!room && draft.visibility && postVisibilities.includes(draft.visibility)) setVisibility(draft.visibility);
        if (Array.isArray(draft.topics)) setTopics(draft.topics.filter((topic): topic is InterestCode => interestCodes.includes(topic)).slice(0, 3));
      }
    } catch { /* Browser storage may be unavailable. */ }
    setReadyDraft(draftKey);
    });
    return () => cancelAnimationFrame(frame);
  }, [draftKey, room, supportsPublishingIdentity]);
  useEffect(() => {
    if (!draftKey || readyDraft !== draftKey) return;
    try {
      if (body.trim() || topics.length || publisher) window.sessionStorage.setItem(draftKey, JSON.stringify({
        body, language: languageChoice, visibility, topics, publisher, announcement, project,
      }));
      else window.sessionStorage.removeItem(draftKey);
    } catch { /* Keep the working draft in component state. */ }
  }, [announcement, body, draftKey, languageChoice, project, publisher, readyDraft, topics, visibility]);

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
    if (!body.trim() || count > postBodyLimit || mutation.busy || (publisher && !organization) || invalidProject) return;
    const input = { body, language, visibility, topics: [...topics].sort(),
      ...(images.length || editTarget?.attachments?.length ? { attachments: attachmentInput(images) } : {}),
    } satisfies PostInput;
    const organizationInput = organization && { organization: organization.handle, body, language, announcement, projectId };
    const sent = await mutation.run(async () => {
      if (organizationInput) {
        const value = JSON.stringify(organizationInput);
        const key = submissions.current.get(value) ?? crypto.randomUUID();
        submissions.current.set(value, key);
        await publishSocialPost(organizationInput, key);
        return;
      }
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
    setPublisher("");
    setAnnouncement(false);
    setProject("");
    setTopics([]);
    setShowTopics(false);
    setImages([]);
    setFileError(null);
    uploaded.current.clear();
    submissions.current.clear();
    const result = !organization && visibility === "private" ? "draftSaved" : "published";
    if (supportsPublishingIdentity && result === "published") setJustShared(true);
    onSaved(result);
  }

  const split = Boolean(publishers?.length || publisher);
  const cannotSubmit = mutation.busy || !body.trim() || count > postBodyLimit || Boolean(publisher && !organization) || invalidProject;

  return <form onSubmit={submit} className={`grid min-w-0 gap-3 ${post ? "mt-4" : ""}`} aria-busy={mutation.busy}>
    <div className="flex min-w-0 items-start gap-3">
      {!post && (organization || memberId) && <FeedAvatar name={organization?.name ?? (displayName || t.you)} url={organization ? organization.logoUrl : avatarUrl} />}
      <textarea aria-label={t.body} aria-describedby={hint} placeholder={t.write} value={body} onChange={(event) => {
        if (languageChoice === null && event.target.value) setLanguage(locale);
        setJustShared(false);
        setBody(event.target.value);
      }} rows={body ? 3 : 2} required maxLength={postBodyLimit * 2} disabled={mutation.busy}
        className="min-w-0 flex-1 resize-y rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] px-3 py-2 text-base text-[var(--theme-text)] placeholder:text-[var(--theme-body)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)] sm:text-base" />
      <span id={hint} className="sr-only">{t.bodyHint.replace("{max}", String(postBodyLimit))}</span>
    </div>
    <MentionSuggestions value={body} onChange={setBody} />
    {publisher && <div className="grid min-w-0 gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] p-3">
      {organization ? <>
        <p className="min-w-0 break-words text-sm font-semibold" role="status">
          {t.publishingAs.replace("{name}", organization.name)} <span className="font-normal text-[var(--theme-body)]">· {t.public}</span>
        </p>
        <div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={announcement} disabled={mutation.busy} onChange={(event) => setAnnouncement(event.target.checked)} />
            {social.announcement}
          </label>
          <label className="text-sm font-semibold">{social.projectLink}
            <input className={institutionField} value={project} maxLength={400} aria-invalid={invalidProject}
              disabled={mutation.busy} onChange={(event) => setProject(event.target.value)} />
          </label>
        </div>
        {invalidProject && <p role="status" className="text-sm text-[var(--theme-error-text)]">{social.invalidProject}</p>}
        {(images.length > 0 || topics.length > 0 || visibility !== "public") &&
          <p className="text-xs text-[var(--theme-body)]">{t.organizationPostOptions}</p>}
      </> : <p role="status" className="text-sm">{publishers === null ? t.working : t.publisherUnavailable}</p>}
    </div>}
    {!publisher && <PostImageEditor post={post?.id} images={images} onChange={(next) => {
      for (const id of uploaded.current.keys()) if (!next.some((image) => image.id === id)) uploaded.current.delete(id);
      setFileError(null);
      setImages(next);
    }} busy={mutation.busy} />}
    {!publisher && (fileError === "limit" ? <p role="alert" className="text-sm text-[var(--theme-error-text)]">{m.tooMany}</p>
      : fileError && <ApiErrorNotice error={fileError} />)}
    {progress && <p role="status" className="text-sm text-[var(--theme-body)]">
      {m.uploading.replace("{current}", String(progress.current)).replace("{total}", String(progress.total))}
    </p>}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-[var(--theme-border)] pt-2">
      <div className="flex min-w-0 flex-wrap items-center">
        {!publisher && <><label className={`${control} ${mutation.busy || images.length >= 4 ? "opacity-45" : ""}`} title={m.add}>
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
        </>}
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
        <div className="inline-flex h-9 items-stretch">
          <button type="submit" title={justShared ? t.updateShared : undefined}
            className={`relative rounded-md px-3 text-sm font-semibold focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)] ${split ? "rounded-e-none" : ""} ${justShared ? "bg-[var(--theme-selected)] text-[var(--theme-link)]" : "bg-[var(--theme-primary)] text-[var(--theme-on-primary)] hover:bg-[var(--theme-primary-hover)] disabled:opacity-60"}`}
            disabled={cannotSubmit}>
            <span className={justShared ? "opacity-0" : undefined}>
              {justShared ? t.publish : mutation.busy ? t.working : post ? t.save : !publisher && visibility === "private" ? t.saveDraft : t.publish}
            </span>
            {justShared && <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m4.5 10 3.5 3.5 7.5-7" />
            </svg>}
          </button>
          {split && <PublisherPicker accounts={publishers ?? []} selected={publisher} disabled={mutation.busy} onSelect={setPublisher} />}
        </div>
      </div>
    </div>
    {supportsPublishingIdentity && <span role="status" className="sr-only">{justShared ? t.updateShared : ""}</span>}
    {!publisher && visibility === "followers" && <p className="text-xs text-[var(--theme-body)]">{f24Messages[locale].followersAudienceHint}</p>}
    <div id={topicPanel} hidden={!!publisher || !showTopics} className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] p-3">
      <p className="mb-2 text-sm text-[var(--theme-body)]">{r.topicsHelp}</p>
      <TopicOptions chosen={topics} limit={3} busy={mutation.busy} onChange={setTopics} />
    </div>
  </form>;
}
function PublisherPicker({ accounts, selected, disabled, onSelect }: {
  accounts: PublishingAccount[]; selected: string; disabled: boolean; onSelect: (handle: string) => void;
}) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const panel = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function option(handle: string, name: string, image?: string | null) {
    return <button key={handle} type="button" aria-pressed={selected === handle}
      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm font-medium text-[var(--theme-text)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)] aria-pressed:text-[var(--theme-link)]"
      onClick={() => { onSelect(handle); close(); }}>
      {handle && <FeedAvatar name={name} url={image} compact />}
      <span className="min-w-0 flex-1 break-words">{name}</span>
      {selected === handle && <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0" fill="none"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8 3 3 6-6" /></svg>}
    </button>;
  }

  return <div className="relative flex" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }}>
    <button ref={trigger} type="button" title={t.publishAs} aria-label={t.publishAs} aria-expanded={open}
      aria-controls={panel} disabled={disabled} onClick={() => setOpen(!open)}
      className="relative grid w-8 place-items-center rounded-e-md border-s border-[var(--theme-border)] bg-[var(--theme-primary)] text-[var(--theme-on-primary)] hover:bg-[var(--theme-primary-hover)] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)] disabled:opacity-60">
      <svg aria-hidden="true" viewBox="0 0 16 16" className={`size-4 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    <div id={panel} hidden={!open} className="absolute end-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2.5rem)] rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1.5 shadow-lg">
      <div role="group" aria-label={t.publishAs}>
        {option("", institutionMessages[locale].personalAccount)}
        {!!accounts.length && <div className="mt-1 border-t border-[var(--theme-border)] pt-1">
          <p className="px-2 py-1.5 text-xs font-semibold text-[var(--theme-body)]">{socialMessages[locale].publishOrganization}</p>
          <div className="max-h-60 space-y-0.5 overflow-y-auto">
            {accounts.map(({ handle, name, logoUrl }) => option(handle, name, logoUrl))}
          </div>
        </div>}
      </div>
    </div>
  </div>;
}
