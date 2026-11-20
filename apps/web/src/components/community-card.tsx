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

export function CommunitySummary({ community }: { community: Community }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  if (community.kind !== "department") return <GroupMetadata group={community} />;
  return <>
    <p className="text-sm leading-6 text-[var(--theme-body)]">{departmentCommunityContent(locale, community.name).description}</p>
    <p className="text-sm text-[var(--theme-body)]">{community.memberCount === null ? t.privateCount
      : t.count.replace("{count}", new Intl.NumberFormat(locale).format(community.memberCount))}</p>
  </>;
}

export function GroupMetadata({ group }: { group: MemberGroup }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const count = communityDirectoryMessages[locale];
  const region = group.countryCode && new Intl.DisplayNames([locale], { type: "region" }).of(group.countryCode);
  return <>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--theme-link)]">
      <span>{t[group.kind]}</span><span>{t[group.policy]}</span>
      {region && <span>{region}</span>}{group.topic && <span>{membershipMessages[locale][group.topic]}</span>}
    </div>
    <p dir="auto" className="whitespace-pre-line break-words text-[var(--theme-body)]">{group.description}</p>
    <p className="text-sm text-[var(--theme-body)]">{group.memberCount === null ? count.privateCount
      : count.count.replace("{count}", new Intl.NumberFormat(locale).format(group.memberCount))}</p>
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
  return <li className={`${institutionCard} grid content-start gap-2`}>
    {community.kind === "department" && <p className="text-xs text-[var(--theme-body)]">{t.official}</p>}
    <h2 dir="auto" className="break-words text-xl font-semibold">
      <Link className="hover:underline" href={`${base}/${community.slug}`}>{community.name}</Link>
    </h2>
    <CommunitySummary community={community} />
    {community.joined ? <p className="text-sm font-semibold text-[var(--theme-link)]">
      {t.joined}{community.role && ` · ${groups[community.role]}`}
    </p> : !guest && update && <MembershipControl community={community} update={update} />}
    {children}
  </li>;
}
