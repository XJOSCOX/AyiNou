"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { DiscoveryCard, FollowList, FollowStatus, FollowTarget } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { loadFollowList, readFollow, writeFollow } from "@/lib/discovery-api";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { reconcileFollow } from "@/lib/follow-state";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { InstitutionStatus, VerifiedCheck, institutionAction, institutionCard, institutionLink, useInstitutionResource } from "./institution-ui";

export const discoveryTab = "min-h-10 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-selected)] aria-pressed:bg-[var(--theme-selected)] disabled:opacity-60";

function FollowControl({ target, following, onChange }: {
  target: FollowTarget;
  following: boolean;
  onChange: (status: FollowStatus) => void;
}) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const mutation = useFeedMutation();

  async function toggle() {
    const next = !following;
    await mutation.run(() => reconcileFollow(next, () => writeFollow(target, next), () => readFollow(target, true), onChange));
  }

  return <div className="grid min-w-0 gap-2">
    <button type="button" className={`${discoveryTab} justify-self-start`} aria-pressed={following}
      title={following ? t.unfollow : t.follow} disabled={mutation.busy} onClick={() => { void toggle(); }}>
      {following ? t.following : t.follow}
    </button>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
  </div>;
}

type FollowChange = (account: DiscoveryCard, state: FollowStatus) => void;

export function DiscoveryAccounts({ rows, compact, onChange }: {
  rows: DiscoveryCard[];
  compact?: boolean;
  onChange?: FollowChange;
}) {
  return <ul className={compact ? "divide-y divide-[var(--theme-border)]" : "grid min-w-0 gap-3 md:grid-cols-2"}>
    {rows.map((account) => <DiscoveryAccount key={account.id} account={account} compact={compact} onChange={onChange} />)}
  </ul>;
}

function DiscoveryAccount({ account, compact, onChange }: { account: DiscoveryCard; compact?: boolean; onChange?: FollowChange }) {
  const [locale] = useLocale();
  const [following, setFollowing] = useState(account.following);
  const labels = institutionMessages[locale];
  const href = account.kind === "member" ? `/members/${account.handle}` : `/organization/${account.handle}`;
  const target = account.kind === "member"
    ? { kind: account.kind, key: account.handle } : { kind: account.kind, key: account.targetId };
  const country = account.kind === "institution"
    ? new Intl.DisplayNames([locale], { type: "region" }).of(account.countryCode)
    : null;

  return <li className={compact ? "min-w-0 py-3" : institutionCard}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <Link className={`${institutionLink} break-words`} href={href}>{account.name}</Link>
        {account.kind === "member" && account.verified && <>{" "}<VerifiedCheck label={feedMessages[locale].verified} /></>}
        <p className="break-all text-xs text-[var(--theme-body)]">@{account.handle}</p>
      </div>
      {account.kind === "institution" && <InstitutionStatus status={account.verificationStatus} />}
    </div>
    {account.kind === "institution" && <>
      <p className="mt-2 break-words text-sm text-[var(--theme-body)]">{[labels[account.category], country, account.departmentCode].filter(Boolean).join(" · ")}</p>
      {!compact && account.description && <p className="mt-2 whitespace-pre-line break-words text-sm">{account.description}</p>}
    </>}
    {(account.kind !== "member" || !account.self) && <div className="mt-3">
      <FollowControl target={target} following={following} onChange={(status) => {
        setFollowing(status.following);
        onChange?.(account, status);
      }} />
    </div>}
  </li>;
}

export function ProfileFollowPanel({ target, signedIn, initial }: { target: FollowTarget; signedIn: boolean; initial?: FollowStatus }) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const [list, setList] = useState<FollowList | null>(null);
  const [updated, setUpdated] = useState<FollowStatus | null>(null);
  const { kind, key } = target;
  const loader = useCallback((signal: AbortSignal) => readFollow({ kind, key }, signedIn, signal), [kind, key, signedIn]);
  const resource = useInstitutionResource(loader);
  const count = new Intl.NumberFormat(locale);
  if (apiErrorCode(resource.error) === "NOT_FOUND") return null;
  const state = updated ?? resource.data ?? initial;

  function choose(value: FollowList) { setList((current) => current === value ? null : value); }

  return <section className={institutionCard} aria-label={t.accounts}>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!state && !resource.error && <p role="status">{feedMessages[locale].working}</p>}
    {state && <div className="flex flex-wrap items-start gap-2">
      {signedIn ? <button type="button" className={discoveryTab} aria-expanded={list === "followers"} onClick={() => choose("followers")}>
        {t.followers} · {count.format(state.followerCount)}
      </button> : <p>{t.followers} · {count.format(state.followerCount)}</p>}
      {state.followingCount !== null && (signedIn
        ? <button type="button" className={discoveryTab} aria-expanded={list === "following"} onClick={() => choose("following")}>
          {t.followingCount} · {count.format(state.followingCount)}
        </button>
        : <p>{t.followingCount} · {count.format(state.followingCount)}</p>)}
      {signedIn && state.canFollow && <FollowControl target={target} following={state.following} onChange={setUpdated} />}
    </div>}
    {list && <div className="mt-4">
      <FollowAccountList key={list} target={target} list={list} />
    </div>}
  </section>;
}

export function FollowAccountList({ target, list }: { target: FollowTarget | null; list: FollowList }) {
  const kind = target?.kind;
  const key = target?.key;
  const loader = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { accounts, nextCursor } = await loadFollowList(kind && key ? { kind, key } : null, list, cursor, signal);
    return { rows: accounts, nextCursor };
  }, [kind, key, list]);
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  return <DiscoveryResults load={loader} empty={list === "followers" ? t.emptyFollowers : t.emptyFollowing}
    removeUnfollowed={target === null} />;
}

export function DiscoveryResults({ load, empty, removeUnfollowed = false }: {
  load: (cursor: string | null, signal: AbortSignal) => Promise<{ rows: DiscoveryCard[]; nextCursor: string | null }>;
  empty: string;
  removeUnfollowed?: boolean;
}) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const resource = useCursorPage(load);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const visible = resource.page?.rows.filter((row) => !removed.has(row.id)) ?? [];
  const unavailable = ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"].includes(apiErrorCode(resource.error));

  return <div className="grid min-w-0 gap-3">
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{t.working}</p>}
    {!unavailable && resource.page && <>
      {visible.length ? <DiscoveryAccounts rows={visible} onChange={(account, state) => {
        if (removeUnfollowed && !state.following) setRemoved((current) => new Set([...current, account.id]));
      }} /> : <p className={institutionCard}>{empty}</p>}
      {resource.page.nextCursor && <button type="button" className={`${institutionAction} justify-self-start`}
        disabled={resource.loadingMore} onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.working : t.loadMore}</button>}
    </>}
  </div>;
}
