"use client";

import { departmentCommunityContent, type Community, type MemberGroup } from "@ayinou/shared";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { changeDepartmentMembership } from "@/lib/department-community-api";
import { feedMessages } from "@/lib/feed-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { groupMessages } from "@/lib/groups-i18n";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionLink } from "./institution-ui";

export const communityGrid = "grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3";
export const communitySearchBar = "min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 sm:p-4";
export const communitySection = communitySearchBar + " grid gap-3";
export const communitySectionMessage = "text-sm text-[var(--theme-body)]";
export const communityEmpty = communitySearchBar + " " + communitySectionMessage;

export function CommunityLoading({ single = false }: { single?: boolean }) {
  const [locale] = useLocale();
  const placeholder = "rounded-md bg-[var(--theme-selected)]";
  return <div role="status">
    <span className="sr-only">{communityDirectoryMessages[locale].loading}</span>
    <div aria-hidden="true" className={single ? "grid" : communityGrid}>
      {(single ? [0] : [0, 1, 2]).map((index) => <div key={index}
        className={institutionCard + " grid gap-3 !p-4 motion-safe:animate-pulse"}>
        <div className="flex items-center gap-3">
          <div className={placeholder + " size-11 shrink-0"} />
          <div className="grid w-1/2 gap-2">
            <div className={placeholder + " h-3 w-4/5"} />
            <div className={placeholder + " h-2 w-3/5"} />
          </div>
        </div>
        <div className={placeholder + " h-3 w-5/6"} />
        <div className="border-t border-[var(--theme-border)] pt-3">
          <div className={placeholder + " h-9 w-16"} />
        </div>
      </div>)}
    </div>
  </div>;
}

export function CommunitySummary({ community, compact = false }: { community: Community; compact?: boolean }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  if (community.kind !== "department") return <GroupMetadata group={community} compact={compact} />;
  return <>
    <p className="text-sm leading-6 text-[var(--theme-body)]">{departmentCommunityContent(locale, community.name).description}</p>
    {(!compact || community.memberCount !== null) && <p className="text-sm text-[var(--theme-body)]">{community.memberCount === null ? t.privateCount
      : t.count.replace("{count}", new Intl.NumberFormat(locale).format(community.memberCount))}</p>}
  </>;
}

export function GroupMetadata({ group, compact = false }: { group: MemberGroup; compact?: boolean }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const count = communityDirectoryMessages[locale];
  const region = group.countryCode && new Intl.DisplayNames([locale], { type: "region" }).of(group.countryCode);
  return <>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--theme-link)]">
      {!compact && <span>{t[group.kind]}</span>}<span>{t[group.policy]}</span>
      {region && <span>{region}</span>}{group.topic && <span>{membershipMessages[locale][group.topic]}</span>}
    </div>
    <p dir="auto" className={`whitespace-pre-line break-words text-[var(--theme-body)] ${compact ? "text-sm leading-6" : ""}`}>{group.description}</p>
    {(!compact || group.memberCount !== null) && <p className="text-sm text-[var(--theme-body)]">{group.memberCount === null ? count.privateCount
      : count.count.replace("{count}", new Intl.NumberFormat(locale).format(group.memberCount))}</p>}
  </>;
}

export function MembershipControl({ community, update }: { community: Community; update: (next: Community | null) => void }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const groups = groupMessages[locale];
  const mutation = useFeedMutation();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const group = community.kind === "department" ? null : community;
  const pending = !community.joined && group?.requestStatus === "pending";
  if (!community.joined && group?.policy === "private") return null;
  if (!community.joined && group?.requestStatus === "rejected" && group.policy === "approval")
    return <p className="text-sm">{groups.rejected}</p>;
  if (group?.role === "owner") return <p className="text-sm font-semibold text-[var(--theme-link)]">{groups.owner}</p>;
  function change(join: boolean) {
    void mutation.run(async () => {
      const result = await changeDepartmentMembership(community.slug, join);
      update(result.community);
      setConfirmLeave(false);
    });
  }
  return <div className="mt-2 grid gap-2">
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
    {confirmLeave && <p className="text-sm font-semibold">{t.leaving}</p>}
    {pending && <p role="status" className="text-sm">{groups.pending}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={institutionAction} disabled={mutation.busy} onClick={() => {
        if (!community.joined || confirmLeave) change(!community.joined && !pending);
        else setConfirmLeave(true);
      }}>{community.joined ? t.leave : pending ? groups.cancelRequest : group?.policy === "approval" ? groups.request : t.join}</button>
      {confirmLeave && <button type="button" className={institutionLink} disabled={mutation.busy}
        onClick={() => setConfirmLeave(false)}>{feedMessages[locale].cancel}</button>}
    </div>
  </div>;
}


export function CommunityCard({ community, guest = false, update, children }: {
  community: Community; guest?: boolean; update?(value: Community | null): void; children?: ReactNode;
}) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const groups = groupMessages[locale];
  const base = guest ? "/community-directory" : "/communities";
  const initial = Array.from(community.name.trim())[0]?.toLocaleUpperCase(locale);
  const hasFooter = community.joined || (!guest && update) || children;
  return <li className={institutionCard + " flex flex-col gap-3 !p-4"}>
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-lg bg-[var(--theme-selected)] font-semibold text-[var(--theme-link)]">{initial}</span>
      <div className="min-w-0">
        <h2 dir="auto" className="break-words text-base font-semibold">
          <Link className="hover:underline focus-visible:underline" href={`${base}/${community.slug}`}>{community.name}</Link>
        </h2>
        <p className="text-xs text-[var(--theme-body)]">{community.kind === "department" ? t.official : groups[community.kind]}</p>
      </div>
    </div>
    <div className="grid min-w-0 gap-2"><CommunitySummary community={community} compact /></div>
    {hasFooter && <div className="mt-auto flex min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-1 border-t border-[var(--theme-border)] pt-2">
      {community.joined ? <p className="self-center text-sm font-semibold text-[var(--theme-link)]">
        {t.joined}{community.role && ` · ${groups[community.role]}`}
      </p> : !guest && update && <MembershipControl community={community} update={update} />}
      {children}
    </div>}
  </li>;
}
