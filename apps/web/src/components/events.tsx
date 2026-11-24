"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { eventCategories, eventFormats, eventResponses, eventScopes, eventVisibilities, type CommunityEvent, type EventPreview, type EventScope } from "@ayinou/shared";
import { loadEventOptions, loadEvents, writeEvent, type EventOptions } from "@/lib/events-api";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { eventMessages } from "@/lib/events-i18n";
import { eventInstant, eventWallTime } from "@/lib/event-time";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { FilterPanel } from "./filter-panel";
import { PageHeader } from "./page-header";

const languageNames = { ht: "Kreyòl ayisyen", fr: "Français", en: "English", es: "Español" };
const departments = { "HT-AR": "Artibonite", "HT-CE": "Centre", "HT-GA": "Grand’Anse", "HT-NI": "Nippes", "HT-ND": "Nord",
  "HT-NE": "Nord-Est", "HT-NO": "Nord-Ouest", "HT-OU": "Ouest", "HT-SD": "Sud", "HT-SE": "Sud-Est" };
export const eventSecondary = "inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--theme-border)] px-4 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] disabled:opacity-60";
const titleStyle = "text-xl font-bold leading-tight";

export function EventDate({ value, end }: { value: string; end?: string }) {
  const [locale] = useLocale();
  const start = new Date(value);
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <time suppressHydrationWarning dateTime={value}>{end ? formatter.formatRange(start, new Date(end)) : formatter.format(start)}</time>;
}

export function EventPostPreview({ event }: { event: EventPreview }) {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  return <aside className="mt-3 grid gap-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] p-4 text-sm">
    <Link className={institutionLink} href={"/events/" + event.id}>{event.title}</Link>
    <p className="break-words">{event.organizer.name} · <EventDate value={event.startsAt} /></p>
    {event.status !== "published" && <p>{t[event.status]}</p>}
  </aside>;
}

export function EventCover({ url, detail = false }: { url: string; detail?: boolean }) {
  // The cover is user-supplied. Never send the page URL as the referrer.
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={1000} height={500} referrerPolicy="no-referrer" loading={detail ? "eager" : "lazy"}
      className={"w-full rounded-t-[10px] object-cover " + (detail ? "max-h-72" : "h-36")} />
  ) : null;
}

function Field({ name, label, children, value, type = "text", required, maxLength }: {
  name: string; label: string; children?: ReactNode; value?: string | number | null; type?: string; required?: boolean; maxLength?: number;
}) {
  return <label className="block min-w-0 text-sm font-semibold">{label}
    {children ?? <input name={name} type={type} defaultValue={value ?? ""} required={required} maxLength={maxLength} className={institutionField} />}
  </label>;
}

function optionsFrom(values: readonly string[], labels: Record<string, string>) {
  return values.map((value) => <option key={value} value={value}>{labels[value]}</option>);
}

export function EventDirectory() {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  const [scope, setScope] = useState<EventScope>("upcoming");
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
  return <section className="grid gap-5">
    <PageHeader title={t.events} actions={hasCreate && <Link className={institutionAction} href="/events/new">{t.create}</Link>} />
    {config.error !== null && <ApiErrorNotice error={config.error} retry={config.refresh} />}
    <nav aria-label={t.events} className="flex flex-wrap gap-2">{eventScopes.map((option) =>
      <button key={option} type="button" aria-pressed={scope === option} onClick={() => setScope(option)}
        className={scope === option ? institutionAction : eventSecondary}>{t[option]}</button>)}</nav>
    {!["mine", "organizing"].includes(scope) && config.data && (!config.data.enabled || !config.data.discovery)
      ? <p role="status" className={institutionCard}>{t.disabled}</p> : <>
      <form className="grid gap-3" role="search" onSubmit={search}>
        <FilterPanel active={[...new URLSearchParams(filters).keys()].filter((key) => key !== "q").length} search={<div className="flex items-end gap-2">
          <div className="min-w-0 grow"><Field name="q" type="search" label={t.search} maxLength={120} /></div>
          <button className={institutionAction}>{discoveryMessages[locale].search}</button>
        </div>}>
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
      {results.error !== null && <ApiErrorNotice error={results.error} retry={results.retry} />}
      {!results.page && !results.error && <p role="status">{t.loading}</p>}
      {results.page?.rows.length === 0 && <p className={institutionCard}>{t.empty}</p>}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{results.page?.rows.map((item) => <li key={item.id}
        className="min-w-0 rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-surface)]">
        {item.coverUrl && <EventCover url={item.coverUrl} />}
        <article className="grid gap-2 p-5">
          <p className="text-xs font-semibold text-[var(--theme-link)]">{t[item.category]} · {t[item.format]}</p>
          <h2 className={titleStyle + " break-words"}><Link className={institutionLink + " text-lg"} href={"/events/" + item.id}>{item.title}</Link></h2>
          <p className="text-sm"><EventDate value={item.startsAt} /></p>
          <p className="break-words text-sm">{item.organizer.name}{item.locality && " · " + item.locality}</p>
          {item.status !== "published" && <p className="text-sm">{t[item.status]}</p>}
        </article>
      </li>)}</ul>
      {results.page?.nextCursor && <button type="button" className={eventSecondary + " justify-self-start"} disabled={results.loadingMore}
        onClick={() => { void results.more(); }}>{t.more}</button>}
    </>}
  </section>;
}

export function EventEditor({ event, options, done }: { event?: CommunityEvent; options: EventOptions; done?: (event: CommunityEvent) => void }) {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  const [format, setFormat] = useState(event?.format ?? "in_person");
  const [visibility, setVisibility] = useState(event?.visibility ?? "public");
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
      communityId: visibility === "community" ? optional("communityId") : null, projectId: project?.split("/").filter(Boolean).at(-1) ?? null,
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
    <Field name="visibility" label={t.visibility}><select name="visibility" value={visibility} disabled={event?.status === "published"}
      onChange={(e) => setVisibility(e.target.value as typeof visibility)} className={institutionField}>{optionsFrom(eventVisibilities,t)}</select></Field>
    {visibility === "community" && <Field name="communityId" label={t.community}><select name="communityId" defaultValue={event?.communityId ?? ""} required className={institutionField}>
      <option value="">—</option>{options.communities.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select></Field>}
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
    <PageHeader title={t.create} />
    {options.error !== null && <ApiErrorNotice error={options.error} retry={options.refresh} />}
    {!options.data && !options.error && <p role="status">{t.loading}</p>}
    {options.data && (options.data.enabled && (options.data.individual || options.data.organizations.length)
      ? <EventEditor options={options.data} /> : <p role="status">{t.disabled}</p>)}
  </section>;
}
export { eventResponses };
