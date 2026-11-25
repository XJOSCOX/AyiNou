"use client";

import { notificationPreferenceKeys, type Locale, type MemberNotification, type ProjectOperationEvent, type ProjectProgressEvent } from "@ayinou/shared";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { organizationRoleMessages } from "@/lib/organization-role-i18n";
import { projectMessages } from "@/lib/project-i18n";
import { projectWorkMessages } from "@/lib/project-work-i18n";
import { projectProgressMessages } from "@/lib/project-progress-i18n";
import { pollMessages } from "@/lib/poll-i18n";
import Image from "next/image";
import Link from "next/link";
import { recruitmentPath } from "@/lib/recruitment-api";
import { recruitmentCopy } from "@/lib/recruitment-i18n";
import { loadSocialPreferences, saveSocialPreferences, type SocialNoticePreferences } from "@/lib/social-api";
import { f24Messages } from "@/lib/f24-i18n";
import { socialMessages } from "@/lib/social-i18n";
import { useState } from "react";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { needLinkWorkspace } from "./need-project-links";
import { needProjectLabel } from "@/lib/need-project-links-i18n";
import { publicationLabel } from "@/lib/community-need-publication-i18n";
import { needReviewLabel } from "@/lib/community-needs-review-i18n";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { safetyMessages } from "@/lib/safety-i18n";
import { trustMessages } from "@/lib/trust-i18n";
import { loadNotificationPreferences, loadNotifications, markNotifications, saveNotificationPreferences } from "@/lib/notification-api";
import { eventMessages } from "@/lib/events-i18n";
import { EventNoticePreference } from "./event-settings";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, PersonalClaimChecks, useInstitutionResource } from "./institution-ui";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { MemberAppeals } from "./enforcement-appeals";
import { OutcomeReviewNotices } from "@/features/projects/outcome-review/member-review";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

function notificationTarget({ available, kind, actor, postId, commentId, appealId, projectOperation, pollEvent, communityEvent, communityNeed, recruitment }: MemberNotification) {
  if (!available) return null;
  if (kind === "volunteer_recruitment") return recruitment ? recruitmentPath + "/" + recruitment.id : null;
  if (kind === "need_project_notice") return needLinkWorkspace;
  if (kind === "community_need_notice") return communityNeed ? "/communities/intake/needs/" + communityNeed.needId : null;
  if (kind === "event_notice") return communityEvent ? "/events/" + communityEvent.eventId : null;
  if (kind === "poll_event") return pollEvent ? pollEvent.action === "nomination_requested" ? "/polls/nominations" : "/polls/" + pollEvent.pollId : null;
  if (kind === "follow_requested") return "/settings#follow-requests";
  if (kind === "new_follower" || kind === "follow_approved") return actor?.username ? `/members/${encodeURIComponent(actor.username)}` : null;
  if (kind === "appeal_decided") return appealId ? `/settings/appeals#appeal-${appealId}` : null;
  if (kind === "verification_decided" || kind === "verification_appeal_decided") return "/verification";
  if (kind === "representative_access_changed") return "/institutions";
  if (kind === "ambassador_invited" || kind === "ambassador_updated") return "/settings/ambassadors";
  if (kind === "organization_access_changed") return "/institutions";
  if (kind === "project_assigned") return "/projects/review";
  if (kind === "project_operation" && projectOperation) {
    const action = projectOperation.action;
    const section = action.startsWith("milestone_") ? "milestones" :
      action.startsWith("report_") || action === "progress_project_completed" ? "outcomes" :
      action.startsWith("entry_") || action === "team_update_shared" ? "updates" :
      action.startsWith("task_") ? "tasks" : action.startsWith("volunteer_") ? "volunteers" : "team";
    return "/projects/" + projectOperation.projectId + "/work?section=" + section;
  }
  if (kind?.startsWith("project_")) return "/projects/manage";
  if (!postId) return null;
  return `/posts/${postId}${commentId ? `?comment=${commentId}` : ""}`;
}

const projectNoticeIcons = {
  project_approved: "/project-approved.png",
  project_rejected: "/project-rejected.png",
  project_changes: "/project-changes-requested.png",
} as const;

const noticePaths = {
  calendar: "M4 6h16v15H4zM8 3v6m8-6v6M4 11h16",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 13h8",
  chart: "M4 4v16h16M8 16v-4m5 4V7m5 9v-6",
  person: "M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1",
  bell: "M18 9a6 6 0 0 0-12 0c0 6-2 6-2 8h16c0-2-2-2-2-8m-8 11a2 2 0 0 0 4 0",
  check: "m5 12 4 4L19 6",
  arrow: "M5 12h14m-6-6 6 6-6 6",
} as const;

const inboxAction = "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 disabled:opacity-50";

function NoticeIcon({ name }: { name: keyof typeof noticePaths }) {
  return <svg aria-hidden="true" className="size-[1.125rem] shrink-0" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={noticePaths[name]} />
  </svg>;
}

function NoticeSymbol({ kind }: { kind: MemberNotification["kind"] }) {
  const projectIcon = kind === "project_approved" || kind === "project_rejected" || kind === "project_changes"
    ? projectNoticeIcons[kind] : null;
  const icon = kind === "event_notice" ? "calendar" : kind === "poll_event" ? "chart"
    : kind?.startsWith("project_") ? "folder" : kind?.startsWith("follow_") || kind === "new_follower" ? "person" : "bell";
  return <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--theme-control)] text-[var(--theme-link)] sm:size-10">
    {projectIcon ? <Image src={projectIcon} alt="" width={100} height={100} unoptimized className="size-6" /> : <NoticeIcon name={icon} />}
  </span>;
}

function notificationMessage(locale: Locale, item: MemberNotification) {
  const t = mediaNotificationMessages[locale];
  if (!item.available || !item.kind) return t.unavailable;
  switch (item.kind) {
    case "volunteer_recruitment": return item.recruitment ? recruitmentCopy(locale)("notice") + " · " + recruitmentCopy(locale)(item.recruitment.status) : t.unavailable;
    case "need_project_notice": return needProjectLabel(locale,"notice");
    case "community_need_notice": return item.communityNeed?.action.startsWith("publication_")
      ? publicationLabel(locale,item.communityNeed.action) : needReviewLabel(locale, item.communityNeed?.action ?? "reviewStatus");
    case "appeal_decided": return safetyMessages[locale].appeal_decided;
    case "verification_decided": return trustMessages[locale].verifyApplicationAlert;
    case "verification_appeal_decided": return trustMessages[locale].verifyAppealAlert;
    case "representative_access_changed": return trustMessages[locale].representativeAlert;
    case "ambassador_invited": return ambassadorMessages[locale].invitedNotice;
    case "ambassador_updated": return ambassadorMessages[locale].updatedNotice;
    case "organization_access_changed": return organizationRoleMessages[locale].notification;
    case "project_operation": return operationMessage(locale, item.projectOperation?.action);
    case "event_notice": return item.communityEvent
      ? eventMessages[locale][({ rsvp: "rsvpNotice", changed: "changeNotice", canceled: "cancellationNotice", announcement: "announcementNotice" } as const)[item.communityEvent.action]]
      : t.unavailable;
    case "poll_event": return item.pollEvent ? pollMessages[locale].notices[item.pollEvent.action] : t.unavailable;
    case "project_submitted":
    case "project_assigned":
    case "project_changes":
    case "project_approved":
    case "project_rejected": return projectMessages[locale].notices[item.kind];
  }

  const actor = <span className="inline-flex max-w-full flex-wrap items-center gap-x-1.5">
    <bdi className="wrap-anywhere">{item.actor?.displayName ?? t.someone}</bdi>
    {!!item.actor?.personalClaims?.length && <PersonalClaimChecks claims={item.actor.personalClaims} />}
    {item.actor?.founderVerified && <FounderVerifiedMark compact />}
  </span>;
  if (item.kind === "follow_requested" || item.kind === "follow_approved") {
    const action = item.kind === "follow_requested" ? "followRequestedNotice" : "followApprovedNotice";
    return <>{actor} {f24Messages[locale][action]}</>;
  }
  const template = item.kind === "post_mention" || item.kind === "post_repost" || item.kind === "post_quote"
    ? socialMessages[locale][item.kind] : t[item.kind];
  const [beforeActor, afterActor] = template.split("{actor}");
  return afterActor === undefined ? template : <>{beforeActor}{actor}{afterActor}</>;
}

export function NotificationCenter() {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const [revision, setRevision] = useState(0);
  const resource = useCursorPage(loadNotifications, revision);
  const mutation = useFeedMutation();
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const rows = resource.page?.rows;
  const isUnread = (item: MemberNotification) => !item.readAt && !read.has(item.id);
  const canMarkAll = !!resource.page?.nextCursor || !!rows?.some(isUnread);
  async function mark(id?: string) {
    if (!await mutation.run(() => markNotifications(id))) return;
    if (id) setRead((known) => new Set([...known, id]));
    else setRevision((current) => current + 1);
  }
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  const days = new Map<string, MemberNotification[]>();
  for (const item of rows ?? []) {
    const day = date.format(new Date(item.createdAt));
    const group = days.get(day);
    if (group) group.push(item);
    else days.set(day, [item]);
  }

  return <MemberShell><section className="grid min-w-0 gap-4" aria-label={t.notifications}>
    <PageHeader title={t.notifications}
      className="rounded-xl sm:!py-4 [&>div:first-child]:!border-0 [&>div:first-child]:!ps-0 [&>div+div]:ms-auto"
      actions={<>
        <Link href="/settings#notification-preferences" className={inboxAction}>{t.preferences}</Link>
        <button type="button" className={inboxAction} disabled={mutation.busy || !canMarkAll} onClick={() => { void mark(); }}>
          <NoticeIcon name="check" />{t.markAll}
        </button>
      </>} />
    <MemberAppeals noticesOnly />
    <OutcomeReviewNotices />
    <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      {resource.error !== null && <div className="p-4"><ApiErrorNotice error={resource.error} retry={resource.retry} /></div>}
      {mutation.error !== null && <div className="p-4"><ApiErrorNotice error={mutation.error} /></div>}
      {!rows && resource.error === null && <div role="status" className="divide-y divide-[var(--theme-border)]">
        <span className="sr-only">{t.working}</span>
        {[0, 1, 2].map((row) => <div key={row} aria-hidden="true" className="flex gap-3 px-4 py-4 motion-safe:animate-pulse sm:px-5">
          <span className="size-9 rounded-lg bg-[var(--theme-control)]" />
          <div className="grid w-full gap-2">
            <span className="h-4 w-1/2 max-w-72 rounded bg-[var(--theme-selected)]" />
            <span className="h-3 w-20 rounded bg-[var(--theme-control)]" />
          </div>
        </div>)}
      </div>}
      {rows?.length === 0 && <div role="status" className="flex items-center justify-center gap-3 px-4 py-10 text-sm text-[var(--theme-body)]">
        <NoticeSymbol kind={null} />{t.empty}
      </div>}
      {Array.from(days, ([day, items]) => <section key={day} className="border-b border-[var(--theme-border)] last:border-b-0">
        <h2 className="border-b border-[var(--theme-border)] bg-[var(--theme-control)] px-4 py-2 text-sm font-semibold text-[var(--theme-body)] sm:px-5">{day}</h2>
        <ul className="divide-y divide-[var(--theme-border)]">{items.map((item) => {
          const target = notificationTarget(item);
          const unread = isUnread(item);
          const highlighted = unread && item.available;
          const summary = <div className="min-w-0 flex-1">
            <p className={highlighted ? "wrap-anywhere text-sm font-semibold" : "wrap-anywhere text-sm"}>{notificationMessage(locale, item)}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--theme-body)]">
              <time dateTime={item.createdAt}>{time.format(new Date(item.createdAt))}</time>
              {highlighted && <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--theme-link)]">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{t.new}
              </span>}
            </p>
          </div>;
          const rowContent = "flex min-w-0 flex-1 items-start gap-3 px-4 py-3 sm:px-5";
          return <li key={item.id} className={"flex items-center " + (highlighted ? "bg-[color-mix(in_srgb,var(--theme-selected)_28%,var(--theme-surface))]" : "")}>
            {target ? <Link href={target} className={rowContent + " group self-stretch hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:-outline-offset-2"}>
              <span className="sr-only">{t.openTarget} </span><NoticeSymbol kind={item.kind} />{summary}
              <span aria-hidden="true" className="self-center text-[var(--theme-link)] group-hover:translate-x-0.5"><NoticeIcon name="arrow" /></span>
            </Link> : <div className={rowContent}><NoticeSymbol kind={item.kind} />{summary}</div>}
            {unread && <button type="button" title={t.mark} disabled={mutation.busy}
              className="me-2 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 disabled:opacity-50 sm:me-4"
              onClick={() => { void mark(item.id); }}>
              <NoticeIcon name="check" /><span className="sr-only sm:not-sr-only">{t.mark}</span>
            </button>}
          </li>;
        })}</ul>
      </section>)}
      {resource.page?.nextCursor && <div className="flex justify-center border-t border-[var(--theme-border)] p-3">
        <button type="button" disabled={resource.loadingMore} className={inboxAction}
          onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.working : t.more}</button>
      </div>}
    </div>
  </section></MemberShell>;
}

function operationMessage(locale: keyof typeof projectWorkMessages, action?: ProjectOperationEvent | ProjectProgressEvent) {
  const progress = projectProgressMessages[locale].actions;
  if (action && Object.hasOwn(progress, action)) return progress[action as keyof typeof progress];
  const { notices } = projectWorkMessages[locale];
  return action && Object.hasOwn(notices, action) ? notices[action as keyof typeof notices] : notices.taskUpdate;
}

export function NotificationPreferencesPanel() {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const resource = useInstitutionResource(loadNotificationPreferences);
  const mutation = useFeedMutation();
  const [changes, setChanges] = useState<Partial<Awaited<ReturnType<typeof loadNotificationPreferences>>>>({});
  const [saved, setSaved] = useState(false);
  const preferences = resource.data ? { ...resource.data, ...changes } : null;
  return <><section id="notification-preferences" className={institutionCard + " scroll-mt-24"}>
    <h2 className="text-xl font-semibold">{t.preferences}</h2>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!preferences && resource.error === null && <p className="mt-3" role="status">{t.working}</p>}
    {preferences && <form className="mt-3 grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      void mutation.run(async () => {
        const result = await saveNotificationPreferences(preferences);
        setChanges(result);
        setSaved(true);
      });
    }}>
      {notificationPreferenceKeys.map((key) => <label key={key} className="flex items-center gap-2">
        <input type="checkbox" className="size-4 accent-[var(--theme-link)]" checked={preferences[key]} disabled={mutation.busy}
          onChange={(event) => { const checked = event.target.checked; setSaved(false); setChanges((current) => ({ ...current, [key]: checked })); }} />
        {t[key]}
      </label>)}
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
      {saved && <p role="status" className="text-sm text-[var(--theme-link)]">{t.saved}</p>}
      <button className={`${institutionAction} justify-self-start`} type="submit" disabled={mutation.busy}>{t.save}</button>
    </form>}
  </section><SocialNotificationPreferences /><EventNoticePreference /></>;
}

function SocialNotificationPreferences() {
  const [locale] = useLocale();
  const t = socialMessages[locale];
  const labels = mediaNotificationMessages[locale];
  const resource = useInstitutionResource(loadSocialPreferences);
  const mutation = useFeedMutation();
  const [changes, setChanges] = useState<Partial<SocialNoticePreferences>>({});
  const [saved, setSaved] = useState(false);
  const preferences = resource.data ? { ...resource.data, ...changes } : null;
  return <section className={institutionCard} aria-label={labels.preferences}>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!preferences && resource.error === null && <p role="status">{labels.working}</p>}
    {preferences && <form className="grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      void mutation.run(async () => {
        setChanges(await saveSocialPreferences(preferences));
        setSaved(true);
      });
    }}>
      {(["mentions", "reposts", "quotes"] as const).map((key) => <label key={key} className="flex items-center gap-2">
        <input type="checkbox" checked={preferences[key]} disabled={mutation.busy} onChange={(event) => {
          const checked = event.target.checked;
          setSaved(false);
          setChanges((prior) => ({ ...prior, [key]: checked }));
        }} />{t[key]}
      </label>)}
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
      {saved && <p role="status">{labels.saved}</p>}
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{labels.save}</button>
    </form>}
  </section>;
}
