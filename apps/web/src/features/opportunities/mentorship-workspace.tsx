
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Locale, MentorshipAgreementTerms, MentorshipItem, MentorshipItemContent, MentorshipRequest, MentorshipWorkspace } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionField, useInstitutionResource } from "@/components/institution-ui";
import { SettingsHistory } from "@/components/settings-disclosures";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useLocale } from "@/lib/locale-store";
import { coordinationCopy } from "@/lib/mentorship-coordination-i18n";
import { mentorshipCopy } from "@/lib/mentorship-i18n";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import {
  CoordinationHeader, CoordinationSafety, coordinationApi, coordinationField, coordinationGrid, coordinationPage, useCoordinationCommand,
} from "./mentorship-coordination";
import { OpportunityState, opportunitySecondary, opportunitySettingsCard, opportunityTag } from "./presentation";

type Command = ReturnType<typeof useCoordinationCommand>;
const value = (form: FormData, name: string) => Number(form.get(name));
const formLayout = "grid min-w-0 gap-3";

export function MentorshipWorkspaceDetail({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  const load = useCallback((signal: AbortSignal): Promise<MentorshipWorkspace> =>
    authorizedSocialRequest(coordinationApi + "/relationships/" + id, { signal, cache:"no-store" }), [id]);
  const resource = useInstitutionResource(load);
  const workspace = resource.data;
  return <CoordinationHeader>
    <Link className={opportunitySecondary + " w-fit justify-self-end"} href={coordinationPage}>{t("requests")}</Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!workspace && resource.error === null && <OpportunityState>{mentorshipCopy(locale)("loading")}</OpportunityState>}
    {workspace && <Workspace key={id} workspace={workspace} refresh={resource.refresh} />}
  </CoordinationHeader>;
}

function Workspace({ workspace, refresh }: { workspace: MentorshipWorkspace; refresh: () => void }) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  const command = useCoordinationCommand(refresh);
  const { id, request, version, state } = workspace;
  const closed = state === "ended" || state === "completed";
  const available = state === "active" || state === "paused" || state === "agreement_pending";
  const loadPeer = useCallback((signal: AbortSignal): Promise<MentorshipRequest> =>
    authorizedSocialRequest(coordinationApi + "/requests/" + request, { signal, cache:"no-store" }), [request]);
  const peer = useInstitutionResource(loadPeer);
  const states = [
    ...(state === "active" ? ["pause"] as const : []),
    ...(state === "paused" ? ["resume"] as const : []),
    ...((state === "active" || state === "paused") && workspace.completion !== "mine" ? ["complete"] as const : []),
    ...(!closed ? ["end"] as const : []),
  ];
  return <>
    <section className={opportunitySettingsCard}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{workspace.agreedTerms?.title ?? workspace.agreement?.terms.title ?? t("openWorkspace")}</h2>
        <span className={opportunityTag} role="status">{t(state)}</span>
      </header>
      {workspace.completion === "mine" && <OpportunityState>{t("completionWaiting")}</OpportunityState>}
      {states.length > 0 && <div className="grid min-w-0 items-start gap-2 md:grid-cols-2">
        {states.map(action => <SettingsHistory key={action} title={t(action)}>
          <form className={formLayout} onSubmit={event => {
            event.preventDefault();
            void command.send({ action,id,expectedVersion:version,confirmed:true });
          }}>
            <label className="flex items-start gap-2"><input type="checkbox" required />{t("confirm")}</label>
            <button className={opportunitySecondary + " w-fit"} disabled={command.busy}>{t(action)}</button>
          </form>
        </SettingsHistory>)}
      </div>}
      {command.error !== null && <ApiErrorNotice error={command.error} retry={refresh} signIn />}
    </section>
    {workspace.agreedTerms && <section className={opportunitySettingsCard}><h2 className="text-lg font-semibold">{t("agreedTerms")}</h2>
      <Terms terms={workspace.agreedTerms} locale={locale} />
    </section>}
    {available && <Agreement workspace={workspace} command={command} />}
    {workspace.items && (workspace.items.length > 0 || state === "active") &&
      <CoordinationItems workspace={workspace} command={command} />}
    {!!workspace.history?.length && <SettingsHistory title={t("history")}>
      <ol className="grid gap-2">{workspace.history.map((event,index) => <li key={event.at + index}>
        <time dateTime={event.at}>{new Date(event.at).toLocaleString(locale)}</time>
        {" · "}{event.state && historyState(event.state,locale)}
        {event.correction && <ItemContent content={event.correction} locale={locale} />}
      </li>)}</ol>
    </SettingsHistory>}
    <section className={opportunitySettingsCard}>
      <CoordinationSafety request={request} reported={workspace.reported} refresh={refresh} username={peer.data?.peer?.username}/>
    </section>
  </>;
}

const historyStates = ["agreement_pending","active","paused","completed","ended","safety_restricted","proposed",
  "agreed","declined","cancelled","completion_pending","recorded"] as const;

function historyState(state: string, locale: Locale) {
  const key = historyStates.find(entry => entry === state);
  return key ? coordinationCopy(locale)(key) : coordinationCopy(locale)("notice");
}

function Terms({ terms, locale }: { terms: MentorshipAgreementTerms; locale: Locale }) {
  const t = coordinationCopy(locale), m = mentorshipCopy(locale), o = opportunityCopy(locale);
  return <dl className={coordinationGrid}>
    <div><dt className="font-medium">{t("agreementTitle")}</dt><dd>{terms.title}</dd></div>
    <div><dt className="font-medium">{m("mode")}</dt><dd>{o(terms.mode)}</dd></div>
    <div><dt className="font-medium">{m("topics")}</dt><dd>{terms.topics.map(topic => m(topic)).join(", ")}</dd></div>
    <div><dt className="font-medium">{m("durationWeeks")}</dt><dd>{terms.weeks}</dd></div>
    <div><dt className="font-medium">{t("frequency")}</dt><dd>{terms.frequency}</dd></div>
    <div><dt className="font-medium">{m("sessionMinutes")}</dt><dd>{terms.minutes}</dd></div>
    <div><dt className="font-medium">{t("objectives")}</dt><dd dir="auto">{terms.objectives}</dd></div>
    <div><dt className="font-medium">{t("expectations")}</dt><dd dir="auto">{terms.expectations}</dd></div>
  </dl>;
}

function Agreement({ workspace, command }: { workspace: MentorshipWorkspace; command: Command }) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale), m = mentorshipCopy(locale), o = opportunityCopy(locale);
  const { agreement,limits,id,version } = workspace;
  const current = agreement?.terms ?? workspace.agreedTerms;
  function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void command.send({ action:"propose_agreement",id,expectedVersion:version,
      terms:{ title:coordinationField(form,"title"),objectives:coordinationField(form,"objectives"),
        expectations:coordinationField(form,"expectations"),weeks:value(form,"weeks"),frequency:value(form,"frequency"),
        minutes:value(form,"minutes"),mode:coordinationField(form,"mode"),topics:form.getAll("topics"),free:true,safeguarding:true } });
  }
  return <section className={opportunitySettingsCard}>
    <h2 className="text-lg font-semibold">{t("agreement")}</h2>
    {agreement && <>
      <Terms terms={agreement.terms} locale={locale} />
      {agreement.peer && <p>{t("peerConfirmed")}</p>}
      {agreement.mine ? <p>{t("confirmed")}</p> : <form className={formLayout} onSubmit={event => {
        event.preventDefault();
        void command.send({ action:"confirm_agreement",id,expectedVersion:version,revision:agreement.revision,confirmed:true });
      }}>
        <label className="flex items-start gap-2"><input type="checkbox" required />{t("confirm")}</label>
        <button disabled={command.busy} className={institutionAction + " w-fit"}>{t("confirmAgreement")}</button>
      </form>}
    </>}
    <SettingsHistory title={t("propose")}>
      <form className={formLayout} onSubmit={propose} key={agreement?.revision ?? 0}>
        <label>{t("agreementTitle")}<input className={institutionField} name="title" defaultValue={current?.title} minLength={3} maxLength={100} required /></label>
        <label>{t("objectives")}<textarea className={institutionField} name="objectives" defaultValue={current?.objectives} minLength={3} maxLength={750} required rows={2} /></label>
        <label>{t("expectations")}<textarea className={institutionField} name="expectations" defaultValue={current?.expectations} minLength={3} maxLength={750} required rows={2} /></label>
        <div className={coordinationGrid}>
          <label>{m("durationWeeks")}<input className={institutionField} name="weeks" type="number" min={1} max={limits.agreementWeeks} defaultValue={current?.weeks} required /></label>
          <label>{t("frequency")}<input className={institutionField} name="frequency" type="number" min={1} max={4} defaultValue={current?.frequency ?? 1} required /></label>
          <label>{m("sessionMinutes")}<input className={institutionField} name="minutes" type="number" min={15} max={limits.sessionMinutes} defaultValue={current?.minutes ?? 30} required /></label>
          <label>{m("mode")}<select className={institutionField} name="mode" defaultValue={current?.mode} required>
            {limits.modes.map(mode => <option key={mode} value={mode}>{o(mode)}</option>)}
          </select></label>
        </div>
        <fieldset className={coordinationGrid}><legend>{m("topics")}</legend>
          {limits.topics.map(topic => <label key={topic} className="flex items-start gap-2">
            <input type="checkbox" name="topics" value={topic} defaultChecked={current?.topics.includes(topic)} />{m(topic)}
          </label>)}
        </fieldset>
        <label className="flex items-start gap-2"><input type="checkbox" required />{t("free")}</label>
        <label className="flex items-start gap-2"><input type="checkbox" required />{t("safeguarding")}</label>
        <button type="submit" className={institutionAction + " w-fit"} disabled={command.busy}>{t("propose")}</button>
      </form>
    </SettingsHistory>
  </section>;
}

function ItemContent({ content, locale }: { content: MentorshipItemContent; locale: Locale }) {
  if ("text" in content) return <p dir="auto">{content.text}</p>;
  return <div>
    <p dir="auto">{content.topic}</p>
    <time dateTime={content.startsAt}>{new Intl.DateTimeFormat(locale,{ dateStyle:"medium",timeStyle:"short",timeZone:content.timeZone }).format(new Date(content.startsAt))}</time>
    {" · "}{content.timeZone} · {content.minutes} min
  </div>;
}

function ItemForm({ kind, item, objective, workspace, command }: {
  kind: MentorshipItem["kind"]; item?: MentorshipItem; objective?: string;
  workspace: MentorshipWorkspace; command: Command;
}) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale), m = mentorshipCopy(locale);
  const saved = item?.proposed ?? item?.accepted;
  return <SettingsHistory title={item ? t("revise") : t(kind)}>
    <form className={formLayout} onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const content = kind === "session" ? { localStart:coordinationField(form,"localStart"),timeZone:coordinationField(form,"timeZone"),
        topic:coordinationField(form,"topic"),minutes:value(form,"minutes") } : { text:coordinationField(form,"text") };
      void command.send({ action:"propose_item",id:workspace.id,expectedVersion:workspace.version,kind,content,
        ...(item && { item:item.id,itemVersion:item.version }), ...(objective && { objective }) });
    }}>
      {kind === "session" ? <>
        <label>{t("sessionTopic")}<input className={institutionField} name="topic" defaultValue={saved && "topic" in saved ? saved.topic : undefined} minLength={3} maxLength={100} required /></label>
        <div className={coordinationGrid}>
          <label>{t("startAt")}<input className={institutionField} name="localStart" type="datetime-local" required defaultValue={saved && "localStart" in saved ? saved.localStart : undefined} /></label>
          <label>{t("timeZone")}<input className={institutionField} name="timeZone" maxLength={64}
            defaultValue={saved && "timeZone" in saved ? saved.timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Port-au-Prince"} required /></label>
          <label>{m("sessionMinutes")}<input className={institutionField} name="minutes" type="number" min={15} max={workspace.limits.sessionMinutes}
            defaultValue={saved && "minutes" in saved ? saved.minutes : 30} required /></label>
        </div>
      </> : <label>{t(kind)}<textarea className={institutionField} name="text" defaultValue={saved && "text" in saved ? saved.text : undefined}
        rows={2} required minLength={3} maxLength={500} /></label>}
      <button className={institutionAction + " w-fit"} disabled={command.busy}>{t("proposeItem")}</button>
    </form>
  </SettingsHistory>;
}

function CoordinationItems({ workspace,command }: { workspace: MentorshipWorkspace; command: Command }) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  const items = workspace.items ?? [];
  const enabled = workspace.state === "active";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return <section className={opportunitySettingsCard}>
    <h2 className="text-lg font-semibold">{t("objectives")} · {t("session")}</h2>
    {enabled && <div className="grid gap-2 sm:grid-cols-2">
      <ItemForm kind="objective" workspace={workspace} command={command} />
      <ItemForm kind="session" workspace={workspace} command={command} />
    </div>}
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      {items.filter(item => item.kind !== "progress").map(item => <article key={item.id + ":" + item.version}
        className="grid min-w-0 content-start gap-2 rounded-md border border-[var(--theme-border)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t(item.kind)}</h3><span className={opportunityTag}>{t(item.state)}</span></div>
        {item.accepted && <ItemContent content={item.accepted} locale={locale} />}
        {item.proposed && <ItemContent content={item.proposed} locale={locale} />}
        {enabled && <div className="flex flex-wrap gap-2">
          {(item.state==="proposed" && !item.mine ? ["agree_item","decline_item"] as const : []).map(action =>
            <button type="button" className={opportunitySecondary} key={action} disabled={command.busy}
              onClick={() => void command.send({ action,id:workspace.id,expectedVersion:workspace.version,item:item.id,itemVersion:item.version })}>
              {t(action === "agree_item" ? "agreeItem" : "decline")}
            </button>)}
          {((item.state==="agreed" && (item.kind!=="session" || !!(item.accepted && "startsAt" in item.accepted &&
            Date.parse(item.accepted.startsAt)+item.accepted.minutes*60000<=now))) ||
            (item.state==="completion_pending" && !item.mine)) &&
            <button type="button" className={opportunitySecondary} disabled={command.busy} onClick={() => void command.send({
              action:"complete_item",id:workspace.id,expectedVersion:workspace.version,item:item.id,itemVersion:item.version,
            })}>{t("complete")}</button>}
          {item.kind==="session" && (item.state==="agreed" || item.state==="proposed") &&
            <button type="button" className={opportunitySecondary} disabled={command.busy} onClick={() => void command.send({
              action:"cancel_item",id:workspace.id,expectedVersion:workspace.version,item:item.id,itemVersion:item.version,
            })}>{t("cancelItem")}</button>}
        </div>}
        {enabled && (item.state==="agreed" || item.state==="proposed") &&
          <ItemForm kind={item.kind} workspace={workspace} command={command} item={item} />}
        {item.kind === "objective" && <>
          {items.filter(progress => progress.objective === item.id && progress.accepted)
            .map(progress => <div key={progress.id} className="rounded-md bg-[var(--theme-control)] p-2 text-sm">
              <h4 className="font-semibold">{t("progress")}</h4><ItemContent content={progress.accepted!} locale={locale} />
            </div>)}
          {enabled && item.state==="agreed" &&
            <ItemForm kind="progress" workspace={workspace} command={command} objective={item.id} />}
        </>}
      </article>)}
    </div>
  </section>;
}
