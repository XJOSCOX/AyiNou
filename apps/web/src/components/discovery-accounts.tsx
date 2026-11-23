"use client";

import Link from "next/link";
import Image from "next/image";
import { f24Messages } from "@/lib/f24-i18n";
import { removeFollower } from "@/lib/f24-api";
import { useCallback, useState } from "react";
import type { DiscoveryCard, FollowList, FollowStatus, FollowTarget } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { loadFollowList, readFollow, writeFollow } from "@/lib/discovery-api";
import { followReposts } from "@/lib/social-api";
import { socialMessages } from "@/lib/social-i18n";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { reconcileFollow } from "@/lib/follow-state";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { InstitutionStatus, PersonalClaimChecks, institutionAction, institutionCard, institutionLink, useInstitutionResource } from "./institution-ui";

export const discoveryTab = "min-h-10 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-selected)] aria-pressed:bg-[var(--theme-selected)] disabled:opacity-60";

function FollowControl({ target, following, requestPending, requiresApproval, onChange }: {
  target: FollowTarget;
  following: boolean;
  requestPending?: boolean;
  requiresApproval?: boolean;
  onChange: (status: FollowStatus) => void;
}) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const mutation = useFeedMutation();

  async function toggle() {
    const next = !following && !requestPending;
    if (requiresApproval || requestPending) {
      await mutation.run(async () => onChange(await writeFollow(target, next)));
      return;
    }
    await mutation.run(() => reconcileFollow(next, () => writeFollow(target, next), () => readFollow(target, true), onChange));
  }

  const requestLabel = requestPending ? f24Messages[locale].cancelRequest : requiresApproval && !following ? f24Messages[locale].requestFollow : null;
  return <div className="grid min-w-0 gap-2">
    <button type="button" className={`${discoveryTab} justify-self-start`} aria-pressed={requestLabel ? undefined : following}
      title={requestLabel ?? (following ? t.unfollow : t.follow)} disabled={mutation.busy} onClick={() => { void toggle(); }}>
      {requestLabel ?? (following ? t.following : t.follow)}
    </button>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
  </div>;
}

type FollowChange = (account: DiscoveryCard, state: FollowStatus) => void;

export function DiscoveryAccounts({ rows, compact, onChange, onRemove }: {
  rows: DiscoveryCard[];
  compact?: boolean;
  onChange?: FollowChange;
  onRemove?: (account: DiscoveryCard) => void;
}) {
  return <ul className={compact ? "divide-y divide-[var(--theme-border)]" : "grid min-w-0 gap-3 md:grid-cols-2"}>
    {rows.map((account) => <DiscoveryAccount key={account.id} account={account} compact={compact} onChange={onChange} onRemove={onRemove} />)}
  </ul>;
}

function DiscoveryAccount({ account, compact, onChange, onRemove }: { account: DiscoveryCard; compact?: boolean; onChange?: FollowChange; onRemove?: (account: DiscoveryCard) => void }) {
  const [locale] = useLocale();
  const [updated, setUpdated] = useState<FollowStatus | null>(null);
  const followState = updated ?? account;
  const remove = useFeedMutation();
  const labels = institutionMessages[locale];
  const href = account.kind === "member" ? `/members/${account.handle}` : `/organization/${account.handle}`;
  const target = account.kind === "member"
    ? { kind: account.kind, key: account.handle } : { kind: account.kind, key: account.targetId };
  const country = account.kind === "institution"
    ? new Intl.DisplayNames([locale], { type: "region" }).of(account.countryCode)
    : null;

  return <li className={compact ? "min-w-0 py-3" : institutionCard}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      {account.kind === "member" && account.avatarUrl && <Image src={account.avatarUrl} width={40} height={40} alt="" unoptimized className="size-10 shrink-0 rounded-full object-cover" />}
      <div className="min-w-0 flex-1">
        <Link className={`${institutionLink} break-words`} href={href}>{account.name}</Link>
        {account.kind === "member" && !!account.personalClaims?.length && <>{" "}<PersonalClaimChecks claims={account.personalClaims} /></>}
        {account.kind === "member" && account.founderVerified && <>{" "}<FounderVerifiedMark compact /></>}
        <p className="break-all text-xs text-[var(--theme-body)]">@{account.handle}</p>
      </div>
      {account.kind === "institution" && <InstitutionStatus status={account.verificationStatus} kind={account.category} />}
    </div>
    {account.kind === "institution" && <>
      <p className="mt-2 break-words text-sm text-[var(--theme-body)]">{[labels[account.category], country, account.departmentCode].filter(Boolean).join(" · ")}</p>
      {!compact && account.description && <p className="mt-2 whitespace-pre-line break-words text-sm">{account.description}</p>}
    </>}
    {(account.kind !== "member" || (!account.self && (updated?.canFollow ?? account.canFollow) !== false)) && <div className="mt-3">
      <FollowControl target={target} following={followState.following}
        requestPending={account.kind === "member" ? updated?.requestPending ?? account.requestPending : undefined}
        requiresApproval={account.kind === "member" ? updated?.requiresApproval ?? account.requiresApproval : undefined}
        onChange={(status) => {
        setUpdated(status);
        onChange?.(account, status);
      }} />
    </div>}
    {onRemove && account.kind === "member" && <div className="mt-2">
      <button type="button" className={discoveryTab} disabled={remove.busy}
        onClick={() => { void remove.run(async () => { await removeFollower(account.handle); onRemove(account); }); }}>
        {f24Messages[locale].removeFollower}
      </button>
      {remove.error !== null && <ApiErrorNotice error={remove.error} />}
    </div>}
  </li>;
}

export function ProfileFollowPanel({ target, signedIn, initial, inline = false }: { target: FollowTarget; signedIn: boolean; initial?: FollowStatus; inline?: boolean }) {
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

  return <section className={inline ? "text-sm" : institutionCard} aria-label={t.accounts}>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!state && !resource.error && <p role="status">{feedMessages[locale].working}</p>}
    {state && <div className="flex flex-wrap items-start gap-2">
      {state.showFollowers !== false && (signedIn ? <button type="button" className={discoveryTab} aria-expanded={list === "followers"} onClick={() => choose("followers")}>
        {t.followers} · {count.format(state.followerCount)}
      </button> : <p>{t.followers} · {count.format(state.followerCount)}</p>)}
      {state.showFollowing !== false && state.followingCount !== null && (signedIn
        ? <button type="button" className={discoveryTab} aria-expanded={list === "following"} onClick={() => choose("following")}>
          {t.followingCount} · {count.format(state.followingCount)}
        </button>
        : <p>{t.followingCount} · {count.format(state.followingCount)}</p>)}
      {signedIn && state.canFollow && <FollowControl target={target} following={state.following} requestPending={state.requestPending} requiresApproval={state.requiresApproval} onChange={setUpdated} />}
    </div>}
    {signedIn && state?.following && <FollowRepostPreferences key={kind + ":" + key} target={target} />}
    {list && <div className="mt-4">
      <FollowAccountList key={list} target={target} list={list} allowRemoval={state?.self && list === "followers"} />
    </div>}
  </section>;
}

function FollowRepostPreferences({ target: { kind, key } }: { target: FollowTarget }) {
  const [locale] = useLocale();
  const t = socialMessages[locale];
  const fetchPreferences = useCallback((signal: AbortSignal) => followReposts({ kind, key }, undefined, signal), [kind, key]);
  const resource = useInstitutionResource(fetchPreferences);
  const mutation = useFeedMutation();
  const [setting, setSetting] = useState<boolean | null>(null);
  const value = setting ?? resource.data?.showReposts;
  return <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
    {resource.data?.mutual && <span>{t.mutual}</span>}
    {value != null && <label className="flex min-h-10 items-center gap-2">
      <input type="checkbox" checked={value} disabled={mutation.busy} onChange={(event) => {
        const enabled = event.target.checked;
        void mutation.run(async () => { const result = await followReposts({ kind, key }, enabled); setSetting(result.showReposts); });
      }} />{t.showReposts}
    </label>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
  </div>;
}

export function FollowAccountList({ target, list, allowRemoval = false }: { target: FollowTarget | null; list: FollowList; allowRemoval?: boolean }) {
  const kind = target?.kind;
  const key = target?.key;
  const loader = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { accounts, nextCursor } = await loadFollowList(kind && key ? { kind, key } : null, list, cursor, signal);
    return { rows: accounts, nextCursor };
  }, [kind, key, list]);
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  return <DiscoveryResults load={loader} empty={list === "followers" ? t.emptyFollowers : t.emptyFollowing}
    removeUnfollowed={target === null} allowRemoval={allowRemoval} />;
}

export function DiscoveryResults({ load, empty, removeUnfollowed = false, allowRemoval = false }: {
  load: (cursor: string | null, signal: AbortSignal) => Promise<{ rows: DiscoveryCard[]; nextCursor: string | null }>;
  empty: string;
  removeUnfollowed?: boolean;
  allowRemoval?: boolean;
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
      {visible.length ? <DiscoveryAccounts rows={visible}
        onRemove={allowRemoval ? (account) => setRemoved((current) => new Set([...current, account.id])) : undefined}
        onChange={(account, state) => {
        if (removeUnfollowed && !state.following) setRemoved((current) => new Set([...current, account.id]));
      }} /> : <p className={institutionCard}>{empty}</p>}
      {resource.page.nextCursor && <button type="button" className={`${institutionAction} justify-self-start`}
        disabled={resource.loadingMore} onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.working : t.loadMore}</button>}
    </>}
  </div>;
}
