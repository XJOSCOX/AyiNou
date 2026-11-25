"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { needClarifications, needFindingSummaries, type NeedReviewAction, type NeedReviewCase, type NeedReviewLane, type NeedReviewQueue } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { ApiRequestError } from "@/lib/api-errors";
import { needReviewLabel } from "@/lib/community-needs-review-i18n";
import { needsMessages } from "@/lib/community-needs-i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

const staffPath = "/api/v1/private/community-needs-review";
export const memberNeedReviewPath = (id: string) => "/api/v1/me/community-needs/" + id + "/review";
const stateActions = {
  admin: ["assign_triage", "assign_review", "flag_conflict"],
  triage: ["triage", "request_information", "flag_unsafe", "duplicate", "refer", "escalate", "declare_conflict"],
  review: ["observe", "request_information", "duplicate", "supported", "insufficient_evidence", "not_supported", "return", "close", "declare_conflict"],
} as const;
const targetActions = ["grant", "revoke", "assign_triage", "assign_review", "assign_challenge", "flag_conflict", "duplicate"];

function options(row: NeedReviewCase, lane: NeedReviewLane): readonly NeedReviewAction[] {
  if (row.challenge?.status === "pending") {
    if (lane === "admin") return ["assign_challenge", "flag_conflict"];
    if (lane === "triage") return [];
    return row.challenge.accepted ? ["observe", "uphold_challenge", "return_challenge", "declare_conflict"] : ["accept", "declare_conflict"];
  }
  if (lane === "admin") {
    if (row.state !== "submitted" && row.state !== "under_review") return [];
    return row.referred ? ["assign_review", "flag_conflict"] : stateActions.admin.filter((action) => action !== "assign_review");
  }
  if (lane === "triage") return row.state === "submitted" && !row.reviewer ? stateActions.triage : [];
  if (row.state === "submitted" && !row.accepted) return ["accept", "declare_conflict"];
  return row.state === "under_review" && row.accepted ? stateActions.review : [];
}

function RequestError({ error }: { error: unknown }) {
  const [locale] = useLocale();
  const copy = needsMessages[locale];
  if (error == null) return null;
  const status = error instanceof ApiRequestError ? error.status : 0;
  return <p role="alert" className={institutionErrorBox}>
    {status === 409 ? copy.stale : status === 403 ? copy.forbidden : status === 400 ? copy.badInput : copy.failure}
  </p>;
}

function CommandForm({ actions, submit, communities }: {
  actions: readonly NeedReviewAction[];
  submit: (command: Record<string, unknown>) => Promise<void>;
  communities?: NeedReviewQueue["communities"];
}) {
  const [locale] = useLocale();
  const t = (key: string) => needReviewLabel(locale,key);
  const [selection, choose] = useState<NeedReviewAction | "">("");
  const action = actions.find((key) => key === selection) ?? actions[0];
  const [confirmed, confirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const receipt = useRef<{ body: string; request: string } | null>(null);
  if (!action) return null;
  const summaries = action === "request_information" ? needClarifications
    : action === "supported" || action === "insufficient_evidence" || action === "not_supported"
      ? needFindingSummaries[action] : [];
  const needsTarget = targetActions.includes(action);
  const needsNote = action !== "accept";
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !confirmed) return;
    const values = new FormData(event.currentTarget);
    const command = {
      action, confirmed: true,
      ...(needsNote ? { note: values.get("note") } : { conflictFree: values.get("conflictFree") === "on" }),
      ...(needsTarget ? { target: values.get("target") } : {}),
      ...(summaries.length ? { summary: values.get("summary") } : {}),
      ...(communities ? { communityId: values.get("communityId"), role: values.get("role") } : {}),
    };
    const body = JSON.stringify(command);
    if (receipt.current?.body !== body) receipt.current = { body, request: crypto.randomUUID() };
    setBusy(true); setError(null);
    try {
      await submit({ ...command, requestId: receipt.current.request });
      receipt.current = null;
      confirm(false);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return <form className="grid gap-3" onSubmit={send} onChange={() => confirm(false)}>
    <fieldset disabled={busy} className="grid min-w-0 gap-3">
      <label>{t("action")}<select className={institutionField} value={action} onChange={(e) => choose(e.target.value as NeedReviewAction)}>
        {actions.map((key) => <option key={key} value={key}>{t(key)}</option>)}
      </select></label>
      {communities && <>
        <label>{needsMessages[locale].community}<select name="communityId" required className={institutionField}>
          {communities.map((c) => <option value={c.id} key={c.id}>{c.slug}</option>)}
        </select></label>
        <label>{t("role")}<select name="role" className={institutionField}>
          <option value="triage">{t("triageRole")}</option><option value="review">{t("reviewRole")}</option>
        </select></label>
      </>}
      {needsTarget && <label>{t("target")}<input name="target" required className={institutionField} /></label>}
      {!!summaries.length && <label>{t(action)}<select name="summary" className={institutionField}>
        {summaries.map((key) => <option key={key} value={key}>{t(key)}</option>)}
      </select></label>}
      {needsNote ? <label>{t("note")}<textarea name="note" minLength={5} maxLength={1500} required className={institutionField} />
        <span className="text-sm text-[var(--theme-body)]">{t("noteHelp")}</span>
      </label> : <label className="flex items-start gap-2">
        <input type="checkbox" name="conflictFree" required />{t("conflictFree")}
      </label>}
      {action === "supported" && <p>{t("supportedHelp")}</p>}
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed}
        onChange={(e) => { e.stopPropagation(); confirm(e.target.checked); }} />{t("confirm")}</label>
      <button type="submit" disabled={!confirmed} className={institutionAction + " justify-self-start"}>{t(action)}</button>
    </fieldset>
    <RequestError error={error} />
  </form>;
}

function ReviewHistory({ data }: { data: NeedReviewCase }) {
  const [locale] = useLocale();
  const t = (key: string) => needReviewLabel(locale,key);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <details className="grid gap-2">
    <summary className="cursor-pointer font-semibold">{t("history")}</summary>
    <ol className="mt-2 grid gap-2 text-sm">
      {data.history.map((entry, index) => <li key={entry.at + entry.action + index} className="break-words">
        <time dateTime={entry.at}>{date.format(new Date(entry.at))}</time> · {t(entry.action)}
        {entry.summary && entry.summary !== entry.action && <p>{t(entry.summary)}</p>}
        {entry.note && <p className="whitespace-pre-wrap">{entry.note}</p>}
      </li>)}
    </ol>
  </details>;
}

export function MemberReviewStatus({ data, onUpdate }: { data: NeedReviewCase; onUpdate: (next: NeedReviewCase) => void }) {
  const [locale] = useLocale();
  const t = (key: string) => needReviewLabel(locale,key);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const [now] = useState(() => Date.now());
  const deadline = data.challengeUntil ? new Date(data.challengeUntil) : null;
  const clarification = data.state === "needs_information" ? data.history.find((entry) => entry.action === "request_information")?.summary : null;
  return <section className="grid gap-2">
    <h3 className="font-semibold">{t("reviewStatus")}</h3>
    <p role="status">{t(data.state)}</p>
    {clarification && <p>{t(clarification)}</p>}
    {data.state === "supported" && <p>{t("supportedHelp")}</p>}
    {data.challenge && <p>{t(data.challenge.status)}</p>}
    {deadline && data.findingId && <div className="grid gap-2">
      <p>{t("challengeUntil")} · <time dateTime={data.challengeUntil!}>{date.format(deadline)}</time></p>
      {deadline.getTime() > now && <details>
        <summary className="cursor-pointer font-semibold">{t("challenge")}</summary>
        <CommandForm actions={["challenge"]} submit={async (input) => {
          onUpdate(await authorizedRequest(memberNeedReviewPath(data.id), { method: "PATCH",
            body: JSON.stringify({ ...input, findingId: data.findingId, expectedRevision: data.revision }) }));
        }} />
      </details>}
    </div>}
    <ReviewHistory data={data} />
  </section>;
}

export function StaffNeeds({ workspace, lane }: { workspace: string; lane: NeedReviewLane }) {
  const [locale] = useLocale();
  const t = (key: string) => needReviewLabel(locale,key);
  const [selected, select] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [updated, setUpdated] = useState<NeedReviewCase | null>(null);
  const get = useCallback((signal: AbortSignal): Promise<NeedReviewQueue> =>
    authorizedRequest(staffPath + "?lane=" + lane + (cursor ? "&after=" + cursor : ""), {
      signal, headers: { "X-Ayinou-Workspace": workspace },
    }), [workspace,lane,cursor]);
  const queue = useInstitutionResource(get);
  const detail = useCallback((signal: AbortSignal): Promise<NeedReviewCase | null> => selected
    ? authorizedRequest(staffPath + "/" + selected + "?lane=" + lane, { signal, headers: { "X-Ayinou-Workspace": workspace } })
    : Promise.resolve(null), [selected,lane,workspace]);
  const caseResource = useInstitutionResource(detail);
  const current = (updated?.id === selected ? updated : null) ?? (caseResource.data?.id === selected ? caseResource.data : null);
  if (!queue.data) return queue.error ? <>{!(queue.error instanceof ApiRequestError && queue.error.status === 404) && <RequestError error={queue.error} />}</> : null;

  async function change(path: string, method: string, body: object) {
    return authorizedRequest(path, { method, headers: { "X-Ayinou-Workspace": workspace }, body: JSON.stringify(body) });
  }
  return <section className={institutionCard + " grid gap-4"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-semibold">{t(lane === "triage" ? "triageQueue" : "queue")}</h2>
      <button type="button" className={institutionLink} onClick={() => { queue.refresh(); setUpdated(null); caseResource.refresh(); }}>{t("refresh")}</button>
    </div>
    {queue.data.canGrant && <details>
      <summary className="cursor-pointer font-semibold">{t("grant")}</summary>
      <CommandForm actions={["grant","revoke"]} communities={queue.data.communities} submit={async (input) => {
        await change(staffPath,"POST",input); queue.refresh();
      }} />
    </details>}
    <ul className="grid gap-2">{queue.data.cases.map((row) => <li key={row.id}>
      <button className={institutionLink + " break-all text-start"} type="button" aria-pressed={row.id === selected}
        onClick={() => { setUpdated(null); select(row.id); }}>{row.id} · {t(row.state)}</button>
    </li>)}</ul>
    {!queue.data.cases.length && <p>{t("empty")}</p>}
    {(cursor || queue.data.nextCursor) && <div className="flex gap-3">
      {cursor && <button type="button" className={institutionLink} onClick={() => setCursor(null)}>{needsMessages[locale].back}</button>}
      {queue.data.nextCursor && <button type="button" className={institutionLink} onClick={() => setCursor(queue.data!.nextCursor)}>{needsMessages[locale].more}</button>}
    </div>}
    {selected && <RequestError error={caseResource.error} />}
    {current && <article key={current.id + ":" + current.revision} className="grid min-w-0 gap-4 border-t border-[var(--theme-border)] pt-4">
      <h3 className="break-all font-semibold">{current.id} · {t(current.state)}</h3>
      {current.referred && <p>{t("refer")}</p>}{current.escalated && <p>{t("escalate")}</p>}{current.unsafe && <p>{t("flag_unsafe")}</p>}
      {current.challenge && <p>{t(current.challenge.status)}</p>}
      {!!current.versions?.length && <details>
        <summary className="cursor-pointer font-semibold">{t("evidence")}</summary>
        {current.versions.map((entry) => <div className="mt-3 grid gap-1 break-words rounded border border-[var(--theme-border)] p-3" key={entry.revision}>
          <h4 className="font-semibold">{entry.content.title} · v{entry.revision}</h4>
          <p>{needsMessages[locale][entry.content.category]}{entry.content.area && " · " + entry.content.area}</p>
          <p className="whitespace-pre-wrap">{entry.content.description}</p>
          <p>{entry.content.beneficiaries}</p>
          {entry.content.references.map((reference) => <p className="break-all" key={reference.url}>{reference.url} · {reference.description}</p>)}
        </div>)}
      </details>}
      <ReviewHistory data={current} />
      <CommandForm actions={options(current,lane)} submit={async (input) => {
        const next = await change(staffPath + "/" + current.id + "?lane=" + lane,"PATCH",{ ...input, expectedRevision: current.revision });
        setUpdated(next); queue.refresh();
      }} />
    </article>}
  </section>;
}
