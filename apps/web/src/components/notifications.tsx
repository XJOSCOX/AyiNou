"use client";

import { notificationPreferenceKeys, type MemberNotification } from "@ayinou/shared";
import Link from "next/link";
import { useState } from "react";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { safetyMessages } from "@/lib/safety-i18n";
import { loadNotificationPreferences, loadNotifications, markNotifications, saveNotificationPreferences } from "@/lib/notification-api";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";

function notificationTarget({ available, kind, actor, postId, commentId, appealId }: MemberNotification) {
  if (!available) return null;
  if (kind === "new_follower") return actor?.username ? `/members/${encodeURIComponent(actor.username)}` : null;
  if (kind === "appeal_decided") return appealId ? `/settings/appeals#appeal-${appealId}` : null;
  if (!postId) return null;
  return `/posts/${postId}${commentId ? `?comment=${commentId}` : ""}`;
}

export function NotificationCenter() {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const resource = useCursorPage(loadNotifications);
  const mutation = useFeedMutation();
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const rows = resource.page?.rows;
  async function mark(id?: string) {
    if (!await mutation.run(() => markNotifications(id))) return;
    if (id) setRead((known) => new Set([...known, id]));
    else setRead((known) => new Set([...known, ...(rows?.map(({ id }) => id) ?? [])]));
  }
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <MemberShell><section className="grid gap-4" aria-label={t.notifications}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-semibold sm:text-4xl">{t.notifications}</h1>
      {!!rows?.length && <button type="button" className={institutionAction} disabled={mutation.busy} onClick={() => { void mark(); }}>{t.markAll}</button>}
    </header>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {!rows && resource.error === null && <p role="status">{t.working}</p>}
    {rows?.length === 0 && <p className={institutionCard}>{t.empty}</p>}
    {!!rows?.length && <ul className="grid gap-2">{rows.map((item) => {
      const target = notificationTarget(item);
      const newItem = item.available && !item.readAt && !read.has(item.id);
      const text = !item.available || !item.kind ? t.unavailable
        : item.kind === "appeal_decided" ? safetyMessages[locale].appeal_decided
        : t[item.kind].replace("{actor}", () => item.actor?.displayName ?? t.someone);
      return <li key={item.id} className={`${institutionCard} flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0"><p className={`break-words ${newItem ? "font-semibold" : ""}`}>{text}</p>
          <p className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--theme-body)]">
            <time dateTime={item.createdAt}>{date.format(new Date(item.createdAt))}</time>
            {newItem && <span className="font-semibold text-[var(--theme-link)]">{t.new}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {target && <Link href={target} className={institutionLink}>{t.openTarget}</Link>}
          {!item.readAt && !read.has(item.id) && <button className={institutionLink} type="button" disabled={mutation.busy}
            onClick={() => { void mark(item.id); }}>{t.mark}</button>}
        </div>
      </li>;
    })}</ul>}
    {resource.page?.nextCursor && <button type="button" disabled={resource.loadingMore} className={`${institutionAction} justify-self-start`}
      onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.working : t.more}</button>}
  </section></MemberShell>;
}

export function NotificationPreferencesPanel() {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const resource = useInstitutionResource(loadNotificationPreferences);
  const mutation = useFeedMutation();
  const [changes, setChanges] = useState<Partial<Awaited<ReturnType<typeof loadNotificationPreferences>>>>({});
  const [saved, setSaved] = useState(false);
  const preferences = resource.data ? { ...resource.data, ...changes } : null;
  return <section className={institutionCard}>
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
  </section>;
}
