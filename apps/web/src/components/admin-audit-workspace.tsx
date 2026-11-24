"use client";

import { useCallback, useId, useState, type FormEvent, type ReactNode } from "react";
import { auditCategories, auditOutcomes, type AuditEvent, type AuditPage, type AuditPerson } from "@ayinou/shared";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { loadAdminAudit } from "@/lib/admin-api";
import { adminMessages } from "@/lib/admin-i18n";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { moderationCenterMessages } from "@/lib/moderation-center-i18n";
import { adminCompactCard, adminDisclosure, adminSecondaryAction } from "./admin-controls";
import { AdminMemberLookup } from "./admin-member-lookup";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionField, useInstitutionResource } from "./institution-ui";
import { PolicyAuditHistory } from "./policy-audit-history";

type View = "activity" | "decisions" | "policies";
type Paging = { filters: string; cursors: string[] };

type PersonFilter = { value: string; id?: string };
const emptyPeople = { actor: { value: "" }, affected: { value: "" } } satisfies Record<string, PersonFilter>;
const recordPageSize = 20;

export function AdminAuditWorkspace({ workspaceId, founder }: { workspaceId: string; founder: boolean }) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const copy = t.auditWorkspace;
  const [selection, setSelection] = useState<View>("activity");
  const view = !founder && selection === "policies" ? "activity" : selection;
  const views: { value: View; label: string }[] = [
    { value: "activity", label: copy.activity },
    { value: "decisions", label: copy.decisions },
    ...(founder ? [{ value: "policies" as const, label: t.policyAudit.title }] : []),
  ];
  return <div className="grid min-w-0 gap-3">
    <div className={`${adminCompactCard} flex flex-wrap gap-2`} role="group" aria-label={t.audit}>
      {views.map(({ value, label }) => <button key={value} type="button" aria-pressed={view === value}
        className={`${adminSecondaryAction} min-h-11 aria-pressed:border-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)]`}
        onClick={() => setSelection(value)}>{label}</button>)}
    </div>
    {view === "activity" && <PlatformActivity workspaceId={workspaceId} />}
    {view === "decisions" && <DecisionRecords />}
    {view === "policies" && <PolicyAuditHistory workspaceId={workspaceId} />}
  </div>;
}

function PlatformActivity({ workspaceId }: { workspaceId: string }) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const copy = t.auditWorkspace;
  const id = useId();
  const [paging, setPaging] = useState<Paging>({ filters: "", cursors: [] });
  const [people, setPeople] = useState<Record<keyof typeof emptyPeople, PersonFilter>>(emptyPeople);
  const [personError, setPersonError] = useState(false);
  const cursor = paging.cursors.at(-1);
  const load = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams(paging.filters);
    if (cursor) params.set("cursor", cursor);
    const audit: AuditPage = await authorizedRequest("/api/v1/admin/audit/events?" + params, {
      signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspaceId },
    });
    return { paging, audit };
  }, [paging, cursor, workspaceId]);
  const resource = useInstitutionResource(load);
  const page = resource.data?.paging === paging ? resource.data.audit : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Object.values(people).some(({ value, id }) => value.trim() && !id)) {
      setPersonError(true);
      return;
    }
    const form = new FormData(event.currentTarget);
    const filters = new URLSearchParams();
    for (const key of ["category", "outcome"]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) filters.set(key, value);
    }
    if (people.actor.id) filters.set("actor", people.actor.id);
    if (people.affected.id) {
      filters.set("resource", people.affected.id);
      filters.set("resourceType", "account");
    }
    setPersonError(false);
    const from = form.get("from");
    const through = form.get("through");
    if (from) filters.set("from", from + "T00:00:00.000Z");
    if (through) filters.set("to", through + "T23:59:59.999999Z");
    setPaging({ filters: filters.toString(), cursors: [] });
  }

  return <section className={`${adminCompactCard} grid gap-3`} aria-labelledby={id}>
    <header className="border-b border-[var(--theme-border)] pb-3">
      <h2 id={id} className="text-lg font-semibold">{copy.activity}</h2>
      <p className="mt-1 text-sm text-[var(--theme-body)]">{copy.intro}</p>
    </header>
    <form className="grid min-w-0 gap-2.5" aria-label={copy.filter} onSubmit={submit}
      onInvalid={(event) => {
        const details = (event.target as HTMLElement).closest("details");
        if (details) details.open = true;
      }}
      onReset={() => { setPeople(emptyPeople); setPersonError(false); setPaging({ filters: "", cursors: [] }); }}>
      <div className="grid items-end gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="min-w-0 text-sm font-semibold">{copy.category}
          <select name="category" className={institutionField}>
            <option value="">{copy.all}</option>
            {auditCategories.map((category) => <option key={category} value={category}>{copy.categories[category]}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-sm font-semibold">{copy.outcome}
          <select name="outcome" className={institutionField}>
            <option value="">{copy.all}</option>
            {auditOutcomes.map((outcome) => <option key={outcome} value={outcome}>{copy.outcomes[outcome]}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1">
          <button className={`${institutionAction} min-h-11`} type="submit">{copy.apply}</button>
          <button className={`${adminSecondaryAction} min-h-11`} type="reset">{copy.reset}</button>
        </div>
      </div>
      <div className="grid min-w-0 gap-2.5 sm:grid-cols-2">
        {(["actor", "affected"] as const).map((key) => <AdminMemberLookup key={key} label={key === "actor" ? copy.actorName : copy.affectedName}
          value={people[key].value} selected={!!people[key].id} workspaceId={workspaceId}
          onChange={(value) => {
            setPeople((current) => ({ ...current, [key]: { value } }));
            setPersonError(false);
          }}
          onSelect={(member) => {
            setPeople((current) => ({ ...current, [key]: { id: member.id, value: personName(member) } }));
            setPersonError(false);
          }} />)}
        {personError && <p role="alert" className="text-sm text-[var(--theme-error-text)] sm:col-span-2">{copy.selectMember}</p>}
      </div>
      <details className="rounded-md border border-[var(--theme-border)]">
        <summary className={adminDisclosure}><span className="flex-1">{copy.filter}</span></summary>
        <div className="grid min-w-0 gap-2.5 border-t border-[var(--theme-border)] bg-[var(--theme-control)] p-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-semibold">{copy.from}<input name="from" type="date" className={institutionField} /></label>
          <label className="min-w-0 text-sm font-semibold">{copy.through}<input name="through" type="date" className={institutionField} /></label>
          <p className="text-xs text-[var(--theme-body)] sm:col-span-2">{copy.range}</p>
        </div>
      </details>
    </form>
    {resource.error != null ? <AdminFeedback error={resource.error} retry={resource.refresh} />
      : !page ? <p role="status" className="text-sm">{authMessages[locale].working}</p>
      : page.events.length ? <AuditTimeline rows={page.events} render={(event) => <li key={event.reference}><ActivityEntry event={event} /></li>} />
      : <p role="status" className="py-3 text-sm text-[var(--theme-body)]">{copy.empty}</p>}
    {(paging.cursors.length > 0 || page?.nextCursor) && <AuditPager page={paging.cursors.length + 1}
      newer={paging.cursors.length ? () => setPaging((current) => ({ ...current, cursors: current.cursors.slice(0, -1) })) : undefined}
      older={page?.nextCursor ? () => setPaging((current) => ({ ...current, cursors: [...current.cursors, page.nextCursor!] })) : undefined} />}
  </section>;
}

function AuditTimeline<T extends { occurredAt: string }>({ rows, render }: { rows: T[]; render: (event: T) => ReactNode }) {
  const [locale] = useLocale();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
  const days = new Map<string, T[]>();
  for (const row of rows) {
    const key = new Date(row.occurredAt).toISOString().slice(0, 10);
    const entries = days.get(key);
    if (entries) entries.push(row);
    else days.set(key, [row]);
  }
  return <div className="grid gap-3">
    {[...days].map(([day, entries]) => <section key={day} className="min-w-0 overflow-hidden rounded-lg border border-[var(--theme-border)]">
      <h3 className="border-b border-[var(--theme-border)] bg-[var(--theme-control)] px-3 py-2 text-sm font-semibold">
        <time dateTime={day}>{date.format(new Date(day))}</time>
      </h3>
      <ol className="divide-y divide-[var(--theme-border)]">{entries.map(render)}</ol>
    </section>)}
  </div>;
}

function ActivityEntry({ event }: { event: AuditEvent }) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const copy = t.auditWorkspace;
  const names: Partial<Record<string, string>> = { ...moderationCenterMessages[locale], ...accountEnforcementMessages[locale], ...t.events };
  const name = names[event.eventType] ?? readable(event.eventType, locale);
  const entries = [
    [copy.reference, event.reference], [t.actor, event.actorRef], [copy.resource, event.resourceRef],
    [t.organizationId, event.organizationRef], [copy.request, event.requestRef],
  ] as const;
  return <AuditEntry title={name} occurredAt={event.occurredAt}
    subtitle={copy.categories[event.category] + " · " + (names[event.resourceType] ?? readable(event.resourceType, locale))}
    outcome={copy.outcomes[event.outcome]} actor={event.actor} affected={event.affectedMember}>
    <AuditReferences entries={entries} />
    {(event.previousState || event.newState) && <div className="grid gap-2 sm:grid-cols-2">
      {([[copy.before, event.previousState], [copy.after, event.newState]] as const).map(([label, state]) =>
        state && <section key={label} className="min-w-0 rounded-md border border-[var(--theme-border)] p-2">
          <h4 className="mb-1 text-sm font-semibold">{label}</h4>
          <AuditReferences entries={Object.entries(state).map(([key, value]) => [readable(key, locale), value])} />
        </section>)}
    </div>}
  </AuditEntry>;
}

function DecisionRecords() {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const copy = t.auditWorkspace;
  const id = useId();
  const records = useInstitutionResource(loadAdminAudit);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const names: Partial<Record<string, string>> = t.events;
  const needle = search.trim().toLocaleLowerCase(locale);
  const matching = records.data?.filter((event) => !needle || [
    names[event.event], event.event, event.actorId, event.subjectId, event.organizationId, event.reason,
    event.actor?.displayName, event.actor?.username, event.actor?.username && "@" + event.actor.username,
    event.affectedMember?.displayName, event.affectedMember?.username, event.affectedMember?.username && "@" + event.affectedMember.username,
  ].some((value) => value?.toLocaleLowerCase(locale).includes(needle))) ?? [];
  return <section className={`${adminCompactCard} grid gap-3`} aria-labelledby={id}>
    <header className="border-b border-[var(--theme-border)] pb-3">
      <h2 id={id} className="text-lg font-semibold">{copy.decisions}</h2>
      <p className="mt-1 text-sm text-[var(--theme-body)]">{t.auditScope}</p>
    </header>
    <label className="max-w-lg text-sm font-semibold">{copy.decisionSearch}
      <input type="search" value={search} className={institutionField} placeholder={copy.decisionPlaceholder}
        onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
    </label>
    {records.error ? <AdminFeedback error={records.error} retry={records.refresh} />
      : !records.data ? <p role="status" className="text-sm">{authMessages[locale].working}</p>
      : matching.length ? <AuditTimeline rows={matching.slice(page * recordPageSize, (page + 1) * recordPageSize)}
        render={(event) => <li key={event.id}>
          <AuditEntry title={names[event.event] ?? readable(event.event, locale)} occurredAt={event.occurredAt}
            subtitle={event.role ? t[event.role] : undefined} actor={event.actor} affected={event.affectedMember}>
            {event.reason && <p className="whitespace-pre-wrap break-words text-sm">{event.reason}</p>}
            <AuditReferences entries={[[copy.reference, event.id], [t.actor, event.actorId], [t.subject, event.subjectId], [t.organizationId, event.organizationId]]} />
          </AuditEntry>
        </li>} />
      : <p className="py-3 text-sm text-[var(--theme-body)]">{needle ? copy.empty : t.emptyAudit}</p>}
    {(page > 0 || matching.length > recordPageSize) && <AuditPager page={page + 1}
      newer={page > 0 ? () => setPage(page - 1) : undefined}
      older={(page + 1) * recordPageSize < matching.length ? () => setPage(page + 1) : undefined} />}
  </section>;
}

function AuditEntry({ title, subtitle, occurredAt, outcome, actor, affected, children }: {
  title: string; subtitle?: string; occurredAt: string; outcome?: string; actor?: AuditPerson; affected?: AuditPerson; children: ReactNode;
}) {
  const [locale] = useLocale();
  const copy = adminMessages[locale].auditWorkspace;
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC" });
  return <details className="min-w-0">
    <summary className={adminDisclosure}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="min-w-0 break-words">
          <span className="block">{title}</span>
          {subtitle && <span className="block text-xs font-normal text-[var(--theme-body)]">{subtitle}</span>}
          {(actor || affected) && <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--theme-body)]">
            {actor && <span>{copy.actorName} · <strong>{personName(actor)}</strong></span>}
            {affected && <span>{copy.affectedName} · <strong>{personName(affected)}</strong></span>}
          </span>}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {outcome && <span className="rounded bg-[var(--theme-control)] px-2 py-1 text-xs">{outcome}</span>}
          <time className="text-xs font-normal text-[var(--theme-body)]" dateTime={occurredAt}>{time.format(new Date(occurredAt))} UTC</time>
        </span>
      </span>
    </summary>
    <div className="grid min-w-0 gap-2 border-t border-[var(--theme-border)] bg-[var(--theme-control)] px-3 py-2.5">
      {children}
    </div>
  </details>;
}

function AuditReferences({ entries }: { entries: readonly (readonly [string, string | null])[] }) {
  return <dl className="grid min-w-0 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
    {entries.map(([label, value]) => value != null && <div key={label} className="min-w-0">
      <dt className="font-semibold text-[var(--theme-body)]">{label}</dt>
      <dd className="break-words [overflow-wrap:anywhere]">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
    </div>)}
  </dl>;
}

function AuditPager({ page, newer, older }: { page: number; newer?: () => void; older?: () => void }) {
  const [locale] = useLocale();
  const copy = adminMessages[locale].auditWorkspace;
  return <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--theme-border)] pt-3">
    <p className="text-sm text-[var(--theme-body)]" role="status">
      {copy.page.replace("{page}", new Intl.NumberFormat(locale).format(page))}
    </p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={adminSecondaryAction} disabled={!newer} onClick={newer}>{copy.newer}</button>
      <button type="button" className={adminSecondaryAction} disabled={!older} onClick={older}>{copy.older}</button>
    </div>
  </div>;
}

function personName({ displayName, username }: AuditPerson) {
  if (!username) return displayName ?? "";
  return displayName && displayName.toLowerCase() !== username.toLowerCase() ? `${displayName} (@${username})` : "@" + username;
}

function readable(code: string, locale: string) {
  return code.replaceAll("_", " ").replace(/^./, (character) => character.toLocaleUpperCase(locale));
}
