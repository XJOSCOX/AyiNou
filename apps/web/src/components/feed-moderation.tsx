"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { moderationActions, type FeedReport, type ModerationAction, type ModerationScope } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { loadModeration, moderateFeedContent } from "@/lib/feed-api";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { safetyMessages } from "@/lib/safety-i18n";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { PostMediaGallery } from "./post-media";
import { institutionAction, institutionCard, institutionField, institutionLink } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { AppealReviewQueue } from "./moderation-appeals";

const tabs = ["reports", "hidden"] as const;
const targets = ["posts", "comments"] as const;
type Target = (typeof targets)[number];
const choiceStyle = "min-h-10 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)]";

function moderationMfa(community?: string) {
  return `/mfa?next=${encodeURIComponent(community ? `/communities/${community}/moderation` : "/feed/moderation")}`;
}

export function FeedModeration({ community, initialTarget = "posts", initialScope = "reports" }: {
  community?: string; initialTarget?: Target; initialScope?: ModerationScope;
}) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const [scope, setScope] = useState<ModerationScope>(initialScope);
  const [target, setTarget] = useState<Target>(initialTarget);
  const [appeals, setAppeals] = useState(false);
  const safety = safetyMessages[locale];
  const c = communityDirectoryMessages[locale];
  const hidden = target === "posts" ? t.hiddenPosts : t.hiddenComments;

  return <MemberShell>
    <div className="grid w-full min-w-0 gap-5">
      <PageHeader title={community ? c.moderation : t.moderation} description={t.moderationIntro}
        actions={<Link href={community ? `/communities/${community}` : "/feed"} className={institutionLink}>{community ? c.back : t.backToFeed}</Link>} />
      {!community && <div role="group" aria-label={t.moderation} className="flex flex-wrap gap-2">
        <button type="button" className={choiceStyle} aria-pressed={!appeals} onClick={() => setAppeals(false)}>{t.pendingReports}</button>
        <button type="button" className={choiceStyle} aria-pressed={appeals} onClick={() => setAppeals(true)}>{safety.review}</button>
      </div>}
      {appeals ? <AppealReviewQueue /> : <>
      <div role="group" aria-label={t.queueContent} className="flex flex-wrap gap-2">
        {targets.map((kind) => <button key={kind} type="button" aria-pressed={kind === target}
          className={choiceStyle} onClick={() => setTarget(kind)}>{kind === "posts" ? t.postQueue : t.commentQueue}</button>)}
      </div>
      <div role="group" aria-label={t.moderation} className="flex flex-wrap gap-2">
        {tabs.map((tab) => <button key={tab} type="button" aria-pressed={scope === tab} onClick={() => setScope(tab)}
          className={choiceStyle}>
          {tab === "reports" ? t.pendingReports : hidden}
        </button>)}
      </div>
      <Queue key={`${target}:${scope}`} scope={scope} target={target} label={scope === "reports" ? t.pendingReports : hidden} community={community} />
      </>}
    </div>
  </MemberShell>;
}

function Queue({ scope, target, label, community }: { scope: ModerationScope; target: Target; label: string; community?: string }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { reports, nextCursor } = await loadModeration(scope, target, cursor, signal, community);
    return { rows: reports, nextCursor };
  }, [scope, target, community]);
  const resource = useCursorPage(load, revision);
  const roleDenied = ["MFA_REQUIRED", "FORBIDDEN", "UNAUTHORIZED"].includes(apiErrorCode(resource.error));

  return <section className="grid gap-3" aria-label={label}>
    {saved && <p role="status" className="text-sm text-[var(--theme-link)]">{t.decisionRecorded}</p>}
    {resource.error !== null && <div className="grid gap-2">
      <ApiErrorNotice error={resource.error} retry={roleDenied ? undefined : resource.retry} />
      {apiErrorCode(resource.error) === "MFA_REQUIRED" && <Link href={moderationMfa(community)} className={institutionLink}>{t.checkMfa}</Link>}
    </div>}
    {!resource.page && resource.error === null && <p role="status">{t.working}</p>}
    {resource.page?.rows.length === 0 && <p className={institutionCard}>{t.queueEmpty}</p>}
    {!roleDenied && resource.page?.rows.map((item) => <ReviewItem key={item.id} item={item} community={community}
      refresh={() => { setSaved(true); setRevision((value) => value + 1); }} />)}
    {!roleDenied && resource.page?.nextCursor && <button type="button" disabled={resource.loadingMore}
      className={`${institutionAction} justify-self-start`} onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.working : t.loadMore}</button>}
  </section>;
}

function ReviewItem({ item, refresh, community }: { item: FeedReport; refresh: () => void; community?: string }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const mutation = useFeedMutation();
  const [reason, setReason] = useState("");
  const [completed, setCompleted] = useState(false);
  const actions = moderationActions.filter((action) => {
    if (action === "dismiss") return item.category !== null;
    if (item.deleted) return false;
    return action === "restore" ? item.status === "hidden"
      : action === "hide" ? item.status === "published" : item.status === "published" || item.status === "hidden";
  });
  const [choice, setChoice] = useState<ModerationAction | "">("");
  const action = actions.includes(choice as ModerationAction) ? choice : "";
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || item.own || completed || reason.trim().length < 10) return;
    if (await mutation.run(() => moderateFeedContent(item.commentId ? "comments" : "posts", item.commentId ?? item.postId, item.version, action, reason, community))) {
      setCompleted(true);
      refresh();
    }
  }
  const labels = item.commentId
    ? { hide: t.hideComment, restore: t.restoreComment, remove: t.removeComment, dismiss: t.dismiss }
    : { hide: t.hide, restore: t.restore, remove: t.remove, dismiss: t.dismiss };

  return <article className={institutionCard}>
    <header>
      <h2 className="font-semibold">{item.category ? t[item.category] : t.hidden}</h2>
      <time dateTime={item.createdAt} className="text-xs text-[var(--theme-body)]">{format.format(new Date(item.createdAt))}</time>
    </header>
    {item.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--theme-body)]">{item.note}</p>}
    <p lang={item.language} dir="auto" className="mt-3 whitespace-pre-wrap break-words rounded-md bg-[var(--theme-control)] p-3 text-sm">{item.body}</p>
    {item.attachments && !completed && <PostMediaGallery post={item.postId} attachments={item.attachments} review />}
    {item.deleted && <p className="mt-2 text-sm font-semibold">{t.authorDeleted}</p>}
    {item.status === "removed" && <p className="mt-2 text-sm font-semibold">{t.removed}</p>}
    {item.lastAction && <div className="mt-3 border-t border-[var(--theme-border)] pt-3 text-sm">
      <h3 className="font-semibold">{t.lastDecision} · {labels[item.lastAction.action]}</h3>
      <p className="break-words">{item.lastAction.reason}</p>
      <time dateTime={item.lastAction.createdAt} className="text-xs text-[var(--theme-body)]">{format.format(new Date(item.lastAction.createdAt))}</time>
    </div>}
    {item.own ? <p className="mt-3 text-sm">{item.commentId ? t.cannotModerateOwnComment : t.cannotModerateOwn}</p> : actions.length > 0 && !completed &&
      <form className="mt-4 grid gap-3 border-t border-[var(--theme-border)] pt-4" onSubmit={submit} aria-busy={mutation.busy}>
        <label className="text-sm font-semibold">{t.moderationAction}
          <select className={institutionField} value={action} required disabled={mutation.busy}
            onChange={(event) => setChoice(actions.find((value) => value === event.target.value) ?? "")}>
            <option value="" disabled>—</option>
            {actions.map((value) => <option value={value} key={value}>{labels[value]}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">{t.decisionReason}
          <input className={institutionField} value={reason} required minLength={10} maxLength={500} disabled={mutation.busy}
            onChange={(event) => setReason(event.target.value)} />
        </label>
        {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
        {apiErrorCode(mutation.error) === "MFA_REQUIRED" && <Link href={moderationMfa(community)} className={institutionLink}>{t.checkMfa}</Link>}
        <button type="submit" className={`${institutionAction} justify-self-start`} disabled={mutation.busy || !action}>
          {mutation.busy ? t.working : t.recordDecision}
        </button>
      </form>}
  </article>;
}
