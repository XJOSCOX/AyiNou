"use client";

import { communityStaffRoles, departmentCommunityContent, type Community, type CommunityStaffRole, type InterestCode } from "@ayinou/shared";
import Link from "next/link";
import { pollMessages } from "@/lib/poll-i18n";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiErrorCode } from "@/lib/api-errors";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { communityDiscoveryMessages } from "@/lib/community-discovery-i18n";
import { changeDepartmentPrivacy, changeDepartmentStaff, loadDepartmentCommunities,
  loadDepartmentCommunity, loadDepartmentFeed, loadDepartmentMembers } from "@/lib/department-community-api";
import { feedMessages } from "@/lib/feed-i18n";
import { groupMessages } from "@/lib/groups-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { DiscoveryAccounts } from "./discovery-accounts";
import { PostCard } from "./feed-screen";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { CommunityCard, CommunitySummary, MembershipControl } from "./community-card";
import { MyGroupActivities, RecommendedCommunities } from "./community-discovery";
import { PostComposer } from "./post-composer";
import { GroupManagement, GroupsDirectory, ReadOnlyGroupPost } from "./groups";

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

export function DepartmentDirectory() {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const groups = groupMessages[locale];
  const discovery = communityDiscoveryMessages[locale];
  const resource = useInstitutionResource(loadDepartmentCommunities);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState<InterestCode | "">("");
  const [category, setCategory] = useState<"recommended" | "official" | "diaspora" | "interest" | "mine">("recommended");
  const membershipsOnly = category === "mine";
  const [changed, setChanged] = useState<Record<string, Community>>({});
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(query.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [query]);
  const needle = normalize(query);
  const rooms = resource.data?.communities
    .map((community) => changed[community.id] ?? community)
    .filter((community) => (!membershipsOnly || community.joined) &&
      [community.name, community.departmentCode ?? "", community.slug].some((part) => normalize(part).includes(needle)));
  const searchControl = <label className="block text-sm font-semibold">{category === "official" ? t.search : category === "mine" ? groups.searchCommunities : groups.searchGroups}
    <input type="search" className={institutionField} value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} />
  </label>;
  return <MemberShell><div className="grid min-w-0 gap-4">
    <PageHeader title={t.title} description={groups.intro} actions={<>
      <Link href="/communities/new" className={institutionAction}>{groups.newGroup}</Link>
      <Link href="/communities/invitations" className={institutionLink}>{groups.invitations}</Link>
    </>} />
    <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.title}>
        {(["recommended", "official", "diaspora", "interest", "mine"] as const).map((value) => <button key={value} type="button" aria-pressed={category === value}
          className="min-h-10 rounded-md px-3 py-1.5 text-sm font-semibold text-[var(--theme-body)] hover:bg-[var(--theme-control)] aria-pressed:bg-[var(--theme-selected)] aria-pressed:text-[var(--theme-link)]"
          onClick={() => setCategory(value)}>{value === "recommended" ? discovery.recommended : value === "official" ? groups.officialDepartments : value === "mine" ? t.mine : groups[value]}</button>)}
      </div>
    </div>
    {category === "recommended" && <RecommendedCommunities search={search} searchControl={searchControl} onMembership={(next) =>
      setChanged((items) => ({ ...items, [next.id]: next }))} explore={(next) => {
      setQuery("");
      setSearch("");
      setTopic(next);
      setCategory("interest");
    }} />}
    {(category === "official" || membershipsOnly) && <>
    <div className="w-full max-w-xl">{searchControl}</div>
    {membershipsOnly && <h2 className="text-xl font-semibold">{discovery.departmentsJoined}</h2>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!rooms && resource.error === null && <p role="status">{t.loading}</p>}
    {rooms?.length === 0 && <p role="status">{membershipsOnly && !needle ? t.emptyMine : t.noMatches}</p>}
    {!!rooms?.length && <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3">
      {rooms.map((community) => <CommunityCard key={community.id} community={community}
        update={(next) => { if (next) setChanged((items) => ({ ...items, [next.id]: next })); }} />)}
    </ul>}
    </>}
    {(category === "diaspora" || category === "interest") && <GroupsDirectory key={`${category}:${topic}`} search={search} searchControl={searchControl}
      kind={category} initialTopic={category === "interest" ? topic : ""} />}
    {membershipsOnly && <MyGroupActivities search={search} />}
  </div></MemberShell>;
}

export function DepartmentSpace({ slug }: { slug: string }) {
  const router = useRouter();
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const groups = groupMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadDepartmentCommunity(slug, signal), [slug]);
  const resource = useInstitutionResource(load);
  const [changed, setChanged] = useState<Community | null>(null);
  const [tab, setTab] = useState<"discussion" | "members" | "manage">("discussion");
  const [visitedMembers, setVisitedMembers] = useState(false);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const privacy = useFeedMutation();
  const community = changed ?? resource.data?.community;
  const group = community && community.kind !== "department" ? community : null;
  const canManage = group?.role === "owner" || group?.role === "administrator";
  const canRead = community?.joined || group?.discussionPublic;
  return <MemberShell><div className="grid gap-4">
    <Link className={`${institutionLink} justify-self-start`} href="/communities">← {t.title}</Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!community && resource.error === null && <p role="status">{t.loading}</p>}
    {community && <>
      <header className={`${institutionCard} grid gap-3`}>
        {!group && <p className="text-xs font-semibold text-[var(--theme-link)]">{t.official}</p>}
        <h1 dir="auto" className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{community.name}</h1>
        <CommunitySummary community={community} />
        <MembershipControl community={community} update={(next) => {
          if (!next) { router.replace("/communities"); return; }
          setChanged(next);
          if (!next.joined) { setTab("discussion"); setVisitedMembers(false); }
        }} />
        {community.joined && <label className="flex items-start gap-2 text-sm text-[var(--theme-body)]">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--theme-link)]" checked={community.directoryVisible}
            disabled={privacy.busy} onChange={(event) => {
              const visible = event.target.checked;
              void privacy.run(async () => {
                setChanged((await changeDepartmentPrivacy(slug, visible)).community);
                setDirectoryRevision((value) => value + 1);
              });
            }} />{t.visibility}
        </label>}
        {privacy.error !== null && <ApiErrorNotice error={privacy.error} />}
        {community.canModerate && <Link href={`/communities/${slug}/moderation`} className={institutionLink}>{t.moderation}</Link>}
        {community.joined && <Link href={"/polls?scope=community&scopeId=" + community.id} className={institutionLink}>{pollMessages[locale].title}</Link>}
        {group && group.policy !== "private" && <Link href={`/community-directory/${slug}`} className={institutionLink}>{groups.copyLink}</Link>}
      </header>
      <details className={institutionCard}>
        <summary className="cursor-pointer font-semibold text-[var(--theme-link)]">{t.rules}</summary>
        {group ? <p dir="auto" className="mt-3 whitespace-pre-wrap break-words text-sm text-[var(--theme-body)]">{group.rules}</p>
          : <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-[var(--theme-body)]">
          {departmentCommunityContent(locale, community.name).rules.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>}
      </details>
      {!group && community.canManageRoles && <CommunityStaffForm slug={slug} />}
      {canRead ? <>
        {community.joined && <div className="flex flex-wrap gap-2" role="group" aria-label={t.title}>
          {(["discussion", "members", ...(canManage ? ["manage"] as const : [])] as const).map((entry) => <button key={entry} type="button" aria-pressed={tab === entry}
            className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)]"
            onClick={() => { setTab(entry); if (entry === "members") setVisitedMembers(true); }}>{entry === "manage" ? groups.manage : t[entry]}</button>)}
        </div>}
        <div hidden={tab !== "discussion"}><DepartmentDiscussion key={String(community.joined)} slug={slug} joined={community.joined}
          publicDiscussion={group?.discussionPublic ?? false} groupVersion={group?.version} /></div>
        {visitedMembers && <div hidden={tab !== "members"}><DepartmentMembers slug={slug} revision={directoryRevision} /></div>}
        {group && canManage && tab === "manage" && <GroupManagement group={group} onSaved={(updated) => { setChanged(updated); setDirectoryRevision((n) => n + 1); }} />}
      </> : <p className={institutionCard}>{group ? groups.restrictedNotice : t.joinRead}</p>}
    </>}
  </div></MemberShell>;
}

function DepartmentDiscussion({ slug, joined, publicDiscussion, groupVersion }: { slug: string; joined: boolean; publicDiscussion: boolean; groupVersion?: number }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const f = feedMessages[locale];
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<"published" | "draftSaved" | "editSaved" | "deleted" | null>(null);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await loadDepartmentFeed(slug, cursor, signal);
    return { rows: page.posts, nextCursor: page.nextCursor };
  }, [slug]);
  const resource = useCursorPage(load, revision);
  function changed(message: NonNullable<typeof notice>) {
    setNotice(message);
    setRevision((value) => value + 1);
  }
  return <section className="grid gap-4" aria-label={t.discussion}>
    {joined && <div className={`${institutionCard} max-sm:p-3`} aria-label={f.write}>
      {publicDiscussion && <p className="mb-3 text-sm text-[var(--theme-body)]">{groupMessages[locale].publicNote}</p>}
      <PostComposer community={slug} groupVersion={groupVersion} onSaved={changed} />
    </div>}
    {notice && <p role="status" className="text-sm text-[var(--theme-link)]">{f[notice]}</p>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{t.loading}</p>}
    {resource.page?.rows.length === 0 && <p className={institutionCard}>{t.emptyPosts}</p>}
    {resource.error === null && resource.page?.rows.map((post) => joined
      ? <PostCard key={post.id} post={post} changed={changed} /> : <ReadOnlyGroupPost key={post.id} post={post} guest={false} />)}
    <CommunityMore resource={resource} />
  </section>;
}

function DepartmentMembers({ slug, revision }: { slug: string; revision: number }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await loadDepartmentMembers(slug, cursor, signal);
    return { rows: page.accounts, nextCursor: page.nextCursor };
  }, [slug]);
  const resource = useCursorPage(load, revision);
  return <section className={`${institutionCard} grid gap-3`}>
    <h2 className="text-xl font-semibold">{t.listed}</h2>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{t.loading}</p>}
    {resource.page?.rows.length === 0 && <p>{t.emptyMembers}</p>}
    {resource.error === null && !!resource.page?.rows.length && <DiscoveryAccounts rows={resource.page.rows} />}
    <CommunityMore resource={resource} />
  </section>;
}

function CommunityMore({ resource }: { resource: { page: { nextCursor: string | null } | null; loadingMore: boolean; more: () => Promise<void> } }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  return resource.page?.nextCursor && <button type="button" className={`${institutionAction} justify-self-start`}
    disabled={resource.loadingMore} onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.loading : t.more}</button>;
}

function CommunityStaffForm({ slug }: { slug: string }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<CommunityStaffRole | "revoke">("moderator");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);
  const mutation = useFeedMutation();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    if (await mutation.run(() => changeDepartmentStaff(slug, username.trim().toLowerCase(), role === "revoke" ? null : role, reason))) setSaved(true);
  }
  return <details className={institutionCard}>
    <summary className="cursor-pointer font-semibold text-[var(--theme-link)]">{t.manageRoles}</summary>
    <form className="mt-3 grid max-w-lg gap-3" onSubmit={submit}>
      <label className="text-sm font-semibold">{t.username}<input className={institutionField} required
        minLength={3} maxLength={24} value={username} disabled={mutation.busy} onChange={(event) => setUsername(event.target.value)} /></label>
      <label className="text-sm font-semibold">{t.role}<select className={institutionField} value={role} disabled={mutation.busy}
        onChange={(event) => setRole(communityStaffRoles.find((value) => value === event.target.value) ?? "revoke")}>
        {communityStaffRoles.map((value) => <option key={value} value={value}>{t[value]}</option>)}
        <option value="revoke">{t.revoke}</option>
      </select></label>
      <label className="text-sm font-semibold">{t.reason}<input className={institutionField} required minLength={10}
        maxLength={500} value={reason} disabled={mutation.busy} onChange={(event) => setReason(event.target.value)} /></label>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
      {apiErrorCode(mutation.error) === "MFA_REQUIRED" && <Link className={institutionLink}
        href={`/mfa?next=${encodeURIComponent(`/communities/${slug}`)}`}>{feedMessages[locale].checkMfa}</Link>}
      {saved && <p role="status" className="text-sm text-[var(--theme-link)]">{t.saved}</p>}
      <button type="submit" className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.save}</button>
    </form>
  </details>;
}
