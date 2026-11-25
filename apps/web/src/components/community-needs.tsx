"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { communityNeedCategories, type CommunityNeed, type CommunityNeedContent, type CommunityNeedList } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { ApiRequestError } from "@/lib/api-errors";
import { needsMessages } from "@/lib/community-needs-i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

const api = "/api/v1/me/community-needs";
const home = "/communities/intake/needs";
const quietButton = "inline-flex min-h-10 items-center rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] disabled:opacity-60";
const emptyContent: CommunityNeedContent = {
  title: "", description: "", category: "other", area: null, beneficiaries: "", references: [],
};

function message(error: unknown, copy: (typeof needsMessages)["en"]) {
  if (error instanceof ApiRequestError) {
    if (error.code === "COMMUNITY_NEEDS_DISABLED") return copy.closed;
    if (error.status === 400) return copy.badInput;
    if (error.status === 401 || error.status === 403) return copy.forbidden;
    if (error.status === 409) return copy.stale;
    if (error.status === 429) return copy.quota;
    if (error.status === 404) return copy.missing;
  }
  return copy.failure;
}

export function CommunityNeeds({ id, creating = false, initialCommunity }: { id?: string; creating?: boolean; initialCommunity?: string }) {
  const [locale] = useLocale();
  const copy = needsMessages[locale];
  const [extra, setExtra] = useState<CommunityNeedList | null>(null);
  const [paging, setPaging] = useState(false);
  const [pageError, setPageError] = useState<unknown>(null);
  const load = useCallback(async (signal: AbortSignal): Promise<{ item: CommunityNeed } | { list: CommunityNeedList }> =>
    id ? { item: await authorizedRequest(api + "/" + encodeURIComponent(id), { signal, cache: "no-store" }) }
      : { list: await authorizedRequest(api, { signal, cache: "no-store" }) }, [id]);
  const { data, error, refresh } = useInstitutionResource(load);
  const list = data && "list" in data ? data.list : null;
  const item = data && "item" in data ? data.item : null;
  const communities = list?.communities ?? [];
  const selected = communities.find((community) => community.slug === initialCommunity)?.id;
  const cursor = extra ? extra.nextCursor : list?.nextCursor;
  async function more() {
    if (!cursor || paging) return;
    setPaging(true);
    setPageError(null);
    try {
      const next: CommunityNeedList = await authorizedRequest(api + "?cursor=" + encodeURIComponent(cursor), { cache: "no-store" });
      setExtra((previous) => ({ ...next, needs: [...(previous?.needs ?? []), ...next.needs] }));
    } catch (cause) {
      setPageError(cause);
    } finally {
      setPaging(false);
    }
  }

  return <div className="grid min-w-0 gap-4">
    <header className={institutionCard + " flex flex-wrap items-start justify-between gap-3"}>
      <h1 className="text-3xl font-bold">{creating ? copy.newNeed : copy.title}</h1>
      <div className="flex flex-wrap gap-2">
        <Link href={id || creating ? home : "/communities"} className={quietButton}>← {copy.back}</Link>
        {!creating && !id && !!communities.length && <Link href={home + "/new"} className={institutionAction}>{copy.newNeed}</Link>}
      </div>
    </header>
    {error != null && <p role="alert" className={institutionErrorBox}>{message(error, copy)}</p>}
    {!data && error == null && <p role="status">{copy.loading}</p>}
    {creating && list && (!communities.length ? <p className={institutionCard}>{copy.noMemberships}</p>
      : <NeedEditor communities={communities} initialCommunity={selected} />)}
    {item && <NeedEditor key={item.id + ":" + item.revision} item={item} onRefresh={refresh} />}
    {!creating && !id && list && <section className={institutionCard}>
      {!list.needs.length && <p>{communities.length ? copy.empty : copy.noMemberships}</p>}
      <ul className="grid gap-2">{[...list.needs, ...(extra?.needs ?? [])].map((need) =>
        <li key={need.id}>
          <Link href={home + "/" + need.id} className={quietButton + " flex w-full flex-wrap justify-between gap-2"}>
            <span className="break-words">{need.title}</span><span>{copy[need.status]}</span>
          </Link>
        </li>)}</ul>
      {pageError != null && <p role="alert" className={institutionErrorBox + " mt-3"}>{message(pageError, copy)}</p>}
      {cursor && <button type="button" onClick={more} disabled={paging} className={quietButton + " mt-3"}>{copy.more}</button>}
    </section>}
  </div>;
}

function NeedEditor({ item, communities = [], initialCommunity, onRefresh }: {
  item?: CommunityNeed; communities?: CommunityNeedList["communities"]; initialCommunity?: string; onRefresh?: () => void;
}) {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = needsMessages[locale];
  const [record, setRecord] = useState(item);
  const [content, setContent] = useState(item?.content ?? emptyContent);
  const [community, setCommunity] = useState(initialCommunity ?? communities[0]?.id ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const receipt = useRef<{ body: string; key: string } | null>(null);
  const draft = !record || record.status === "draft";
  const dirty = !!record && JSON.stringify(content) !== JSON.stringify(record.content);
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const set = <Key extends keyof CommunityNeedContent>(key: Key, value: CommunityNeedContent[Key]) => {
    setContent((previous) => ({ ...previous, [key]: value }));
    setConfirmed(false);
    setSaved(false);
  };

  async function mutate(action: "save" | "submit" | "withdraw") {
    if (busy || (action !== "save" && (!confirmed || dirty))) return;
    const body = JSON.stringify(!record ? { communityId: community, content } :
      action === "save" ? { action: "edit", expectedRevision: record.revision, content } :
        { action, expectedRevision: record.revision, confirmed });
    if (receipt.current?.body !== body) receipt.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next: CommunityNeed = await authorizedRequest(record ? api + "/" + record.id : api, {
        method: record ? "PATCH" : "POST", cache: "no-store", body,
        headers: { "Idempotency-Key": receipt.current.key },
      });
      if (!record) {
        router.replace(home + "/" + next.id);
        return;
      }
      receipt.current = null;
      setRecord(next);
      setContent(next.content);
      setConfirmed(false);
      setSaved(action === "save");
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate("save");
  }

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
    <section className={institutionCard + " grid content-start gap-4"}>
      {record && <>
        <h2 className="break-words text-2xl font-bold">{record.title}</h2>
        <p className="text-sm text-[var(--theme-body)]">{copy[record.status]} · {copy.community} · {record.communitySlug}</p>
      </>}
      {draft ? <form onSubmit={save} className="grid gap-4">
        <p className="text-sm text-[var(--theme-body)]">{copy.privacy}</p>
        <fieldset disabled={busy} className="grid min-w-0 gap-4">
          {!record && <label>{copy.community}
            <select className={institutionField} value={community} onChange={(event) => setCommunity(event.target.value)}>
              {communities.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>}
          <label>{copy.needTitle}<input required maxLength={100} className={institutionField} value={content.title} onChange={(event) => set("title", event.target.value)} /></label>
          <label>{copy.problem}<textarea rows={5} maxLength={3000} className={institutionField} value={content.description} onChange={(event) => set("description", event.target.value)} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>{copy.category}<select className={institutionField} value={content.category}
              onChange={(event) => set("category", event.target.value as CommunityNeedContent["category"])}>
              {communityNeedCategories.map((category) => <option key={category} value={category}>{copy[category]}</option>)}
            </select></label>
            <label>{copy.area}<input maxLength={60} className={institutionField} value={content.area ?? ""} onChange={(event) => set("area", event.target.value || null)} /></label>
          </div>
          <label>{copy.beneficiaries}<input maxLength={200} className={institutionField} value={content.beneficiaries} onChange={(event) => set("beneficiaries", event.target.value)} /></label>
          <fieldset className="grid min-w-0 gap-3">
            <legend className="mb-2 font-semibold">{copy.references}</legend>
            {content.references.map((reference, index) => <div key={index} className="grid gap-2 rounded-md border border-[var(--theme-border)] p-3">
              <label>{copy.url}<input required type="url" maxLength={500} className={institutionField} value={reference.url}
                onChange={(event) => set("references", content.references.map((entry, position) => position === index ? { ...entry, url: event.target.value } : entry))} /></label>
              <label>{copy.refDescription}<input maxLength={160} className={institutionField} value={reference.description}
                onChange={(event) => set("references", content.references.map((entry, position) => position === index ? { ...entry, description: event.target.value } : entry))} /></label>
              <button type="button" className={quietButton + " justify-self-start"} onClick={() => set("references", content.references.filter((_, position) => position !== index))}>{copy.remove}</button>
            </div>)}
            {content.references.length < 4 && <button type="button" className={quietButton + " justify-self-start"}
              onClick={() => set("references", [...content.references, { url: "", description: "" }])}>{copy.add}</button>}
          </fieldset>
          <button className={institutionAction + " justify-self-start"} disabled={!!record && !dirty}>{copy.save}</button>
        </fieldset>
      </form> : <>
        <h3 className="font-semibold">{copy.problem}</h3>
        <p className="whitespace-pre-wrap break-words">{content.description}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="font-semibold">{copy.category}</dt><dd>{copy[content.category]}</dd></div>
          <div><dt className="font-semibold">{copy.beneficiaries}</dt><dd className="break-words">{content.beneficiaries}</dd></div>
          {content.area && <div><dt className="font-semibold">{copy.area}</dt><dd>{content.area}</dd></div>}
        </dl>
        {!!content.references.length && <div><h3 className="font-semibold">{copy.references}</h3>
          <ul className="mt-2 grid gap-2">{content.references.map((reference) => <li key={reference.url} className="break-all">
            <span>{reference.url}</span>{reference.description && <p>{reference.description}</p>}
          </li>)}</ul>
        </div>}
      </>}
      {error != null && <div role="alert" className={institutionErrorBox}>{message(error, copy)}
        {error instanceof ApiRequestError && error.status === 409 && onRefresh && <button className={institutionLink + " ml-2"} onClick={onRefresh}>{copy.reload}</button>}
      </div>}
      {saved && <p role="status">{copy.saved}</p>}
    </section>
    {record && <aside className={institutionCard + " grid content-start gap-4"}>
      <div><p className="text-sm font-semibold">{copy.ref}</p><p className="break-all font-mono text-xs">{record.id}</p></div>
      {record.status !== "draft" && <p className="text-sm text-[var(--theme-body)]">{copy.unreviewed}</p>}
      {record.status !== "withdrawn" && <div className="grid gap-3 border-y border-[var(--theme-border)] py-4">
        <label className="flex items-start gap-2 text-sm">
          <input className="mt-0.5 size-4 shrink-0" type="checkbox" checked={confirmed} disabled={busy || dirty}
            onChange={(event) => setConfirmed(event.target.checked)} />{draft ? copy.confirmation : copy.withdrawConfirm}
        </label>
        <button className={draft ? institutionAction : quietButton} type="button" disabled={!confirmed || busy || dirty}
          onClick={() => void mutate(draft ? "submit" : "withdraw")}>{draft ? copy.submit : copy.withdraw}</button>
      </div>}
      <details><summary className="cursor-pointer font-semibold">{copy.history}</summary>
        <ol className="mt-3 grid gap-2 text-sm">{record.history.map((entry) =>
          <li key={entry.revision}>v{entry.revision} · {copy[entry.status]} · <time dateTime={entry.occurredAt}>{dates.format(new Date(entry.occurredAt))}</time></li>)}</ol>
      </details>
    </aside>}
  </div>;
}
