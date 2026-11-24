"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { FeedPost } from "@ayinou/shared";
import { postBodyLimit } from "@ayinou/shared";
import { loadInstitutionAccounts } from "@/lib/institution-api";
import { useFeedMutation } from "@/lib/feed-state";
import { feedMessages } from "@/lib/feed-i18n";
import { useLocale } from "@/lib/locale-store";
import { canPublishAsOrganization, publishedProjectId, publishSocialPost, setInteraction } from "@/lib/social-api";
import { socialMessages } from "@/lib/social-i18n";
import { EventPostPreview } from "./events";
import { ApiErrorNotice } from "./api-error-notice";
import { FeedIcon, feedIconButton, feedToolbarButton } from "./feed-actions";
import { institutionAction, institutionField, institutionLink, useInstitutionResource, VerifiedCheck } from "./institution-ui";
import { MentionSuggestions } from "./social-text";

export function usePostBookmark(post: FeedPost, onChange?: () => void) {
  const mutation = useFeedMutation();
  const [saved, setSaved] = useState<boolean | null>(null);
  const value = saved ?? post.social?.bookmarked ?? Boolean(post.unavailable);
  async function toggle() {
    if (await mutation.run(() => setInteraction(post.id, "bookmark", !value))) { setSaved(!value); onChange?.(); }
  }
  return { value, toggle, error: mutation.error, busy: mutation.busy };
}

export function OrganizationPostBadges({ post }: { post: FeedPost }) {
  const [locale] = useLocale();
  const t = socialMessages[locale];
  if (!post.social?.organization) return null;
  return <>
    {post.social.organization.verified && <VerifiedCheck label={t.verifiedOrganization} />}
    {post.social.announcement && <span className="rounded-md bg-[var(--theme-selected)] px-2 py-1 text-xs font-semibold text-[var(--theme-link)]">
      {t.announcement}
    </span>}
  </>;
}

export function QuotePreview({ post }: { post: FeedPost }) {
  const [locale] = useLocale();
  const t = socialMessages[locale];
  const quote = post.social?.quote;
  if (!quote) return post.social?.event ? <EventPostPreview event={post.social.event} /> : null;
  return <aside className="mt-3 grid min-w-0 gap-1 rounded-md border border-[var(--theme-border)] p-3 text-sm" aria-label={t.original}>
    {"unavailable" in quote ? <p>{t.unavailable}</p> : <>
      <Link className={institutionLink} href={`/posts/${quote.id}`}>{quote.organization?.name ?? quote.author?.displayName ?? t.original}</Link>
      <p dir="auto" lang={quote.language} className="whitespace-pre-wrap break-words">{quote.body}</p>
    </>}
  </aside>;
}

export function SocialPostControls({ post, bookmark, onChange, leading, trailing }: {
  post: FeedPost; leading?: ReactNode; trailing?: ReactNode; bookmark?: ReturnType<typeof usePostBookmark>; onChange?: () => void;
}) {
  const [locale] = useLocale();
  const t = socialMessages[locale];
  const ownBookmark = usePostBookmark(post, onChange);
  const save = bookmark ?? ownBookmark;
  const social = post.social;
  const mutation = useFeedMutation();
  const [reposted, setReposted] = useState<boolean | null>(null);
  const [quote, setQuote] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!social && !post.unavailable) return leading || trailing
    ? <div className="flex flex-wrap items-center gap-1">{leading}{trailing}</div> : null;
  const active = reposted ?? social?.reposted ?? false;
  const count = Math.max(0, (social?.repostCount ?? 0) + Number(active) - Number(social?.reposted ?? false));
  const buttonClass = leading ? feedToolbarButton : feedIconButton;
  return <div className={leading ? "grid gap-2" : "mt-3 grid gap-2"}>
    <div className="flex flex-wrap items-start gap-1">
      {leading}
      {(social?.shareable || social?.reposted) && <button type="button" className={buttonClass}
        aria-label={active ? t.undoRepost : t.repost} title={active ? t.undoRepost : t.repost} aria-pressed={active}
        disabled={mutation.busy} onClick={() => { void mutation.run(async () => {
          await setInteraction(post.id, "repost", !active); setReposted(!active);
        }); }}><FeedIcon name="repost" /></button>}
      {!!count && <span className="self-center text-xs" aria-label={t.reposts}>{new Intl.NumberFormat(locale).format(count)}</span>}
      {social?.quotable && <button type="button" className={buttonClass} aria-label={t.quote} title={t.quote} aria-expanded={quote}
        onClick={() => setQuote(!quote)}><FeedIcon name="quote" /></button>}
      <button type="button" className={buttonClass} aria-label={save.value ? t.removeBookmark : t.bookmark}
        title={save.value ? t.removeBookmark : t.bookmark} aria-pressed={save.value} disabled={save.busy}
        onClick={() => { void save.toggle(); }}><FeedIcon name="bookmark" /></button>
      {post.visibility === "public" && post.status === "published" && <button type="button" className={buttonClass}
        aria-label={t.share} title={t.share} onClick={() => { void mutation.run(async () => {
          await navigator.clipboard.writeText(new URL(`/posts/${post.id}`, window.location.origin).href); setCopied(true);
        }); }}><FeedIcon name="share" /></button>}
      {copied && <span role="status" className="self-center text-sm">{t.copied}</span>}
      {trailing && <div className="ms-auto min-w-0 self-center">{trailing}</div>}
    </div>
    {save.error !== null && <ApiErrorNotice error={save.error} />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {quote && <SocialComposer source={{ sourceId: post.id }} onCancel={() => setQuote(false)} onPublished={() => {
      setQuote(false); onChange?.();
    }} />}
    {quote && <OrganizationPublisher sourceId={post.id} onPublished={() => { setQuote(false); onChange?.(); }} />}
  </div>;
}

export function SocialComposer({ source, onPublished, onCancel }: {
  source: { sourceId: string; organization?: undefined } | { organization: string; sourceId?: string }; onPublished: () => void; onCancel?: () => void;
}) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const [body, setBody] = useState("");
  const mutation = useFeedMutation();
  const receipt = useRef({ payload: "", id: "" });
  const labels = socialMessages[locale];
  const [announcement, setAnnouncement] = useState(false);
  const [project, setProject] = useState("");
  const projectId = publishedProjectId(project);
  const invalidProject = Boolean(project.trim() && !projectId);
  const allowed = Boolean(body.trim()) && Array.from(body).length <= postBodyLimit && !mutation.busy && !invalidProject;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!allowed) return;
    const input = { ...source, body, language: locale, ...(source.organization ? { announcement, projectId } : {}) };
    const key = JSON.stringify(input);
    if (receipt.current.payload !== key) receipt.current = { payload: key, id: crypto.randomUUID() };
    if (await mutation.run(() => publishSocialPost(input, receipt.current.id))) { setBody(""); onPublished(); }
  }
  return <form onSubmit={submit} className="grid gap-2 rounded-md border border-[var(--theme-border)] p-3">
    <label className="text-sm font-semibold">{t.body}
      <textarea className={institutionField} required rows={3} value={body} maxLength={postBodyLimit * 2}
        onChange={(event) => setBody(event.target.value)} />
    </label>
    <MentionSuggestions value={body} onChange={setBody} />
    {source.organization && <>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={announcement} onChange={(event) => setAnnouncement(event.target.checked)} />
        {labels.announcement}
      </label>
      <label className="text-sm font-semibold">{labels.projectLink}
        <input className={institutionField} value={project} maxLength={400} aria-invalid={invalidProject}
          onChange={(event) => setProject(event.target.value)} />
      </label>
      {invalidProject && <p role="status" className="text-sm">{labels.invalidProject}</p>}
    </>}
    <div className="flex flex-wrap gap-3">
      <button className={institutionAction} disabled={!allowed}>{t.publish}</button>
      {onCancel && <button type="button" className={institutionLink} onClick={onCancel}>{t.cancel}</button>}
    </div>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
  </form>;
}

export function OrganizationPublisher({ onPublished, handle, sourceId }: { onPublished: () => void; handle?: string; sourceId?: string }) {
  const [locale] = useLocale();
  const t = socialMessages[locale];
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState("");
  const accounts = useInstitutionResource(loadInstitutionAccounts);
  const eligible = accounts.data?.organizations.filter((account) => (!handle || handle === account.handle) && canPublishAsOrganization(account.role));
  if (!eligible?.length) return null;
  const current = eligible.find(({ handle }) => handle === selected) ?? eligible[0];
  return <div className="mt-3 grid gap-2">
    <button className={`${institutionLink} justify-self-start`} type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {t.publishOrganization}
    </button>
    {expanded && <>
      <label className="text-sm font-semibold">{t.organization}
        <select className={institutionField} value={current.handle} onChange={(event) => setSelected(event.target.value)}>
          {eligible.map(({ handle, name }) => <option key={handle} value={handle}>{name}</option>)}
        </select>
      </label>
      <SocialComposer key={current.handle} source={{ organization: current.handle, sourceId }} onPublished={() => { setExpanded(false); onPublished(); }}
        onCancel={() => setExpanded(false)} />
    </>}
  </div>;
}
