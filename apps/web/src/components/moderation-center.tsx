"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import {
  moderationDomains, moderationHistoryActions, moderationStatuses,
  type ModerationCenterMetrics, type ModerationCenterPage, type ModerationCenterView, type ModerationSummary,
} from "@ayinou/shared";
import { adminMessages } from "@/lib/admin-i18n";
import type { AdminTab } from "@/lib/admin-navigation";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { moderationCenterMessages } from "@/lib/moderation-center-i18n";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { AppealReviewQueue } from "./moderation-appeals";

const metrics: (keyof ModerationCenterMetrics)[] = ["pendingReports", "hiddenContent", "removedContent",
  "restrictedAccounts", "pendingAppeals", "recentDecisions", "eventReports", "projectReports"];
type Navigate = (section: AdminTab, account?: string) => void;
const dateSpan = 24 * 60 * 60 * 1000;

function loadCenter(workspace: string, view: ModerationCenterView, signal: AbortSignal, filters = "", cursor?: string | null): Promise<ModerationCenterPage> {
  const query = new URLSearchParams(filters);
  query.set("view", view);
  if (cursor) query.set("cursor", cursor);
  return authorizedRequest("/api/v1/admin/moderation-center?" + query, {
    signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace },
  });
}

function ToolLinks({ onNavigate }: { onNavigate: Navigate }) {
  const [locale] = useLocale();
  const t = moderationCenterMessages[locale];
  return <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
    <Link className={institutionLink} href="/feed/moderation">{t.feedTool}</Link>
    <Link className={institutionLink} href="/events/moderation">{t.eventTool}</Link>
    <Link className={institutionLink} href="/projects/review">{t.projectTool}</Link>
    <button className={institutionLink} type="button" onClick={() => onNavigate("trust")}>{t.trustTool}</button>
  </div>;
}

export function ModerationOverview({ workspace, onNavigate }: { workspace: string; onNavigate: Navigate }) {
  const [locale] = useLocale();
  const t = moderationCenterMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadCenter(workspace, "overview", signal), [workspace]);
  const resource = useInstitutionResource(load);
  const number = new Intl.NumberFormat(locale);
  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.title}</h2>
    <div className="mt-4"><ToolLinks onNavigate={onNavigate} /></div>
    {resource.error ? <div className="mt-4"><AdminFeedback error={resource.error} retry={resource.refresh} /></div>
      : !resource.data ? <p className="mt-4" role="status">{authMessages[locale].working}</p>
      : <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((key) => <div key={key} className="rounded-md border border-[var(--theme-border)] p-3">
          <dt className="text-sm text-[var(--theme-body)]">{t[key]}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">
            {resource.data?.metrics?.[key] == null ? t.unavailable : number.format(resource.data.metrics[key])}
          </dd>
        </div>)}
      </dl>}
  </section>;
}

export function ModerationAppeals({ reviewer, onNavigate }: { reviewer: boolean; onNavigate: Navigate }) {
  const [locale] = useLocale();
  const t = moderationCenterMessages[locale];
  return <>
    <section className={institutionCard}>
      <h2 className="text-xl font-semibold">{t.appeals}</h2>
      <p className="my-3 text-sm text-[var(--theme-body)]">{t.appealHelp}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <button type="button" className={institutionLink} onClick={() => onNavigate("trust")}>{t.trustTool}</button>
        <button type="button" className={institutionLink} onClick={() => onNavigate("founder")}>{t.founderTool}</button>
        {reviewer && <Link className={institutionLink} href="/verification/review">{t.reviewerTool}</Link>}
      </div>
    </section>
    <AppealReviewQueue />
  </>;
}

const copyKeys = { reports: "reports", content: "content", restrictions: "restrictions", history: "history" } as const;
const helpKeys = { reports: "reportsHelp", content: "contentHelp", restrictions: "restrictionHelp", history: "historyHelp" } as const;
const viewStatuses = {
  reports: ["pending", "closed", "resolved", "dismissed", "restricted", "substantiated"],
  content: ["hidden", "removed"],
  restrictions: ["suspended", "banned", "provider_ban", "restricted"],
  history: ["recorded", "dismissed", "restricted", "restored"],
} as const satisfies Record<string, readonly (typeof moderationStatuses)[number][]>;

type ListView = keyof typeof copyKeys;
export function ModerationList({ workspace, view, onNavigate, target }: {
  workspace: string; view: ListView; onNavigate: Navigate; target?: string;
}) {
  const [locale] = useLocale();
  const t = moderationCenterMessages[locale];
  const common = adminMessages[locale];
  const [filters, setFilters] = useState(view === "reports" ? "status=pending" : "");
  const dated = view === "reports" || view === "history";
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const query = new URLSearchParams(filters);
    if (target) query.set("target", target);
    const result = await loadCenter(workspace, view, signal, query.toString(), cursor);
    return { rows: result.rows.map((row) => ({ ...row, timelineId: row.source + ":" + row.id })), nextCursor: result.nextCursor };
  }, [filters, target, view, workspace]);
  const resource = useCursorPage(load);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["domain", "status", "scope", "action"]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    const from = data.get("from");
    const through = data.get("through");
    if (typeof from === "string" && from) params.set("from", new Date(from).toISOString());
    if (typeof through === "string" && through) params.set("to", new Date(Date.parse(through) + dateSpan - 1).toISOString());
    if (params.toString() === filters) resource.retry();
    else setFilters(params.toString());
  }

  const domains = target ? ["accounts"] as const : view === "content" ? ["feed", "communities"] as const
    : view === "reports" ? moderationDomains.filter((key) => key !== "accounts")
      : view === "restrictions" ? ["accounts", "events", "projects", "trust"] as const : moderationDomains;
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <>
    <section className={institutionCard}>
      <h2 className="text-xl font-semibold">{target ? t.accountHistory : t[copyKeys[view]]}</h2>
      {target && <p className="mt-1 break-all text-sm">{target}</p>}
      <p className="mt-2 text-sm text-[var(--theme-body)]">{t[helpKeys[view]]}</p>
      {view === "content" && <div className="mt-3"><ToolLinks onNavigate={onNavigate} /></div>}
      <form onSubmit={filter} className="mt-4 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-semibold">{t.domain}
          <select name="domain" className={institutionField} defaultValue={target ? "accounts" : ""}>
            <option value="">{t.all}</option>
            {domains.map((name) => <option value={name} key={name}>{t[name]}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">{t.status}
          <select name="status" className={institutionField} defaultValue={view === "reports" ? "pending" : ""}>
            <option value="">{t.all}</option>
            {viewStatuses[view].map((status) => <option value={status} key={status}>{t[status]}</option>)}
          </select>
        </label>
        {!target && <label className="text-sm font-semibold">{t.scope}
          <input name="scope" className={institutionField} maxLength={40} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title={t.scopeHelp} />
        </label>}
        {view === "history" && <label className="text-sm font-semibold">{t.action}
          <select name="action" className={institutionField}>
            <option value="">{t.all}</option>
            {moderationHistoryActions.map((action) => <option value={action} key={action}>{t[action]}</option>)}
          </select>
        </label>}
        {dated && <>
          <label className="text-sm font-semibold">{t.from}<input name="from" type="date" className={institutionField} /></label>
          <label className="text-sm font-semibold">{t.through}<input name="through" type="date" className={institutionField} /></label>
        </>}
        <button type="submit" className={`${institutionAction} min-h-11 justify-self-start`}>{t.filter}</button>
      </form>
      {dated && <p className="mt-2 text-sm text-[var(--theme-body)]">{t.rangeHelp}</p>}
    </section>
    <section className={institutionCard} aria-label={t[copyKeys[view]]}>
      {resource.error !== null && <AdminFeedback error={resource.error} retry={resource.retry} />}
      {resource.error === null && !resource.page && <p role="status">{authMessages[locale].working}</p>}
      {resource.page?.rows.length === 0 && <p role="status">{t.empty}</p>}
      {!!resource.page?.rows.length && <ul className="divide-y divide-[var(--theme-border)]">
        {resource.page.rows.map((row) => <ModerationRow key={row.timelineId} row={row} view={view} onNavigate={onNavigate} format={format} />)}
      </ul>}
      {resource.page?.nextCursor && <button className={`${institutionAction} mt-4`} type="button" disabled={resource.loadingMore}
        onClick={() => void resource.more()}>{resource.loadingMore ? authMessages[locale].working : common.next}</button>}
    </section>
  </>;
}

function ModerationRow({ row, view, onNavigate, format }: {
  row: ModerationSummary; view: ListView; onNavigate: Navigate; format: Intl.DateTimeFormat;
}) {
  const [locale] = useLocale();
  const t = moderationCenterMessages[locale];
  const labels: Record<string, string> = t;
  const feed = feedMessages[locale];
  const categories: Record<string, string> = { harassment: feed.harassment, hate: feed.hate, spam: feed.spam, privacy: feed.privacy, other: feed.other };
  const contentTool = row.scopeKey ? "/communities/" + encodeURIComponent(row.scopeKey) + "/moderation" : "/feed/moderation";
  const contentQuery = new URLSearchParams(row.target === "comment" ? { target: "comments" } : {});
  if (row.status === "hidden") contentQuery.set("scope", "hidden");
  const href = row.domain === "feed" || row.domain === "communities"
    ? contentTool + (contentQuery.size ? "?" + contentQuery : "")
    : row.domain === "events" ? "/events/moderation" : row.domain === "projects" ? "/projects/review" : null;
  const action = labels[row.action] ?? categories[row.action] ?? t.unavailable;
  return <li className="grid gap-2 py-4 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <h3 className="font-semibold">{t[row.domain]} <span aria-hidden="true">·</span> {action}</h3>
      <span className="rounded-md bg-[var(--theme-selected)] px-2 py-1 text-xs font-semibold">{labels[row.status] ?? t.unavailable}</span>
    </div>
    <dl className="grid gap-x-5 gap-y-1 text-sm text-[var(--theme-body)] sm:grid-cols-2">
      <div className="min-w-0"><dt className="font-semibold">{t.reference}</dt><dd className="break-all">{row.source}:{row.id}</dd></div>
      <div className="min-w-0"><dt className="font-semibold">{t.target}</dt><dd className="break-words">{t[row.target]}{row.scopeKey && " · " + row.scopeKey}</dd></div>
      <div><dt className="font-semibold">{t.updated}</dt><dd>{row.occurredAt
        ? <time dateTime={row.occurredAt}>{format.format(new Date(row.occurredAt))}</time> : t.effectiveUnknown}</dd></div>
      {view === "restrictions" && <div><dt className="font-semibold">{t.expires}</dt><dd>{row.expiresAt
        ? <time dateTime={row.expiresAt}>{format.format(new Date(row.expiresAt))}</time> : t.indefinite}</dd></div>}
      {view === "history" && row.actorRef && <div className="min-w-0"><dt className="font-semibold">{t.actor}</dt><dd className="break-all">{row.actorRef}</dd></div>}
    </dl>
    {href ? <Link className={`${institutionLink} justify-self-start`} href={href}>{t.openTool}</Link>
      : <button type="button" className={`${institutionLink} justify-self-start`}
        onClick={() => row.domain === "accounts" ? onNavigate("accounts", row.targetId ?? undefined) : onNavigate("trust")}>{t.openTool}</button>}
  </li>;
}
