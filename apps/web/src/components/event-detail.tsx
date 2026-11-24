"use client";

import Image from "next/image";
import Link from "next/link";
import { MemberAppeals } from "./enforcement-appeals";
import { useCallback, useRef, useState, type FormEvent } from "react";
import type { CommunityEvent, EventResponse } from "@ayinou/shared";
import { ApiRequestError } from "@/lib/api-errors";
import { loadEventOptions, loadEventUpdates, loadParticipants, writeEvent } from "@/lib/events-api";
import { eventMessages } from "@/lib/events-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { EventCover, EventDate, EventEditor, EventOrganizerBadges, EventSectionHeader, eventResponses, eventSecondary } from "./events";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";

function EventMessageForm({ label, busy, onSend, max }: {
  label: string; busy: boolean; onSend: (body: string, id: string) => Promise<boolean>; max: number;
}) {
  const [text, setText] = useState("");
  const receipt = useRef({ text: "", id: "" });
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    if (receipt.current.text !== body) receipt.current = { text: body, id: crypto.randomUUID() };
    if (await onSend(body,receipt.current.id)) { setText(""); receipt.current = { text: "", id: "" }; }
  }
  return <form onSubmit={submit} className="grid gap-2">
    <label className="text-sm font-semibold">{label}<textarea className={institutionField} value={text} rows={3} maxLength={max} required
      onChange={(e) => setText(e.target.value)} /></label>
    <button className={eventSecondary + " justify-self-start"} disabled={busy}>{label}</button>
  </form>;
}

function ParticipantList({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  const load = useCallback((cursor: string | null, signal: AbortSignal) => loadParticipants(id,cursor,signal),[id]);
  const query = useCursorPage(load);
  return <>
    {query.error !== null && <ApiErrorNotice error={query.error} retry={query.retry} />}
    {!query.page && !query.error && <p role="status">{t.loading}</p>}
    {query.page?.rows.length === 0 && <p className="text-sm">{t.noParticipants}</p>}
    <ul className="grid gap-2">{query.page?.rows.map((row) => <li key={row.id}>
      {row.username ? <Link className={institutionLink} href={"/members/" + row.username}>{row.name}</Link> : row.name}
      {" · " + t[row.response]}</li>)}</ul>
    {query.page?.nextCursor && <button className={eventSecondary} disabled={query.loadingMore} onClick={() => { void query.more(); }}>{t.more}</button>}
  </>;
}

export function EventDetail({ initial, signedIn }: { initial: CommunityEvent; signedIn: boolean }) {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  const [event, setEvent] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [participants, setParticipants] = useState(false);
  const [consent, setConsent] = useState(initial.listMe);
  const [revision, setRevision] = useState(0);
  const [confirmation, setConfirmation] = useState(false);
  const [reported, setReported] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const mutation = useFeedMutation();
  const load = useCallback((cursor: string | null, signal: AbortSignal) => loadEventUpdates(initial.id,signedIn,cursor,signal),[initial.id,signedIn]);
  const updates = useCursorPage(load,revision);
  const path = "/" + event.id;
  const publishIcon = <Image src="/project-published.png" alt="" width={100} height={100} unoptimized className="size-5 shrink-0" />;

  function transition(status: "published" | "canceled" | "completed") {
    void mutation.run(async () => {
      const result = await writeEvent<{ event: CommunityEvent }>("POST",path + "/status",{ status, version: event.version });
      setEvent(result.event); setConfirmation(false); setEditing(false);
    });
  }
  function rsvp(response: EventResponse | null, listMe = consent) {
    void mutation.run(async () => {
      const result = await writeEvent<{ event: CommunityEvent | null }>("PUT",path + "/rsvp",{ response,listMe });
      if (result.event) { setEvent(result.event); setConsent(result.event.listMe); }
    });
  }

  return <MemberShell signedIn={signedIn}><article className="grid w-full min-w-0 gap-4">
    <EventSectionHeader />
    <header className="min-w-0 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      {event.coverUrl && <EventCover url={event.coverUrl} detail />}
      <div className="grid gap-4 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="grid min-w-0 flex-1 gap-1">
            <h1 dir="auto" className="max-w-4xl wrap-anywhere text-2xl font-bold leading-tight sm:text-4xl">{event.title}</h1>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold text-[var(--theme-link)]">{t[event.category]}</span>
              {event.communityName && <span className="text-[var(--theme-body)]">{t.relatedCommunity} · <bdi>{event.communityName}</bdi></span>}
            </p>
          </div>
          <span className={"inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold " + (event.status === "canceled"
            ? "bg-[var(--theme-error-bg)] text-[var(--theme-error-text)]"
            : "bg-[var(--theme-selected)] text-[var(--theme-link)]")}>
            {event.status === "published" && publishIcon}
            {t[event.status]}
          </span>
        </div>
        <dl className="grid gap-3 rounded-lg bg-[var(--theme-control)] px-3 py-3 sm:grid-cols-2 sm:px-4 xl:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-[var(--theme-body)]">{t.starts} / {t.ends}</dt>
            <dd className="mt-1 text-sm font-semibold"><EventDate value={event.startsAt} end={event.endsAt} timeZone={event.timeZone} /></dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-[var(--theme-body)]">{t.format}</dt>
            <dd className="mt-1 text-sm font-semibold">{t[event.format]}
              {(event.locality || event.country) && <bdi className="wrap-anywhere">{' · ' + [event.locality, event.country].filter(Boolean).join(", ")}</bdi>}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-[var(--theme-body)]">{t.organizer}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
              {event.organizer.handle ? <Link className={institutionLink + " wrap-anywhere"}
                href={(event.organizer.kind === "organization" ? "/organization/" : "/members/") + event.organizer.handle}>
                <bdi>{event.organizer.name}</bdi>
              </Link> : <bdi className="wrap-anywhere">{event.organizer.name}</bdi>}
              <EventOrganizerBadges organizer={event.organizer} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-[var(--theme-body)]">{t.participation}</dt>
            <dd className="mt-1 text-sm font-semibold">{t.audience[event.visibility]}</dd>
          </div>
        </dl>
      </div>
      {event.canManage && (!["canceled", "completed"].includes(event.status) || event.canComplete) &&
        <div className="grid gap-3 border-t border-[var(--theme-border)] px-4 py-3 sm:flex sm:items-center sm:justify-end sm:px-6">
          {event.status === "draft" && <p className="me-auto max-w-prose text-sm text-[var(--theme-body)]">{t.draftHelp}</p>}
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {event.status === "draft" && <button className={institutionAction + " gap-2"} disabled={mutation.busy} onClick={() => transition("published")}>
              {publishIcon}{t.publish}
            </button>}
            {!["canceled","completed"].includes(event.status) &&
              <button className={eventSecondary} onClick={() => setEditing(!editing)} aria-expanded={editing}>{t.edit}</button>}
            {event.canComplete &&
              <button className={eventSecondary} disabled={mutation.busy} onClick={() => transition("completed")}>{t.complete}</button>}
            {["draft","published"].includes(event.status) && <button className={eventSecondary} onClick={() => setConfirmation(!confirmation)}
              aria-expanded={confirmation}>{t.cancel}</button>}
            {confirmation && <button className={institutionAction} disabled={mutation.busy} onClick={() => transition("canceled")}>{t.cancel}?</button>}
          </div>
        </div>}
    </header>
    {mutation.error !== null && (mutation.error instanceof ApiRequestError && mutation.error.code === "EVENT_FULL"
      ? <p className={institutionCard} role="alert">{t.full}</p> : <ApiErrorNotice error={mutation.error} />)}
    {event.canManage && <MemberAppeals eventId={event.id} />}
    {editing && <EditEvent event={event} done={(changed) => { setEvent(changed); setEditing(false); }} />}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
      <div className="grid min-w-0 gap-4">
        <section className={institutionCard + " grid gap-4"}>
          <h2 className="text-xl font-bold">{t.description}</h2>
          <p dir="auto" lang={event.language} className="max-w-[72ch] whitespace-pre-wrap wrap-anywhere leading-relaxed text-[var(--theme-body)]">{event.description}</p>
          {event.projectId && <Link className={institutionLink} href={"/projects/" + event.projectId}>{t.project}</Link>}
          {event.venue && <p className="break-words">{event.venue}</p>}
          {event.meetingUrl && <a className={institutionLink} href={event.meetingUrl} target="_blank" rel="noreferrer">{t.meeting}</a>}
        </section>
        <section className={institutionCard + " grid gap-3"}>
          <h2 className="text-xl font-bold">{t.updates}</h2>
          {event.canManage && event.status === "published" && <EventMessageForm label={t.announce} busy={mutation.busy} max={1000}
            onSend={(body,submission) => mutation.run(async () => {
              await writeEvent("POST",path + "/updates",{ body,submission }); setRevision((n) => n + 1);
            })} />}
          {updates.error !== null && <ApiErrorNotice error={updates.error} retry={updates.retry} />}
          {!updates.page && !updates.error && <p role="status">{t.loading}</p>}
          {updates.page?.rows.length === 0 && <p className="text-sm">{t.noUpdates}</p>}
          <ul className="grid gap-4">{updates.page?.rows.map((item) => <li key={item.id} className="border-t border-[var(--theme-border)] pt-3">
            <p className="whitespace-pre-wrap break-words" dir="auto">{item.body}</p>
            <p className="text-sm text-[var(--theme-body)]"><EventDate value={item.createdAt} /></p>
          </li>)}</ul>
          {updates.page?.nextCursor && <button className={eventSecondary} disabled={updates.loadingMore} onClick={() => { void updates.more(); }}>{t.more}</button>}
        </section>
      </div>
      <div className="grid min-w-0 gap-4">
        {(event.canRsvp || event.response) && <section className={institutionCard + " grid gap-3"}>
          {event.canRsvp && <>
            <div className="flex flex-wrap gap-2">{eventResponses.map((response) => <button type="button" key={response}
              aria-pressed={response === event.response} disabled={mutation.busy} onClick={() => rsvp(response)}
              className={response === event.response ? institutionAction : eventSecondary}>{t[response]}</button>)}</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={consent} disabled={mutation.busy}
              onChange={(e) => { const value = e.target.checked; if (event.response && event.response !== "not_going") rsvp(event.response,value); else setConsent(value); }} />{t.consent}</label>
          </>}
          {event.response && <button type="button" className={eventSecondary + " justify-self-start"} disabled={mutation.busy} onClick={() => rsvp(null)}>{t.withdraw}</button>}
        </section>}
        {event.counts && <section className={institutionCard + " grid gap-3"}>
          <h2 className="text-xl font-bold">{t.participants}</h2>
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-[var(--theme-control)] p-2 text-center">
            {eventResponses.map((response) => <div className="flex min-w-0 flex-col-reverse gap-0.5 py-1" key={response}>
              <dt className="wrap-anywhere text-xs text-[var(--theme-body)]">{t[response]}</dt>
              <dd className="text-base font-semibold tabular-nums">{event.counts?.[response]}</dd>
            </div>)}
          </dl>
          <button type="button" className={eventSecondary} aria-expanded={participants} onClick={() => setParticipants(!participants)}>{t.participants}</button>
          {participants && <ParticipantList id={event.id} />}
        </section>}
        {event.canShare && <details className={institutionCard}><summary className="cursor-pointer font-semibold">{t.share}</summary>
          <EventMessageForm label={t.share} busy={mutation.busy} max={1500} onSend={(body,submission) => mutation.run(async () => {
            const { postId } = await writeEvent<{ postId: string }>("POST",path + "/share",{ body,submission,language: event.language }); setShared(postId);
          })} />
          {shared && <Link className={institutionLink} href={"/posts/" + shared}>{t.published}</Link>}
        </details>}
        {signedIn && !event.canManage && <details className={institutionCard}><summary className="cursor-pointer font-semibold">{t.report}</summary>
          {reported ? <p role="status">{t.reported}</p> : <EventMessageForm label={t.report} busy={mutation.busy} max={500}
            onSend={(note) => mutation.run(async () => { await writeEvent("POST",path + "/report",{ category: "other",note }); setReported(true); })} />}
        </details>}
      </div>
    </div>
  </article></MemberShell>;
}

function EditEvent({ event,done }: { event: CommunityEvent; done: (event: CommunityEvent) => void }) {
  const [locale] = useLocale();
  const config = useInstitutionResource(loadEventOptions);
  if (config.error !== null) return <ApiErrorNotice error={config.error} retry={config.refresh} />;
  return config.data ? <EventEditor event={event} options={config.data} done={done} /> : <p role="status">{eventMessages[locale].loading}</p>;
}
