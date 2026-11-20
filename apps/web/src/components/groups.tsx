"use client";

import { communityStaffRoles, groupKinds, groupPolicies, interestCodes, type FeedComment, type FeedPost, type GroupKind, type GroupSettings, type MemberGroup } from "@ayinou/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import { publicRequest } from "@/lib/api";
import { communityDiscoveryMessages } from "@/lib/community-discovery-i18n";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { loadDepartmentCommunity, loadDepartmentFeed } from "@/lib/department-community-api";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { createGroup, groupInbox, groupManagement, listGroups, manageGroup, respondGroupInvitation, updateGroup,
  type GroupDraft, type GroupSection, type ManagementAction, type ManagementEntry } from "@/lib/group-api";
import { groupMessages } from "@/lib/groups-i18n";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { CommunityCard, GroupMetadata } from "./community-card";
import { DisplayControls } from "./display-controls";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PostMediaGallery } from "./post-media";
import { SiteBrand } from "./site-brand";
import { SiteFooter } from "./site-footer";

export function GroupMore({ resource }: { resource: { page: { nextCursor: string | null } | null; loadingMore: boolean; more(): Promise<void> } }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  return resource.page?.nextCursor && <button type="button" className={`${institutionAction} justify-self-start`}
    disabled={resource.loadingMore} onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.loading : t.more}</button>;
}

export function TopicSelect({ value, change }: { value: string; change(value: string): void }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  return <label className="min-w-0 text-sm font-semibold">{t.topic}
    <select className={institutionField} value={value} onChange={(event) => change(event.target.value)}>
      <option value="">{t.none}</option>
      {interestCodes.map((code) => <option key={code} value={code}>{membershipMessages[locale][code]}</option>)}
    </select>
  </label>;
}

export function GroupsDirectory({ kind, guest = false, search, initialTopic = "" }: { kind?: GroupKind; guest?: boolean; search: string; initialTopic?: string }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const c = communityDirectoryMessages[locale];
  const [country, setCountry] = useState("");
  const [topic, setTopic] = useState(initialTopic);
  const [changed, setChanged] = useState<Record<string, MemberGroup>>({});
  const countryError = useId();
  const countryFilter = /^[A-Z]{2}$/.test(country) ? country : "";
  const invalidCountry = Boolean(country && !countryFilter);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await listGroups({ kind, search, country: countryFilter, topic }, cursor, signal, guest);
    return { rows: page.communities, nextCursor: page.nextCursor };
  }, [countryFilter, guest, kind, search, topic]);
  const resource = useCursorPage(load);
  return <section className="grid min-w-0 gap-4" aria-label={t.groups}>
    {kind && <div className="max-w-xs">
      {kind === "diaspora" ? <label className="text-sm font-semibold">{t.country}
        <input className={institutionField} maxLength={2} value={country} placeholder="HT" aria-invalid={invalidCountry}
          aria-describedby={invalidCountry ? countryError : undefined} onChange={(event) => setCountry(event.target.value.toUpperCase())} />
        {invalidCountry && <span id={countryError} className="mt-1 block text-[var(--theme-body)]">{communityDiscoveryMessages[locale].invalidCountry}</span>}
      </label> : <TopicSelect value={topic} change={setTopic} />}
    </div>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} signIn={!guest} />}
    {!resource.page && resource.error === null && <p role="status">{c.loading}</p>}
    {resource.page?.rows.length === 0 && <p role="status">{t.noGroups}</p>}
    <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {resource.error === null && resource.page?.rows.map((group) => <CommunityCard key={group.id} community={changed[group.id] ?? group} guest={guest}
        update={(next) => { if (next && next.kind !== "department") setChanged((current) => ({ ...current, [next.id]: next })); }} />)}
    </ul>
    <GroupMore resource={resource} />
  </section>;
}

const initial: GroupDraft = {
  slug: "", kind: "diaspora", name: "", description: "", rules: "", policy: "approval",
  discussionPublic: false, countryCode: null, topic: null,
};

function GroupForm({ group, onSaved }: { group?: MemberGroup; onSaved(saved: MemberGroup): void }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const [draft, setDraft] = useState<GroupDraft>(() => group ? {
    slug: group.slug, kind: group.kind, name: group.name, description: group.description, rules: group.rules,
    policy: group.policy, discussionPublic: group.discussionPublic, countryCode: group.countryCode, topic: group.topic,
  } : initial);
  const [saved, setSaved] = useState(false);
  const mutation = useFeedMutation();
  const submissions = useRef(new Map<string, string>());
  function change(patch: Partial<GroupDraft>) {
    setSaved(false);
    setDraft((value) => ({ ...value, ...patch }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation.run(async () => {
      const { slug, kind, ...settings } = draft;
      const data: GroupSettings = { ...settings, countryCode: kind === "diaspora" ? settings.countryCode : null,
        topic: kind === "interest" ? settings.topic : null, discussionPublic: settings.policy === "public" && settings.discussionPublic };
      const fields: GroupDraft = { ...data, slug, kind };
      const fingerprint = JSON.stringify(fields);
      let key = submissions.current.get(fingerprint);
      if (!key) { key = crypto.randomUUID(); submissions.current.set(fingerprint, key); }
      const result = group ? await updateGroup(slug, group.version, data) : await createGroup(fields, key);
      onSaved(result.community);
      setSaved(true);
    });
  }
  return <form className={`${institutionCard} grid gap-4`} onSubmit={submit}>
    <fieldset disabled={mutation.busy} className="grid min-w-0 gap-4">
      <legend className="pb-3 text-xl font-semibold">{group ? t.settings : t.newGroup}</legend>
      <label className="text-sm font-semibold">{t.name}
        <input className={institutionField} required minLength={3} maxLength={80} value={draft.name} onChange={(event) => change({ name: event.target.value })} />
      </label>
      {!group && <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-semibold">{t.slug}
          <input className={institutionField} required minLength={3} maxLength={40} pattern="[a-z][a-z0-9]*(?:\x2d[a-z0-9]+)*"
            value={draft.slug} onChange={(event) => change({ slug: event.target.value.toLowerCase() })} />
        </label>
        <label className="min-w-0 text-sm font-semibold">{t.category}
          <select className={institutionField} value={draft.kind} onChange={(event) => change({ kind: event.target.value as GroupKind })}>
            {groupKinds.map((kind) => <option key={kind} value={kind}>{t[kind]}</option>)}
          </select>
        </label>
      </div>}
      <label className="text-sm font-semibold">{t.description}
        <textarea className={institutionField} rows={3} required minLength={10} maxLength={500} value={draft.description} onChange={(event) => change({ description: event.target.value })} />
      </label>
      <label className="text-sm font-semibold">{t.rules}
        <textarea className={institutionField} rows={4} required minLength={10} maxLength={2000} value={draft.rules} onChange={(event) => change({ rules: event.target.value })} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-semibold">{t.membershipPolicy}
          <select className={institutionField} value={draft.policy} onChange={(event) => change({ policy: event.target.value as GroupDraft["policy"], discussionPublic: false })}>
            {groupPolicies.map((policy) => <option key={policy} value={policy}>{t[policy]}</option>)}
          </select>
        </label>
        {draft.kind === "diaspora" ? <label className="text-sm font-semibold">{t.country}
          <input className={institutionField} maxLength={2} pattern="[A-Z]{2}" placeholder="HT" value={draft.countryCode ?? ""}
            onChange={(event) => change({ countryCode: event.target.value.toUpperCase() || null })} />
        </label> : <TopicSelect value={draft.topic ?? ""} change={(value) => change({ topic: interestCodes.find((code) => code === value) ?? null })} />}
      </div>
      {draft.policy === "public" && <label className="flex items-start gap-2 text-sm">
        <input className="mt-1 size-4 shrink-0 accent-[var(--theme-link)]" type="checkbox" checked={draft.discussionPublic}
          onChange={(event) => change({ discussionPublic: event.target.checked })} />
        <span>{t.publicDiscussion}<span className="mt-1 block text-[var(--theme-body)]">{t.publicNote}</span></span>
      </label>}
      <button className={`${institutionAction} justify-self-start`}>{group ? t.save : t.create}</button>
    </fieldset>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {saved && <p role="status">{t.saved}</p>}
  </form>;
}

export function NewGroup() {
  const router = useRouter();
  const [locale] = useLocale();
  return <MemberShell><div className="grid max-w-4xl gap-4">
    <Link className={institutionLink} href="/communities">← {communityDirectoryMessages[locale].title}</Link>
    <h1 className="text-3xl font-semibold">{groupMessages[locale].newGroup}</h1>
    <GroupForm onSaved={(group) => router.push(`/communities/${group.slug}`)} />
  </div></MemberShell>;
}

export function GroupInbox() {
  const [locale] = useLocale();
  return <MemberShell><div className="grid gap-4">
    <Link className={institutionLink} href="/communities">← {communityDirectoryMessages[locale].title}</Link>
    <GroupInvitationList standalone />
  </div></MemberShell>;
}

export function GroupInvitationList({ standalone = false, onRespond }: { standalone?: boolean; onRespond?(): void }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const [revision, setRevision] = useState(0);
  const [handled, setHandled] = useState<string[]>([]);
  const mutation = useFeedMutation();
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await groupInbox(cursor, signal);
    return { rows: page.invitations, nextCursor: page.nextCursor };
  }, []);
  const resource = useCursorPage(load, revision);
  const entries = resource.error === null ? resource.page?.rows.filter(({ id }) => !handled.includes(id)) : null;
  return <section className="grid gap-4" aria-label={t.invitations}>
    {standalone ? <h1 className="text-3xl font-semibold">{t.invitations}</h1> : <h2 className="text-xl font-semibold">{t.invitations}</h2>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{communityDirectoryMessages[locale].loading}</p>}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {entries?.length === 0 && <p>{t.noInvites}</p>}
    <ul className="grid gap-3">
      {entries?.map((invite) => <li key={invite.id} className={`${institutionCard} grid gap-2`}>
        <p className="text-sm text-[var(--theme-link)]">{t[invite.purpose]}</p>
        <h2 dir="auto" className="break-words text-xl font-semibold">{invite.name}</h2>
        <time dateTime={invite.expiresAt} className="text-sm">{new Date(invite.expiresAt).toLocaleString(locale)}</time>
        <div className="flex flex-wrap gap-3">
          {([true, false] as const).map((accept) => <button key={String(accept)} type="button" className={accept ? institutionAction : institutionLink}
            disabled={mutation.busy} onClick={() => { void mutation.run(async () => {
              await respondGroupInvitation(invite.id, accept);
              setHandled((ids) => [...ids, invite.id]);
              setRevision((value) => value + 1);
              onRespond?.();
            }); }}>{accept ? t.accept : t.decline}</button>)}
          {invite.purpose === "ownership" && <Link href="/mfa?next=%2Fcommunities%2Finvitations" className={institutionLink}>{t.manageMfa}</Link>}
        </div>
      </li>)}
    </ul>
    <GroupMore resource={resource} />
  </section>;
}

const sectionChoices = ["requests", "invitations", "staff"] as const;
type PanelAction = ManagementAction["action"];
export function GroupManagement({ group, onSaved }: { group: MemberGroup; onSaved(group: MemberGroup): void }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const [section, setSection] = useState<GroupSection>("requests");
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<PanelAction>("invite");
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState("");
  const [invitationId, setInvitation] = useState("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);
  const mutation = useFeedMutation();
  const form = useRef<HTMLFormElement>(null);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await groupManagement(group.slug, section, cursor, signal);
    return { rows: page.entries.map((entry) => ({ ...entry, id: entry.id ?? entry.handle })), nextCursor: page.nextCursor };
  }, [group.slug, section]);
  const resource = useCursorPage(load, revision);
  const owner = group.role === "owner";
  const actions: PanelAction[] = owner
    ? ["invite", "approve", "reject", "remove", "staff", "transfer", "revoke"]
    : ["invite", "approve", "reject", "remove", "revoke"];

  function prepare(action: PanelAction, entry: ManagementEntry) {
    setSelection(action);
    setHandle(entry.handle);
    setInvitation(entry.id ?? "");
    form.current?.querySelector("textarea")?.focus();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const details: ManagementAction = selection === "revoke" ? { action: selection, invitationId }
      : selection === "staff" ? { action: selection, handle, role: communityStaffRoles.find((item) => item === role) ?? null }
      : { action: selection, handle };
    void mutation.run(async () => {
      await manageGroup(group.slug, details, reason);
      setReason("");
      setSaved(true);
      setRevision((value) => value + 1);
    });
  }
  return <div className="grid gap-4" aria-label={t.manage}>
    <Link className={institutionLink} href={`/mfa?next=${encodeURIComponent(`/communities/${group.slug}`)}`}>{t.manageMfa}</Link>
    {owner && <GroupForm group={group} onSaved={onSaved} />}
    <section className={`${institutionCard} grid gap-3`}>
      <div className="flex flex-wrap gap-2">
        {sectionChoices.map((value) => <button type="button" key={value} aria-pressed={section === value}
          className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 text-sm aria-pressed:bg-[var(--theme-selected)]"
          onClick={() => setSection(value)}>{t[value]}</button>)}
      </div>
      {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
      {resource.error === null && resource.page?.rows.length === 0 && <p>{t.noEntries}</p>}
      {resource.error === null && <ul className="grid gap-2">
        {resource.page?.rows.map((entry) => <li className="flex flex-wrap items-center gap-3 break-all" key={entry.id}>
          <span>{entry.name ? `${entry.name} · ` : ""}@{entry.handle}</span>
          {entry.role && <span>{t[entry.role]}</span>}
          {entry.purpose && <span>{t[entry.purpose]}</span>}
          {section === "requests" && <>{(["approve", "reject"] as const).map((action) =>
            <button key={action} className={institutionLink} onClick={() => prepare(action, entry)}>{t[action]}</button>)}</>}
          {section === "invitations" && (entry.purpose !== "ownership" || owner) &&
            <button className={institutionLink} onClick={() => prepare("revoke", entry)}>{t.revoke}</button>}
        </li>)}
      </ul>}
      <GroupMore resource={resource} />
    </section>
    <form ref={form} className={`${institutionCard} grid gap-3`} onSubmit={submit}>
      <fieldset disabled={mutation.busy} className="grid min-w-0 gap-3">
        <legend className="text-lg font-semibold">{t.manage}</legend>
        <select className={institutionField} aria-label={t.manage} value={selection} onChange={(event) => setSelection(event.target.value as PanelAction)}>
          {actions.map((action) => <option key={action} value={action}>{t[action]}</option>)}
        </select>
        {selection === "revoke" ? <label className="text-sm font-semibold">{t.invitations}
          <input className={institutionField} value={invitationId} onChange={(event) => setInvitation(event.target.value)} required maxLength={36} />
        </label> : <label className="text-sm font-semibold">{t.handle}
          <input className={institutionField} value={handle} onChange={(event) => setHandle(event.target.value.toLowerCase())} required maxLength={24} />
        </label>}
        {selection === "staff" && <label className="text-sm font-semibold">{t.staff}
          <select className={institutionField} value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">{communityDirectoryMessages[locale].revoke}</option>
            {communityStaffRoles.map((value) => <option key={value} value={value}>{t[value]}</option>)}
          </select>
        </label>}
        {selection === "remove" && <p className="text-sm">{t.removedNotice}</p>}
        <label className="text-sm font-semibold">{t.reason}
          <textarea className={institutionField} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={10} maxLength={500} />
        </label>
        <button className={`${institutionAction} justify-self-start`}>{t[selection]}</button>
      </fieldset>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
      {saved && <p role="status">{t.saved}</p>}
    </form>
  </div>;
}

function GuestComments({ post, parent }: { post: string; parent?: string }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    if (parent) query.set("parent", parent);
    const page: { comments: FeedComment[]; nextCursor: string | null } = await publicRequest(`/api/v1/posts/${post}/comments?${query}`, { signal });
    return { rows: page.comments, nextCursor: page.nextCursor };
  }, [parent, post]);
  const resource = useCursorPage(load);
  return <div className="mt-2 grid gap-2 border-s border-[var(--theme-border)] ps-3">
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {resource.page?.rows.length === 0 && <p className="text-sm">{parent ? t.replyEmpty : t.commentEmpty}</p>}
    {resource.error === null && resource.page?.rows.map((comment) => <article key={comment.id}>
      {comment.available && <><p className="text-sm font-semibold">{comment.author?.displayName}</p><p dir="auto" className="whitespace-pre-wrap break-words">{comment.body}</p></>}
      {comment.hasReplies && !parent && <GuestThread post={post} parent={comment.id} />}
    </article>)}
    <GroupMore resource={resource} />
  </div>;
}

function GuestThread({ post, parent }: { post: string; parent?: string }) {
  const [locale] = useLocale();
  const [open, setOpen] = useState(false);
  return <details className="mt-3" onToggle={(event) => { if (event.currentTarget.open) setOpen(true); }}>
    <summary className={`${institutionLink} cursor-pointer`}>{parent ? feedMessages[locale].replies : feedMessages[locale].comments}</summary>
    {open && <GuestComments post={post} parent={parent} />}
  </details>;
}

export function ReadOnlyGroupPost({ post, guest }: { post: FeedPost; guest: boolean }) {
  const [locale] = useLocale();
  return <article className={institutionCard}>
    {post.author && <p className="break-words font-semibold">{post.author.displayName}</p>}
    <time className="text-sm text-[var(--theme-body)]" dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString(locale)}</time>
    <p dir="auto" className="mt-2 whitespace-pre-wrap break-words">{post.body}</p>
    <PostMediaGallery post={post.id} attachments={post.attachments ?? []} guest={guest} />
    {guest ? <GuestThread post={post.id} /> : <Link className={`${institutionLink} mt-3 inline-block`} href={`/posts/${post.id}`}>{feedMessages[locale].comments}</Link>}
  </article>;
}

function PublicShell({ children }: { children: React.ReactNode }) {
  const [locale] = useLocale();
  return <div id="top" className="flex min-h-dvh flex-col">
    <header className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <SiteBrand href="/" /><DisplayControls />
        <Link href="/login" className={institutionAction}>{groupMessages[locale].signIn}</Link>
      </div>
    </header>
    <main className="mx-auto grid w-full max-w-[1500px] flex-1 content-start gap-4 px-4 py-6 sm:px-8">{children}</main>
    <SiteFooter />
  </div>;
}

export function PublicGroups() {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const [kind, setKind] = useState<GroupKind | "">("");
  const [search, setSearch] = useState("");
  return <PublicShell>
    <h1 className="text-3xl font-semibold">{t.directory}</h1>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">{t.searchGroups}
        <input type="search" className={institutionField} maxLength={80} value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <label className="text-sm font-semibold">{t.category}
        <select className={institutionField} value={kind} onChange={(event) => setKind(event.target.value as GroupKind | "")}>
          <option value="">{t.all}</option>{groupKinds.map((value) => <option key={value} value={value}>{t[value]}</option>)}
        </select>
      </label>
    </div>
    <GroupsDirectory key={kind} kind={kind || undefined} search={search} guest />
  </PublicShell>;
}

export function PublicGroupRoom({ slug }: { slug: string }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadDepartmentCommunity(slug, signal, true), [slug]);
  const resource = useInstitutionResource(load);
  const group = resource.data?.community;
  return <PublicShell>
    <Link href="/community-directory" className={institutionLink}>← {t.directory}</Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!group && resource.error === null && <p role="status">{communityDirectoryMessages[locale].loading}</p>}
    {group && group.kind !== "department" && <>
      <header className={`${institutionCard} grid gap-3`}>
        <h1 dir="auto" className="break-words text-3xl font-semibold">{group.name}</h1>
        <GroupMetadata group={group} />
      </header>
      <section className={institutionCard}>
        <h2 className="font-semibold">{t.rules}</h2>
        <p dir="auto" className="whitespace-pre-wrap break-words">{group.rules}</p>
      </section>
      {group.discussionPublic ? <PublicDiscussion slug={slug} /> : <p>{t.restrictedNotice}</p>}
    </>}
  </PublicShell>;
}

function PublicDiscussion({ slug }: { slug: string }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await loadDepartmentFeed(slug, cursor, signal, true);
    return { rows: page.posts, nextCursor: page.nextCursor };
  }, [slug]);
  const resource = useCursorPage(load);
  return <section className="grid gap-3" aria-label={t.discussion}>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{t.loading}</p>}
    {resource.page?.rows.length === 0 && <p>{t.emptyPosts}</p>}
    {resource.error === null && resource.page?.rows.map((post) => <ReadOnlyGroupPost key={post.id} post={post} guest />)}
    <GroupMore resource={resource} />
  </section>;
}
