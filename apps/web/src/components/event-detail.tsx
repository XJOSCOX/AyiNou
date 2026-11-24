"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import type { CommunityEvent, EventResponse } from "@ayinou/shared";
import { ApiRequestError } from "@/lib/api-errors";
import { loadEventOptions, loadEventUpdates, loadParticipants, writeEvent } from "@/lib/events-api";
import { eventMessages } from "@/lib/events-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { EventCover, EventDate, EventEditor, eventResponses, eventSecondary } from "./events";
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

  return <MemberShell signedIn={signedIn}><article className="grid gap-5">
    <header className="overflow-hidden rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      {event.coverUrl && <EventCover url={event.coverUrl} detail />}
      <div className="grid gap-4 p-5 sm:p-8">
        <div className="flex flex-wrap gap-3 text-sm font-semibold text-[var(--theme-link)]">
          <span>{t[event.category]}</span><span>{t[event.format]}</span><span>{t[event.status]}</span>
        </div>
        <h1 className="break-words text-3xl font-bold sm:text-4xl">{event.title}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {event.organizer.handle ? <Link className={institutionLink}
            href={(event.organizer.kind === "organization" ? "/organization/" : "/members/") + event.organizer.handle}>{event.organizer.name}</Link>
            : <span>{event.organizer.name}</span>}
          <EventDate value={event.startsAt} end={event.endsAt} />
          {(event.locality || event.country) && <span>{[event.locality,event.country].filter(Boolean).join(", ")}</span>}
        </div>
        {event.canManage && <div className="flex flex-wrap items-center gap-2">
          {!["canceled","completed"].includes(event.status) &&
            <button className={eventSecondary} onClick={() => setEditing(!editing)} aria-expanded={editing}>{t.edit}</button>}
          {event.status === "draft" && <button className={institutionAction} disabled={mutation.busy} onClick={() => transition("published")}>{t.publish}</button>}
          {event.canComplete &&
            <button className={eventSecondary} disabled={mutation.busy} onClick={() => transition("completed")}>{t.complete}</button>}
          {["draft","published"].includes(event.status) && <button className={eventSecondary} onClick={() => setConfirmation(!confirmation)}
            aria-expanded={confirmation}>{t.cancel}</button>}
          {confirmation && <button className={institutionAction} disabled={mutation.busy} onClick={() => transition("canceled")}>{t.cancel}?</button>}
        </div>}
      </div>
    </header>
    {mutation.error !== null && (mutation.error instanceof ApiRequestError && mutation.error.code === "EVENT_FULL"
      ? <p className={institutionCard} role="alert">{t.full}</p> : <ApiErrorNotice error={mutation.error} />)}
    {editing && <EditEvent event={event} done={(changed) => { setEvent(changed); setEditing(false); }} />}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
      <div className="grid min-w-0 gap-4">
        <section className={institutionCard + " grid gap-4"}>
          <h2 className="text-xl font-bold">{t.description}</h2>
          <p dir="auto" lang={event.language} className="whitespace-pre-wrap break-words">{event.description}</p>
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
          <dl className="grid gap-1">{eventResponses.map((response) => <div className="flex justify-between gap-3" key={response}>
            <dt>{t[response]}</dt><dd>{event.counts?.[response]}</dd></div>)}</dl>
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
