"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { clearSafetyAccount, loadMute, loadSafetyAccounts, setMemberSafety, type SafetyList } from "@/lib/safety-api";
import { safetyMessages } from "@/lib/safety-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionLink, useInstitutionResource } from "./institution-ui";

export function MemberSafetyControls({ username, collapsible = false }: { username: string; collapsible?: boolean }) {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  const router = useRouter();
  const load = useCallback((signal: AbortSignal) => loadMute(username, signal), [username]);
  const status = useInstitutionResource(load);
  const [changed, setChanged] = useState<boolean>();
  const [confirming, setConfirming] = useState(false);
  const mutation = useFeedMutation();
  const muted = changed ?? status.data?.muted;

  async function block() {
    if (await mutation.run(() => setMemberSafety(username, "block", true))) router.replace("/settings#member-safety");
  }
  async function toggleMute() {
    if (muted === undefined) return;
    if (await mutation.run(() => setMemberSafety(username, "mute", !muted))) setChanged(!muted);
  }

  const controls = <>
    {status.error !== null && <ApiErrorNotice error={status.error} retry={status.refresh} />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {confirming ? <div className="mt-2 grid gap-3" role="group" aria-label={t.confirmBlock}>
      <p className="font-medium">{t.confirmBlock}</p>
      <p className="text-sm text-[var(--theme-body)]">{t.blockHelp}</p>
      <div className="flex flex-wrap gap-4">
        <button type="button" className={institutionAction} disabled={mutation.busy} onClick={() => { void block(); }}>{t.block}</button>
        <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => setConfirming(false)}>{t.cancel}</button>
      </div>
    </div> : <div className="flex flex-wrap gap-4">
      <button type="button" className={institutionLink} disabled={mutation.busy || muted === undefined} onClick={() => { void toggleMute(); }}>
        {muted ? t.unmute : t.mute}
      </button>
      <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => setConfirming(true)}>{t.block}</button>
    </div>}
  </>;
  return collapsible ? <details className={institutionCard}>
    <summary className="cursor-pointer font-semibold">{t.title}</summary>
    <div className="mt-3">{controls}</div>
  </details> : <section className={institutionCard}>
    <h2 className="mb-3 text-lg font-semibold">{t.title}</h2>
    {controls}
  </section>;
}

export function MemberSafetySettings() {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  return <section id="member-safety" className={institutionCard}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">{t.title}</h2>
      <Link href="/settings/appeals" className={institutionLink}>{t.appeals}</Link>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <SafetyAccounts list="blocked" />
      <SafetyAccounts list="muted" />
    </div>
  </section>;
}

function SafetyAccounts({ list }: { list: SafetyList }) {
  const [locale] = useLocale();
  const t = safetyMessages[locale];
  const loader = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { accounts, nextCursor } = await loadSafetyAccounts(list, cursor, signal);
    return { rows: accounts, nextCursor };
  }, [list]);
  const resource = useCursorPage(loader);
  const mutation = useFeedMutation();
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const rows = resource.page?.rows.filter(({ id }) => !removed.has(id));
  const undo = async (id: string) => {
    if (await mutation.run(() => clearSafetyAccount(list, id))) setRemoved((values) => new Set([...values, id]));
  };
  return <section className="min-w-0 rounded-md border border-[var(--theme-border)] p-3">
    <h3 className="font-semibold">{t[list]}</h3>
    {list === "muted" && <p className="mt-2 text-sm text-[var(--theme-body)]">{t.muteHelp}</p>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {!rows && resource.error === null && <p className="mt-2 text-sm" role="status">{t.loading}</p>}
    {rows?.length === 0 && !resource.page?.nextCursor && <p className="mt-2 text-sm text-[var(--theme-body)]">
      {list === "blocked" ? t.emptyBlocked : t.emptyMuted}
    </p>}
    {!!rows?.length && <ul className="mt-2 grid gap-2">{rows.map(({ id, username, name }) =>
      <li key={id} className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words" title={username ? `@${username}` : undefined}>{name ?? t.unavailable}</span>
        <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => { void undo(id); }}>
          {list === "blocked" ? t.unblock : t.unmute}
        </button>
      </li>)}</ul>}
    {resource.page?.nextCursor && <button type="button" className={`${institutionLink} mt-2`} disabled={resource.loadingMore}
      onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.loading : t.more}</button>}
  </section>;
}
