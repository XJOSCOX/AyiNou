"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  communityNeedCategories, needPublicationReasons, type NeedPublication, type NeedPublicationContent,
  type NeedPublicationLane, type NeedPublicationPage, type NeedPublicationStaffAction, type PublishedNeed,
} from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { ApiRequestError } from "@/lib/api-errors";
import { publicationLabel } from "@/lib/community-need-publication-i18n";
import { needsMessages } from "@/lib/community-needs-i18n";
import { needReviewLabel } from "@/lib/community-needs-review-i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

const staffPath = "/api/v1/private/community-need-publications";
const memberPath = (id: string) => "/api/v1/me/community-needs/" + id + "/publication";
const directoryPath = (id: string) => "/api/v1/private/communities/" + id + "/needs";
const readOptions = (signal: AbortSignal) => ({ signal, cache: "no-store" as const });
const isUnavailable = (error: unknown) => error instanceof ApiRequestError && error.status === 404;

export function useNeedDirectory(room: string | null) {
  const load = useCallback((signal: AbortSignal): Promise<NeedPublicationPage<PublishedNeed> | null> =>
    room ? authorizedRequest(directoryPath(room), readOptions(signal)) : Promise.resolve(null), [room]);
  return useInstitutionResource(load);
}

function PublicationError({ error, retry }: { error: unknown; retry?: () => void }) {
  const [locale] = useLocale();
  const copy = needsMessages[locale];
  if (error == null) return null;
  const status = error instanceof ApiRequestError ? error.status : 0;
  return <div role="alert" className={institutionErrorBox}>
    <p>{status === 409 ? copy.stale : status === 403 ? copy.forbidden : status === 404 ? copy.missing : status === 400 ? copy.badInput : copy.failure}</p>
    {retry && <button type="button" className={institutionLink} onClick={retry}>{copy.reload}</button>}
  </div>;
}

function Snapshot({ content }: { content: NeedPublicationContent }) {
  const [locale] = useLocale();
  const copy = needsMessages[locale];
  return <div className="grid min-w-0 gap-3">
    <h3 dir="auto" className="break-words text-xl font-semibold">{content.title}</h3>
    <p dir="auto" className="whitespace-pre-wrap break-words leading-relaxed">{content.description}</p>
    <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-3">
      <div><dt className="font-semibold">{copy.category}</dt><dd>{copy[content.category]}</dd></div>
      {content.area && <div><dt className="font-semibold">{copy.area}</dt><dd dir="auto" className="break-words">{content.area}</dd></div>}
      <div><dt className="font-semibold">{copy.beneficiaries}</dt><dd dir="auto" className="break-words">{content.beneficiaries}</dd></div>
    </dl>
  </div>;
}

export function PublishedNeeds({ room, initialId, onDiscuss }: { room: string; initialId?: string; onDiscuss?: (id: string) => void }) {
  const [locale] = useLocale();
  const t = (key: string) => publicationLabel(locale,key);
  const copy = needsMessages[locale];
  const [category, setCategory] = useState("");
  const [selected, select] = useState(initialId ?? "");
  const [extra, setExtra] = useState<NeedPublicationPage<PublishedNeed> | null>(null);
  const [paging, setPaging] = useState(false);
  const [pageError, setPageError] = useState<unknown>(null);
  const filter = category ? "?category=" + category : "";
  const load = useCallback((signal: AbortSignal): Promise<NeedPublicationPage<PublishedNeed>> =>
    authorizedRequest(directoryPath(room) + filter, readOptions(signal)), [room, filter]);
  const detail = useCallback((signal: AbortSignal): Promise<PublishedNeed | null> =>
    selected ? authorizedRequest(directoryPath(room) + "/" + selected, readOptions(signal)) : Promise.resolve(null), [room, selected]);
  const list = useInstitutionResource(load);
  const item = useInstitutionResource(detail);
  const cursor = extra ? extra.nextCursor : list.data?.nextCursor;
  async function more() {
    if (!cursor || paging) return;
    setPageError(null);
    setPaging(true);
    try {
      const next: NeedPublicationPage<PublishedNeed> = await authorizedRequest(
        directoryPath(room) + filter + (filter ? "&" : "?") + "after=" + cursor, { cache: "no-store" });
      setExtra((current) => ({ ...next, items: [...(current?.items ?? []), ...next.items] }));
    } catch (cause) { setPageError(cause); } finally { setPaging(false); }
  }
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const entry = selected === item.data?.id ? item.data : null;
  return <section className={institutionCard + " grid min-w-0 gap-4"} aria-label={t("title")}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      {selected && <button className={institutionLink} type="button" onClick={() => select("")}>← {copy.back}</button>}
    </header>
    {selected ? <>
      <PublicationError error={item.error} retry={item.refresh} />
      {!entry && !item.error && <p role="status">{copy.loading}</p>}
      {entry && <article className="grid min-w-0 gap-4">
        <Snapshot content={entry.content} />
        <p><span className="font-semibold">{t("reviewed")}</span> · {t("meaning")}</p>
        <div className="grid min-w-0 gap-2 text-sm sm:grid-cols-2">
          <p>{t("publishedAt")} · <time dateTime={entry.publishedAt}>{date.format(new Date(entry.publishedAt))}</time></p>
          <p>{entry.attribution ? <Link href={"/members/" + encodeURIComponent(entry.attribution.username)}
            className={institutionLink}>{entry.attribution.displayName}</Link> : t("anonymous")}</p>
          <p className="break-all">{t("reference")} · <span className="font-mono">{entry.id}</span></p>
        </div>
        {onDiscuss && <div className="grid gap-2 justify-items-start">
          <button type="button" className={institutionAction} onClick={() => onDiscuss(entry.id)}>{t("discuss")}</button>
          <p className="text-sm">{t("discussHelp")}</p>
        </div>}
      </article>}
    </> : <>
      <label className="max-w-xs">{copy.category}<select className={institutionField} value={category}
        onChange={(event) => { setCategory(event.target.value); setExtra(null); setPageError(null); }}>
        <option value="">{t("all")}</option>
        {communityNeedCategories.map((entry) => <option key={entry} value={entry}>{copy[entry]}</option>)}
      </select></label>
      <PublicationError error={list.error ?? pageError} retry={list.refresh} />
      {!list.data && !list.error && <p role="status">{copy.loading}</p>}
      {list.data?.items.length === 0 && <p>{t("empty")}</p>}
      <ul className="grid min-w-0 gap-2">{[...(list.data?.items ?? []), ...(extra?.items ?? [])].map((row) =>
        <li key={row.id}>
          <button type="button" onClick={() => select(row.id)} className={institutionCard + " grid w-full min-w-0 gap-1 text-start hover:bg-[var(--theme-control)]"}>
            <span dir="auto" className="break-words font-semibold">{row.content.title}</span>
            <span className="text-sm">{copy[row.content.category]} · {date.format(new Date(row.publishedAt))} · {t("reviewed")}</span>
          </button>
        </li>)}</ul>
      {cursor && <button className={institutionLink} disabled={paging} onClick={more}>{copy.more}</button>}
    </>}
  </section>;
}

function PublicationCommand({ label, confirmedLabel, submit, fields, children }: {
  label: string; confirmedLabel: string; submit: (data: object) => Promise<unknown>;
  fields: (form: FormData) => object; children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const receipt = useRef<{ body: string; id: string } | null>(null);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    if (!form.has("confirm")) return;
    const command = fields(form);
    const body = JSON.stringify(command);
    if (receipt.current?.body !== body) receipt.current = { body, id: crypto.randomUUID() };
    setError(null);
    setBusy(true);
    try {
      await submit({ ...command, confirmed: true, requestId: receipt.current.id });
      receipt.current = null;
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  }
  return <form onSubmit={send} className="mt-3 grid min-w-0 gap-3">
    <fieldset disabled={busy} className="grid min-w-0 gap-3">
      {children}
      <label className="flex items-start gap-2"><input required name="confirm" type="checkbox" className="mt-1" />{confirmedLabel}</label>
      <button type="submit" className={institutionAction + " justify-self-start"}>{label}</button>
    </fieldset>
    <PublicationError error={error} />
  </form>;
}

function PublicationHistory({ data }: { data: NeedPublication }) {
  const [locale] = useLocale();
  const t = (key: string) => publicationLabel(locale,key);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  if (!data.history?.length) return null;
  return <details><summary className="cursor-pointer font-semibold">{t("history")}</summary>
    <ul className="mt-2 grid gap-3">{data.history.map((record, i) => <li key={record.at + i} className="break-words">
      {t(record.action)} · <time dateTime={record.at}>{date.format(new Date(record.at))}</time>
      {record.code && <p>{t(record.code)}</p>}
      {record.reason && <p className="whitespace-pre-wrap">{record.reason}</p>}
    </li>)}</ul>
  </details>;
}

export function MemberPublication({ needId }: { needId: string }) {
  const [locale] = useLocale();
  const t = (key: string) => publicationLabel(locale,key);
  const copy = needsMessages[locale];
  const load = useCallback((signal: AbortSignal): Promise<NeedPublication> =>
    authorizedRequest(memberPath(needId), readOptions(signal)), [needId]);
  const resource = useInstitutionResource(load);
  const [updated, setUpdated] = useState<NeedPublication | null>(null);
  const data = updated ?? resource.data;
  if (!data) return resource.error && !isUnavailable(resource.error) ? <PublicationError error={resource.error} retry={resource.refresh} /> : null;
  if (!data.canRequest && !data.id) return null;
  const confirmation = needReviewLabel(locale,"confirm");
  const snapshot = data.snapshot?.content;
  const latestFeedback = data.history?.find((record) => record.code)?.code;
  const submit = async (command: object) => setUpdated(await authorizedRequest(memberPath(needId), {
    method: "PATCH", body: JSON.stringify({ ...command, expectedRevision: data.revision }),
  }));
  return <section className={institutionCard + " grid min-w-0 gap-4"}>
    <h2 className="text-xl font-semibold">{t("heading")}</h2>
    <p role="status">{t(data.state)} {data.published && data.state !== "published" && " · " + t("published")}</p>
    {latestFeedback && ["rejected","changes_requested","challenged"].includes(data.state) && <p>{t(latestFeedback)}</p>}
    {snapshot && <Snapshot content={snapshot} />}
    {data.canRequest && !["pending","challenged"].includes(data.state) && <details key={"request:" + data.revision}>
      <summary className="cursor-pointer font-semibold">{t(data.id ? "revise" : "request")}</summary>
      <p className="mt-2">{t("privacyWarning")}</p>
      <PublicationCommand label={t("request")} confirmedLabel={t("audience")} submit={submit} fields={(form) => ({
        action: "request", audience: "community", attribution: form.has("attribution"), finding: data.finding,
        expectedEvidenceRevision: data.evidenceRevision,
        content: { title: form.get("title"), description: form.get("description"), category: form.get("category"),
          area: form.get("area") || null, beneficiaries: form.get("beneficiaries") },
      })}>
        <label>{copy.needTitle}<input required minLength={5} maxLength={100} name="title" defaultValue={snapshot?.title} className={institutionField} /></label>
        <label>{copy.problem}<textarea required minLength={20} maxLength={1200} name="description" rows={4} defaultValue={snapshot?.description} className={institutionField} /></label>
        <label>{copy.category}<select name="category" defaultValue={snapshot?.category ?? "other"} className={institutionField}>
          {communityNeedCategories.map((key) => <option key={key} value={key}>{copy[key]}</option>)}
        </select></label>
        <label>{copy.area}<input maxLength={60} name="area" defaultValue={snapshot?.area ?? ""} className={institutionField} /></label>
        <label>{copy.beneficiaries}<input required minLength={3} maxLength={200} name="beneficiaries" defaultValue={snapshot?.beneficiaries} className={institutionField} /></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="attribution" className="mt-1" />{t("attribution")}</label>
      </PublicationCommand>
    </details>}
    {data.deadline && <details key={"challenge:" + data.revision}>
      <summary className="cursor-pointer font-semibold">{t("challenge")}</summary>
      <p>{t("deadline")} · {new Intl.DateTimeFormat(locale,{ dateStyle:"medium", timeStyle:"short" }).format(new Date(data.deadline))}</p>
      <PublicationCommand label={t("challenge")} confirmedLabel={confirmation} submit={submit}
        fields={(form) => ({ action: "challenge", note: form.get("note") })}>
        <label>{t("note")}<textarea name="note" required minLength={5} maxLength={1500} className={institutionField} /></label>
      </PublicationCommand>
    </details>}
    {data.id && !["withdrawn","removed","stale"].includes(data.state) &&
      (["withdraw", ...(data.published || data.snapshot?.attribution ? ["revoke_attribution"] : [])] as const).map((action) =>
        <details key={action + data.revision}>
          <summary className="cursor-pointer font-semibold">{t(action)}</summary>
          <PublicationCommand label={t(action)} confirmedLabel={confirmation} submit={submit} fields={() => ({ action })} />
        </details>)}
    <PublicationHistory data={data} />
  </section>;
}

function staffActions(data: NeedPublication, lane: NeedPublicationLane): NeedPublicationStaffAction[] {
  if (lane === "review") return data.state === "challenged" ? ["uphold","return"]
    : data.state === "pending" ? ["approve","request_correction","reject"] : [];
  const actions: NeedPublicationStaffAction[] = [];
  if (lane === "admin" && data.state === "pending") actions.push("assign");
  if (lane === "admin" && data.state === "challenged") actions.push("assign_challenge");
  if (data.published) actions.push("hide");
  if (lane === "admin" && data.published) actions.push("remove");
  return actions;
}

export function StaffPublication({ workspace, lane }: { workspace: string; lane: NeedPublicationLane }) {
  const [locale] = useLocale();
  const t = (key: string) => publicationLabel(locale,key);
  const copy = needsMessages[locale];
  const [selected, select] = useState("");
  const [after, setAfter] = useState("");
  const [action, setAction] = useState<NeedPublicationStaffAction | "">("");
  const query = "?lane=" + lane;
  const load = useCallback((signal: AbortSignal): Promise<NeedPublicationPage<NeedPublication>> =>
    authorizedRequest(staffPath + "?lane=" + lane + (after ? "&after=" + after : ""),
      { ...readOptions(signal), headers: { "X-Ayinou-Workspace": workspace } }), [lane, after, workspace]);
  const detail = useCallback((signal: AbortSignal): Promise<NeedPublication | null> =>
    selected ? authorizedRequest(staffPath + "/" + selected + query,
      { ...readOptions(signal), headers: { "X-Ayinou-Workspace": workspace } }) : Promise.resolve(null), [query, selected, workspace]);
  const queue = useInstitutionResource(load);
  const item = useInstitutionResource(detail);
  if (!queue.data) return queue.error && !isUnavailable(queue.error) ? <PublicationError error={queue.error} retry={queue.refresh} /> : null;
  const data = item.data;
  const actions = data ? staffActions(data,lane) : [];
  const current = actions.find((key) => key === action) ?? actions[0];
  async function submit(command: object) {
    await authorizedRequest(staffPath + "/" + selected + query, {
      method: "PATCH", headers: { "X-Ayinou-Workspace": workspace }, body: JSON.stringify({ ...command, expectedRevision: data?.revision }),
    });
    select("");
    setAction("");
    queue.refresh();
  }
  return <section className={institutionCard + " grid min-w-0 gap-4"}>
    <h2 className="text-xl font-semibold">{t("staff")}</h2>
    {!selected ? <>
      {!queue.data.items.length && <p>{t("noQueue")}</p>}
      <ul className="grid min-w-0 gap-2">{queue.data.items.map((row) => <li key={row.id}>
        <button type="button" className={institutionLink + " break-all text-start"} onClick={() => select(row.id ?? "")}>
          {row.snapshot?.content.title ?? row.id} · {t(row.state)}
        </button>
      </li>)}</ul>
      {after && <button className={institutionLink} onClick={() => setAfter("")}>← {copy.back}</button>}
      {queue.data.nextCursor && <button className={institutionLink} onClick={() => setAfter(queue.data?.nextCursor ?? "")}>{copy.more}</button>}
    </> : <>
      <button type="button" className={institutionLink + " justify-self-start"} onClick={() => { select(""); setAction(""); }}>← {copy.back}</button>
      <PublicationError error={item.error} retry={item.refresh} />
      {!data && !item.error && <p role="status">{copy.loading}</p>}
      {data?.snapshot && <><Snapshot content={data.snapshot.content} /><p>{t("membersAudience")} · {t(data.snapshot.attribution ? "attribution" : "anonymous")}</p></>}
      {data && <PublicationHistory data={data} />}
      {current && <><label>{t("action")}<select className={institutionField} value={current}
        onChange={(event) => setAction(event.target.value as NeedPublicationStaffAction)}>
        {actions.map((key) => <option key={key} value={key}>{t(key)}</option>)}
      </select></label>
        <PublicationCommand key={current + data?.revision} label={t(current)} confirmedLabel={needReviewLabel(locale,"confirm")} submit={submit}
          fields={(form) => ({ action: current, note: form.get("note"), target: form.get("target") ?? undefined, reason: form.get("reason") ?? undefined })}>
          {current.startsWith("assign") && <label>{t("reviewer")}<input required name="target" className={institutionField} /></label>}
          {["reject","request_correction"].includes(current) && <label>{t("feedback")}<select name="reason" className={institutionField}>
            {needPublicationReasons.map((key) => <option key={key} value={key}>{t(key)}</option>)}
          </select></label>}
          <label>{t("note")}<textarea required name="note" minLength={5} maxLength={1500} className={institutionField} /></label>
        </PublicationCommand>
      </>}
    </>}
  </section>;
}
