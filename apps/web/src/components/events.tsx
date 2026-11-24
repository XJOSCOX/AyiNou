"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { eventCategories, eventFormats, eventResponses, eventScopes, eventVisibilities, type CommunityEvent, type EventOrganizer, type EventPreview, type EventScope } from "@ayinou/shared";
import { loadEventOptions, loadEvents, writeEvent, type EventOptions } from "@/lib/events-api";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { eventMessages } from "@/lib/events-i18n";
import { eventInstant, eventWallTime } from "@/lib/event-time";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { socialMessages } from "@/lib/social-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, PersonalClaimChecks, useInstitutionResource, VerifiedCheck } from "./institution-ui";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { FilterPanel } from "./filter-panel";
import { PageHeader } from "./page-header";

const languageNames = { ht: "Kreyòl ayisyen", fr: "Français", en: "English", es: "Español" };
const departments = { "HT-AR": "Artibonite", "HT-CE": "Centre", "HT-GA": "Grand’Anse", "HT-NI": "Nippes", "HT-ND": "Nord",
  "HT-NE": "Nord-Est", "HT-NO": "Nord-Ouest", "HT-OU": "Ouest", "HT-SD": "Sud", "HT-SE": "Sud-Est" };
export const eventSecondary = "inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--theme-border)] px-4 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] disabled:opacity-60";
const eventPanel = "min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]";
const eventTag = "inline-flex w-fit rounded-md bg-[var(--theme-control)] px-2 py-1 text-xs font-semibold text-[var(--theme-body)]";
const eventRow = "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-3 py-4 sm:gap-5 sm:px-5";

function EventPageHeader({ title, description, actions, children, compact = false, titleAs }: {
  title: string; description: string; actions?: ReactNode; children?: ReactNode; compact?: boolean; titleAs?: "h1" | "p";
}) {
  return <div className={eventPanel}>
    <PageHeader title={title} description={description} actions={actions} titleAs={titleAs}
      className={"!border-0 !bg-transparent" + (compact ? " sm:!py-4 [&>div:first-child]:!border-0 [&>div:first-child]:!ps-0 [&>div+div]:ms-auto" : "")} />
    {children}
  </div>;
}

function EventLoading({ label, agenda = false }: { label: string; agenda?: boolean }) {
  return <div role="status" className={agenda ? eventRow : eventPanel + " grid gap-3 p-5"}>
    <span className="sr-only">{label}</span>
    {agenda && <div aria-hidden="true" className="h-16 w-12 rounded-lg bg-[var(--theme-selected)] motion-safe:animate-pulse sm:w-16" />}
    <div aria-hidden="true" className="grid gap-3 motion-safe:animate-pulse">
      <div className="h-4 w-2/5 max-w-56 rounded bg-[var(--theme-selected)]" />
      <div className="h-4 w-3/5 max-w-72 rounded bg-[var(--theme-control)]" />
      <div className="h-4 w-1/3 max-w-40 rounded bg-[var(--theme-control)]" />
    </div>
  </div>;
}

export function EventsBackLink({ label }: { label?: string } = {}) {
  const [locale] = useLocale();
  return <Link href="/events" className={eventSecondary + " gap-2"}>
    <span aria-hidden="true">←</span>{label ?? eventMessages[locale].events}
  </Link>;
}

export function EventSectionHeader({ scope, actions }: { scope?: EventScope; actions?: ReactNode }) {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  return <EventPageHeader title={t.events} description={t.directoryHelp} titleAs={scope ? "h1" : "p"} compact
    actions={scope ? actions : <EventsBackLink label={t.back} />}>
    <nav aria-label={t.events} className="flex flex-wrap gap-1 border-t border-[var(--theme-border)] p-2 sm:px-3">
      {eventScopes.map((option) => <Link key={option} href={option === "upcoming" ? "/events" : `/events?scope=${option}`}
        aria-current={scope === option ? "page" : undefined} scroll={false}
        className="inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-body)] hover:bg-[var(--theme-control)] focus-visible:outline-2 aria-[current=page]:bg-[var(--theme-selected)] aria-[current=page]:text-[var(--theme-link)]">
        {t[option]}
      </Link>)}
    </nav>
  </EventPageHeader>;
}

export function EventOrganizerBadges({ organizer }: { organizer: EventOrganizer }) {
  const [locale] = useLocale();
  if (organizer.kind === "organization") {
    return organizer.verified ? <VerifiedCheck label={socialMessages[locale].verifiedOrganization} /> : null;
  }
  return <>
    {organizer.personalClaims?.length ? <PersonalClaimChecks claims={organizer.personalClaims} /> : null}
    {organizer.founderVerified && <FounderVerifiedMark compact />}
  </>;
}

function EventAgendaRow({ event, organizing }: { event: CommunityEvent; organizing: boolean }) {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  const titleId = useId();
  const start = new Date(event.startsAt);
  let timeZone = event.timeZone;
  let eventDay: Intl.DateTimeFormat;
  try {
    eventDay = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "full" });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    timeZone = "UTC";
    eventDay = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "full" });
  }
  const date = Object.fromEntries(new Intl.DateTimeFormat(locale, {
    timeZone, month: "short", day: "numeric", year: "numeric",
  }).formatToParts(start).map(({ type, value }) => [type, value]));
  const clock = new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const location = event.format === "online" ? t.online : [event.locality, t[event.format]].filter(Boolean).join(" · ");
  const showStatus = organizing || event.status !== "published";
  const statusColor = event.status === "canceled"
    ? " !bg-[var(--theme-error-bg)] !text-[var(--theme-error-text)]"
    : " !bg-[var(--theme-selected)] !text-[var(--theme-link)]";

  return <li className="min-w-0">
    <Link aria-labelledby={titleId} href={`/events/${event.id}`}
      className={eventRow + " group hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--theme-link)]"}>
      <div aria-hidden="true" className="grid min-w-12 justify-items-center rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] px-1.5 py-1.5 text-[var(--theme-link)] sm:min-w-16 sm:py-2">
        <span className="text-xs font-semibold">{date.month}</span>
        <span className="text-xl font-bold tabular-nums leading-none sm:text-2xl">{date.day}</span>
        <span className="mt-0.5 text-xs tabular-nums text-[var(--theme-body)]">{date.year}</span>
      </div>
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-semibold text-[var(--theme-link)]">{t[event.category]}</span>
          {showStatus && <span className={eventTag + statusColor}>{t[event.status]}</span>}
        </div>
        <h2 id={titleId} dir="auto" className="wrap-anywhere text-base font-bold leading-snug group-hover:underline group-focus-visible:underline sm:text-lg">
          {event.title}
        </h2>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-[var(--theme-body)]">
          <time dateTime={event.startsAt} className="font-semibold">
            <span className="sr-only">{eventDay.format(start)} </span>
            {clock.formatRange(start, new Date(event.endsAt))}
          </time>
          <bdi className="wrap-anywhere">{location}</bdi>
        </p>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--theme-body)]">
          <bdi className="wrap-anywhere">{event.organizer.name}</bdi><EventOrganizerBadges organizer={event.organizer} />
        </p>
        {event.description && <p dir="auto" className="mt-1 line-clamp-2 max-w-[76ch] wrap-anywhere text-sm leading-relaxed text-[var(--theme-body)]">
          {event.description}
        </p>}
      </div>
      <div className="flex items-center gap-3 self-center" aria-hidden="true">
        {event.coverUrl && <div className="hidden w-28 overflow-hidden rounded-lg md:block"><EventCover url={event.coverUrl} thumbnail /></div>}
        <span className="grid size-7 place-items-center rounded-full border border-[var(--theme-border)] text-[var(--theme-link)] group-hover:bg-[var(--theme-selected)] sm:size-8">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  </li>;
}

export function EventDate({ value, end, timeZone }: { value: string; end?: string; timeZone?: string }) {
  const [locale] = useLocale();
  const start = new Date(value);
  const options: Intl.DateTimeFormatOptions = timeZone
    ? { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }
    : { dateStyle: "medium", timeStyle: "short" };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
  }
  return <time suppressHydrationWarning dateTime={value}>{end ? formatter.formatRange(start, new Date(end)) : formatter.format(start)}</time>;
}

export function EventPostPreview({ event }: { event: EventPreview }) {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  return <aside className="mt-3 grid gap-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] p-4 text-sm">
    <Link className={institutionLink} href={"/events/" + event.id}>{event.title}</Link>
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <bdi className="wrap-anywhere">{event.organizer.name}</bdi><EventOrganizerBadges organizer={event.organizer} />
      </span>
      <EventDate value={event.startsAt} timeZone={event.timeZone} />
    </p>
    {event.status !== "published" && <p>{t[event.status]}</p>}
  </aside>;
}

export function EventCover({ url, detail = false, thumbnail = false }: { url: string; detail?: boolean; thumbnail?: boolean }) {
  // The cover is user-supplied. Never send the page URL as the referrer.
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={1000} height={500} referrerPolicy="no-referrer" loading={detail ? "eager" : "lazy"}
      className={"w-full object-cover " + (thumbnail ? "aspect-[7/5]" : detail ? "max-h-72 rounded-t-[10px]" : "h-36 rounded-t-[10px]")} />
  ) : null;
}

function Field({ name, label, children, value, type = "text", required, maxLength }: {
  name: string; label: string; children?: ReactNode; value?: string | number | null; type?: string; required?: boolean; maxLength?: number;
}) {
  return <label className="block min-w-0 text-sm font-semibold">{label}
    {children ?? <input name={name} type={type} defaultValue={value ?? ""} required={required} maxLength={maxLength} className={institutionField} />}
  </label>;
}

function optionsFrom<Value extends string>(values: readonly Value[], labels: Record<Value, string>) {
  return values.map((value) => <option key={value} value={value}>{labels[value]}</option>);
}

export function EventDirectory({ scope }: { scope: EventScope }) {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  const [filters, setFilters] = useState("");
  const load = useCallback((cursor: string | null, signal: AbortSignal) =>
    loadEvents(new URLSearchParams(filters + "&scope=" + scope).toString(), cursor, signal), [filters, scope]);
  const results = useCursorPage(load);
  const config = useInstitutionResource(loadEventOptions);
  const hasCreate = config.data?.enabled && (config.data.individual || config.data.organizations.length > 0);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const [name, value] of form) {
      if (typeof value !== "string" || !value.trim()) continue;
      if (name === "from" || name === "until") {
        const day = new Date(value + "T00:00");
        if (name === "until") day.setDate(day.getDate() + 1);
        query.set(name, day.toISOString());
      } else query.set(name, value.trim());
    }
    setFilters(query.toString());
  }
  const filtersActive = [...new URLSearchParams(filters).keys()].filter((key) => key !== "q").length;
  return <section className="grid min-w-0 gap-4">
    <EventSectionHeader scope={scope}
      actions={hasCreate && <Link className={institutionAction + " gap-2"} href="/events/new"><span aria-hidden="true">+</span>{t.create}</Link>} />
    {config.error !== null && <ApiErrorNotice error={config.error} retry={config.refresh} />}
    {!["mine", "organizing"].includes(scope) && config.data && (!config.data.enabled || !config.data.discovery)
      ? <p role="status" className={institutionCard}>{t.disabled}</p> : <div className={eventPanel}>
      <form className="border-b border-[var(--theme-border)] p-3 sm:px-5 sm:py-3" role="search" onSubmit={search}>
        <FilterPanel active={filtersActive} wideSearch search={
          <input name="q" type="search" aria-label={t.search} placeholder={t.search} maxLength={120} className={institutionField + " !mt-0"} />
        } submit={<button className={institutionAction + " min-h-11 shrink-0 px-3 sm:px-4"}>
          <svg className="sm:hidden" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" />
          </svg>
          <span className="sr-only sm:not-sr-only">{discoveryMessages[locale].search}</span>
        </button>}>
          <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field name="format" label={t.format}><select name="format" className={institutionField}><option value="">{t.all}</option>{optionsFrom(eventFormats,t)}</select></Field>
            <Field name="category" label={t.category}><select name="category" className={institutionField}><option value="">{t.all}</option>{optionsFrom(eventCategories,t)}</select></Field>
            <Field name="country" label={t.country}><input name="country" className={institutionField} maxLength={2} pattern="[A-Z]{2}" placeholder="HT" /></Field>
            <Field name="department" label={t.department}><select name="department" className={institutionField}><option value="">{t.all}</option>{optionsFrom(Object.keys(departments),departments)}</select></Field>
            <Field name="from" type="date" label={t.from} /><Field name="until" type="date" label={t.until} />
            <button className={eventSecondary + " justify-self-start"}>{t.filters}</button>
          </div>
        </FilterPanel>
      </form>
      {results.error !== null && <div className="p-4 sm:px-5"><ApiErrorNotice error={results.error} retry={results.retry} /></div>}
      {!results.page && results.error === null && <EventLoading label={t.loading} agenda />}
      {results.page?.rows.length === 0 && <p role="status" className="px-4 py-8 text-center text-sm text-[var(--theme-body)]">{t.empty}</p>}
      {!!results.page?.rows.length && <ul className="divide-y divide-[var(--theme-border)] [&>li:last-child>a]:rounded-b-xl">
        {results.page.rows.map((item) => <EventAgendaRow key={item.id} event={item} organizing={scope === "organizing"} />)}
      </ul>}
      {results.page?.nextCursor && <div className="border-t border-[var(--theme-border)] px-3 py-3 sm:px-5">
        <button type="button" className={eventSecondary} disabled={results.loadingMore}
          onClick={() => { void results.more(); }}>{t.more}</button>
      </div>}
    </div>}
  </section>;
}

export function EventEditor({ event, options, done }: { event?: CommunityEvent; options: EventOptions; done?: (event: CommunityEvent) => void }) {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  const [format, setFormat] = useState(event?.format ?? "in_person");
  const [visibility, setVisibility] = useState(event?.visibility ?? "public");
  const audienceHelpId = useId();
  const communityHelpId = useId();
  const lockedAudience = event?.status === "published";
  const communities = options.communities;
  const missingCommunityId = communities.some(({ id }) => id === event?.communityId) ? null : event?.communityId;
  const [zone] = useState(() => event?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [badTime, setBadTime] = useState(false);
  const mutation = useFeedMutation();
  const receipt = useRef({ payload: "", request: "" });
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    function string(key: string) { return String(form.get(key) ?? "").trim(); }
    function optional(key: string) { return string(key) || null; }
    const timeZone = string("timeZone");
    const startsAt = eventInstant(string("startsAt"),timeZone,event?.startsAt);
    const endsAt = eventInstant(string("endsAt"),timeZone,event?.endsAt);
    setBadTime(!startsAt || !endsAt || startsAt >= endsAt);
    if (!startsAt || !endsAt || startsAt >= endsAt) return;
    const project = optional("projectId");
    const body = { version: event?.version ?? null, organizationId: event?.organizationId ?? optional("organizationId"),
      communityId: lockedAudience ? event.communityId : optional("communityId"), projectId: project?.split("/").filter(Boolean).at(-1) ?? null,
      title: string("title"), description: string("description"), category: string("category"), format, visibility, startsAt, endsAt, timeZone,
      country: optional("country"), department: string("country") === "HT" ? optional("department") : null, locality: optional("locality"),
      venue: optional("venue"), meetingUrl: format === "in_person" ? null : optional("meetingUrl"), coverUrl: optional("coverUrl"),
      capacity: optional("capacity") ? Number(string("capacity")) : null, language: string("language") };
    const payload = JSON.stringify(body);
    if (receipt.current.payload !== payload) receipt.current = { payload, request: crypto.randomUUID() };
    await mutation.run(async () => {
      const result = await writeEvent<{ event: CommunityEvent }>(event ? "PUT" : "POST", event ? "/" + event.id : "", {
        ...body, request: receipt.current.request,
      });
      if (done) done(result.event);
      else router.push("/events/" + result.event.id);
    });
  }
  return <form className={institutionCard + " grid gap-4 sm:grid-cols-2"} onSubmit={submit}>
    {!event && <Field name="organizationId" label={t.organizer}><select name="organizationId" className={institutionField}>
      {options.individual && <option value="">{t.individual}</option>}
      {options.organizations.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
    </select></Field>}
    <Field name="title" label={t.title} value={event?.title} required maxLength={120} />
    <div className="sm:col-span-2"><Field name="description" label={t.description}>
      <textarea name="description" className={institutionField} rows={5} required maxLength={3000} defaultValue={event?.description} />
    </Field></div>
    <Field name="category" label={t.category}><select name="category" defaultValue={event?.category} className={institutionField}>{optionsFrom(eventCategories,t)}</select></Field>
    <Field name="format" label={t.format}><select name="format" value={format} className={institutionField} onChange={(e) => setFormat(e.target.value as typeof format)}>{optionsFrom(eventFormats,t)}</select></Field>
    <Field name="startsAt" type="datetime-local" label={t.starts} required value={event && eventWallTime(event.startsAt,zone)} />
    <Field name="endsAt" type="datetime-local" label={t.ends} required value={event && eventWallTime(event.endsAt,zone)} />
    <Field name="timeZone" label={t.timeZone} value={zone} required maxLength={80} />
    <Field name="language" label={t.language}><select name="language" defaultValue={event?.language ?? locale} className={institutionField}>{optionsFrom(Object.keys(languageNames), languageNames)}</select></Field>
    <div className="grid content-start gap-1">
      <Field name="visibility" label={t.participation}><select name="visibility" value={visibility} disabled={lockedAudience}
        aria-describedby={audienceHelpId} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className={institutionField}>
        {optionsFrom(eventVisibilities, { public: t.public, members: t.memberAudience, community: t.communityAudience })}
      </select></Field>
      <p id={audienceHelpId} className="text-sm text-[var(--theme-body)]">{t.audience[visibility]}</p>
    </div>
    <div className="grid content-start gap-1">
      <Field name="communityId" label={t.relatedCommunity}><select name="communityId" defaultValue={event?.communityId ?? ""}
        aria-describedby={communityHelpId} disabled={lockedAudience} required={visibility === "community"} className={institutionField}>
        <option value="">{t.noCommunity}</option>
        {missingCommunityId && <option value={missingCommunityId}>{event?.communityName ?? t.community}</option>}
        {communities.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select></Field>
      <p id={communityHelpId} className="text-sm text-[var(--theme-body)]">{t.relatedCommunityHelp}</p>
    </div>
    <Field name="country" label={t.country}><input name="country" required={format !== "online"} className={institutionField} pattern="[A-Z]{2}" maxLength={2} placeholder="HT" defaultValue={event?.country ?? ""} /></Field>
    <Field name="department" label={t.department}><select name="department" defaultValue={event?.department ?? ""} className={institutionField}><option value="">—</option>{optionsFrom(Object.keys(departments),departments)}</select></Field>
    <Field name="locality" label={t.locality} value={event?.locality} maxLength={100} />
    <Field name="venue" label={t.venue} value={event?.venue} maxLength={240} />
    {format !== "in_person" && <Field name="meetingUrl" type="url" label={t.meeting} value={event?.meetingUrl} maxLength={1000} />}
    <p className="text-sm text-[var(--theme-body)] sm:col-span-2">{t.privateDetails}</p>
    <Field name="coverUrl" type="url" label={t.cover} value={event?.coverUrl} maxLength={1000} />
    <Field name="capacity" label={t.capacity}><input name="capacity" type="number" min="1" max="5000" defaultValue={event?.capacity ?? ""} className={institutionField} /></Field>
    <Field name="projectId" label={t.project} value={event?.projectId} />
    {badTime && <p role="alert" className="sm:col-span-2">{t.badTime}</p>}
    {mutation.error !== null && <div className="sm:col-span-2"><ApiErrorNotice error={mutation.error} /></div>}
    <div className="sm:col-span-2"><button disabled={mutation.busy} className={institutionAction}>{event?.status === "published" ? t.edit : t.save}</button></div>
  </form>;
}

export function NewEvent() {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  const options = useInstitutionResource(loadEventOptions);
  return <section className="grid gap-4">
    <EventPageHeader title={t.create} description={t.createHelp} actions={<EventsBackLink />} />
    {options.error !== null && <ApiErrorNotice error={options.error} retry={options.refresh} />}
    {!options.data && options.error === null && <EventLoading label={t.loading} />}
    {options.data && (options.data.enabled && (options.data.individual || options.data.organizations.length)
      ? <EventEditor options={options.data} /> : <p role="status" className={institutionCard}>{t.disabled}</p>)}
  </section>;
}
export { eventResponses };
