"use client";

import { communityStaffRoles, departmentCommunityContent, type CommunityStaffRole, type DepartmentCommunity } from "@ayinou/shared";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { apiErrorCode } from "@/lib/api-errors";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { changeDepartmentMembership, changeDepartmentPrivacy, changeDepartmentStaff, loadDepartmentCommunities,
  loadDepartmentCommunity, loadDepartmentFeed, loadDepartmentMembers } from "@/lib/department-community-api";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { DiscoveryAccounts } from "./discovery-accounts";
import { PostCard } from "./feed-screen";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PostComposer } from "./post-composer";

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function CommunitySummary({ community }: { community: DepartmentCommunity }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  return <>
    <p className="text-sm leading-6 text-[var(--theme-body)]">{departmentCommunityContent(locale, community.name).description}</p>
    <p className="text-sm text-[var(--theme-body)]">{community.memberCount === null ? t.privateCount
      : t.count.replace("{count}", new Intl.NumberFormat(locale).format(community.memberCount))}</p>
  </>;
}

export function DepartmentDirectory() {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const resource = useInstitutionResource(loadDepartmentCommunities);
  const [query, setQuery] = useState("");
  const [membershipsOnly, setMembershipsOnly] = useState(false);
  const [changed, setChanged] = useState<Record<string, DepartmentCommunity>>({});
  const needle = normalize(query);
  const rooms = resource.data?.communities
    .map((community) => changed[community.id] ?? community)
    .filter((community) => (!membershipsOnly || community.joined) &&
      [community.name, community.departmentCode, community.slug].some((part) => normalize(part).includes(needle)));
  return <MemberShell><div className="grid gap-5">
    <header>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h1>
      <p className="mt-2 text-sm text-[var(--theme-body)]">{t.intro}</p>
    </header>
    <div className="flex flex-wrap items-end gap-3">
      <label className="w-full max-w-sm text-sm font-semibold">{t.search}
        <input type="search" className={institutionField} value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={membershipsOnly} onChange={(event) => setMembershipsOnly(event.target.checked)}
          className="size-4 accent-[var(--theme-link)]" />{t.mine}
      </label>
    </div>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!rooms && resource.error === null && <p role="status">{t.loading}</p>}
    {rooms?.length === 0 && <p role="status">{membershipsOnly && !needle ? t.emptyMine : t.noMatches}</p>}
    {!!rooms?.length && <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {rooms.map((community) => <li key={community.id} className={`${institutionCard} grid content-start gap-2`}>
        <p className="text-xs text-[var(--theme-body)]">{t.official}</p>
        <h2 className="text-xl font-semibold"><Link className="hover:underline" href={`/communities/${community.slug}`}>{community.name}</Link></h2>
        <CommunitySummary community={community} />
        {community.joined ? <p className="text-sm font-semibold text-[var(--theme-link)]">{t.joined}</p>
          : <MembershipControl community={community} update={(next) => setChanged((items) => ({ ...items, [next.id]: next }))} />}
      </li>)}
    </ul>}
  </div></MemberShell>;
}

function MembershipControl({ community, update }: { community: DepartmentCommunity; update: (next: DepartmentCommunity) => void }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const mutation = useFeedMutation();
  const [confirmLeave, setConfirmLeave] = useState(false);
  function change(join: boolean) {
    void mutation.run(async () => {
      const result = await changeDepartmentMembership(community.slug, join);
      update(result.community);
      setConfirmLeave(false);
    });
  }
  return <div className="mt-2 grid gap-2">
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {confirmLeave && <p className="text-sm font-semibold">{t.leaving}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={institutionAction} disabled={mutation.busy} onClick={() => {
        if (!community.joined || confirmLeave) change(!community.joined);
        else setConfirmLeave(true);
      }}>{community.joined ? t.leave : t.join}</button>
      {confirmLeave && <button type="button" className={institutionLink} disabled={mutation.busy}
        onClick={() => setConfirmLeave(false)}>{feedMessages[locale].cancel}</button>}
    </div>
  </div>;
}

export function DepartmentSpace({ slug }: { slug: string }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadDepartmentCommunity(slug, signal), [slug]);
  const resource = useInstitutionResource(load);
  const [changed, setChanged] = useState<DepartmentCommunity | null>(null);
  const [tab, setTab] = useState<"discussion" | "members">("discussion");
  const [visitedMembers, setVisitedMembers] = useState(false);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const privacy = useFeedMutation();
  const community = changed ?? resource.data?.community;
  return <MemberShell><div className="grid gap-4">
    <Link className={`${institutionLink} justify-self-start`} href="/communities">← {t.title}</Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!community && resource.error === null && <p role="status">{t.loading}</p>}
    {community && <>
      <header className={`${institutionCard} grid gap-3`}>
        <p className="text-xs font-semibold text-[var(--theme-link)]">{t.official}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{community.name}</h1>
        <CommunitySummary community={community} />
        <MembershipControl community={community} update={(next) => { setChanged(next); if (!next.joined) { setTab("discussion"); setVisitedMembers(false); } }} />
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
      </header>
      <details className={institutionCard}>
        <summary className="cursor-pointer font-semibold text-[var(--theme-link)]">{t.rules}</summary>
        <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-[var(--theme-body)]">
          {departmentCommunityContent(locale, community.name).rules.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </details>
      {community.canManageRoles && <CommunityStaffForm slug={slug} />}
      {community.joined ? <>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t.title}>
          {(["discussion", "members"] as const).map((entry) => <button key={entry} type="button" aria-pressed={tab === entry}
            className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)]"
            onClick={() => { setTab(entry); if (entry === "members") setVisitedMembers(true); }}>{t[entry]}</button>)}
        </div>
        <div hidden={tab !== "discussion"}><DepartmentDiscussion slug={slug} /></div>
        {visitedMembers && <div hidden={tab !== "members"}><DepartmentMembers slug={slug} revision={directoryRevision} /></div>}
      </> : <p className={institutionCard}>{t.joinRead}</p>}
    </>}
  </div></MemberShell>;
}

function DepartmentDiscussion({ slug }: { slug: string }) {
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
    <div className={`${institutionCard} max-sm:p-3`} aria-label={f.write}><PostComposer community={slug} onSaved={changed} /></div>
    {notice && <p role="status" className="text-sm text-[var(--theme-link)]">{f[notice]}</p>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{t.loading}</p>}
    {resource.page?.rows.length === 0 && <p className={institutionCard}>{t.emptyPosts}</p>}
    {resource.error === null && resource.page?.rows.map((post) => <PostCard key={post.id} post={post} changed={changed} />)}
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
