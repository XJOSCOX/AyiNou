"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import {
  moderationDomains, moderationHistoryActions, moderationStatuses,
  type ModerationCenterMetrics, type ModerationCenterPage, type ModerationCenterView, type ModerationSummary,
} from "@ayinou/shared";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { appealHistoryLabels } from "@/lib/enforcement-appeal-i18n";
import { featureMessages } from "@/lib/feature-enforcement-i18n";
import { loadAdminAccounts } from "@/lib/admin-api";
import { adminMessages } from "@/lib/admin-i18n";
import type { AdminTab } from "@/lib/admin-navigation";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage } from "@/lib/feed-state";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { moderationCenterMessages } from "@/lib/moderation-center-i18n";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionField, useInstitutionResource } from "./institution-ui";
import { AdminMemberBadges } from "./admin-account-avatar";
import { adminCompactCard, adminDisclosure, adminSecondaryAction } from "./admin-controls";
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

const shortcutStyle = "flex min-h-11 min-w-0 items-center justify-between gap-2 break-words rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-start text-sm font-semibold leading-snug text-[var(--theme-link)] hover:border-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)]";

function ShortcutArrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 rtl:rotate-180"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

function ToolLinks({ onNavigate }: { onNavigate: Navigate }) {
  const [locale] = useLocale();
  const t = moderationCenterMessages[locale];
  const shortcuts = [
    { href: "/feed/moderation", label: t.feedTool },
    { href: "/events/moderation", label: t.eventTool },
    { href: "/projects/review", label: t.projectTool },
  ];
  return <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
    {shortcuts.map(({ href, label }) => <Link key={href} className={shortcutStyle} href={href}>
      <span className="min-w-0">{label}</span><ShortcutArrow />
    </Link>)}
    <button className={shortcutStyle} type="button" onClick={() => onNavigate("trust")}>
      <span className="min-w-0">{t.trustTool}</span><ShortcutArrow />
    </button>
  </div>;
}

export function ModerationOverview({ workspace, onNavigate }: { workspace: string; onNavigate: Navigate }) {
  const [locale] = useLocale();
  const t = moderationCenterMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadCenter(workspace, "overview", signal), [workspace]);
  const resource = useInstitutionResource(load);
  const number = new Intl.NumberFormat(locale);
  return <section className={adminCompactCard}>
    <h2 className="text-xl font-semibold">{t.title}</h2>
    <div className="mt-3 border-b border-[var(--theme-border)] pb-3"><ToolLinks onNavigate={onNavigate} /></div>
    {resource.error ? <div className="mt-4"><AdminFeedback error={resource.error} retry={resource.refresh} /></div>
      : !resource.data ? <p className="mt-4" role="status">{authMessages[locale].working}</p>
      : <dl className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {metrics.map((key) => <div key={key} className="min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] p-2 sm:px-3">
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
    <section className={adminCompactCard}>
      <h2 className="text-xl font-semibold">{t.appeals}</h2>
      <p className="my-3 text-sm text-[var(--theme-body)]">{t.appealHelp}</p>
      <div className="grid max-w-5xl gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <button type="button" className={shortcutStyle} onClick={() => onNavigate("trust")}><span className="min-w-0">{t.trustTool}</span><ShortcutArrow /></button>
        <button type="button" className={shortcutStyle} onClick={() => onNavigate("founder")}><span className="min-w-0">{t.founderTool}</span><ShortcutArrow /></button>
        {reviewer && <Link className={shortcutStyle} href="/verification/review"><span className="min-w-0">{t.reviewerTool}</span><ShortcutArrow /></Link>}
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
  const actions: Record<string, string> = { ...t, ...accountEnforcementMessages[locale], ...featureMessages[locale], ...appealHistoryLabels(locale) };
  const defaultFilters = view === "reports" ? "status=pending" : "";
  const [filters, setFilters] = useState(defaultFilters);
  const applied = new URLSearchParams(filters);
  const advancedCount = ["scope", "action", "from", "to"].filter((key) => applied.has(key)).length;
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
    : view === "reports" ? moderationDomains.filter((key) => key !== "accounts" && key !== "features")
      : view === "restrictions" ? ["accounts", "events", "projects", "trust", "features"] as const : moderationDomains;
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <>
    <section className={adminCompactCard}>
      <h2 className="text-xl font-semibold">{target ? t.accountHistory : t[copyKeys[view]]}</h2>
      {target && <p className="mt-1 break-all text-sm">{target}</p>}
      <p className="mt-2 text-sm text-[var(--theme-body)]">{t[helpKeys[view]]}</p>
      {view === "content" && <div className="mt-3 border-b border-[var(--theme-border)] pb-3"><ToolLinks onNavigate={onNavigate} /></div>}
      <form onSubmit={filter} onInvalid={(event) => {
        const advanced = (event.target as HTMLElement).closest("details");
        if (advanced) advanced.open = true;
      }} className="mt-3 grid max-w-5xl gap-2.5">
        <div className="grid min-w-0 items-end gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="text-sm font-semibold">{t.domain}
            <select name="domain" className={institutionField} defaultValue={target ? "accounts" : ""}>
              <option value="">{t.all}</option>
              {domains.map((name) => <option value={name} key={name}>{name === "features" ? featureMessages[locale].features : t[name]}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">{t.status}
            <select name="status" className={institutionField} defaultValue={view === "reports" ? "pending" : ""}>
              <option value="">{t.all}</option>
              {viewStatuses[view].map((status) => <option value={status} key={status}>{t[status]}</option>)}
            </select>
          </label>
          <button type="submit" className={`${institutionAction} min-h-11 justify-self-start sm:col-span-2 lg:col-span-1`}>{t.filter}</button>
        </div>
        <details className="rounded-md border border-[var(--theme-border)]">
          <summary className={adminDisclosure}>
            <span className="min-w-0 flex-1">{messages[locale].filters}
              {advancedCount > 0 && <span className="ms-2 rounded bg-[var(--theme-selected)] px-1.5 py-0.5 text-xs">{messages[locale].activeFilters.replace("{count}", new Intl.NumberFormat(locale).format(advancedCount))}</span>}
            </span>
          </summary>
          <div className="grid min-w-0 gap-2.5 border-t border-[var(--theme-border)] bg-[var(--theme-control)] p-3 sm:grid-cols-2">
            {!target && <label className="text-sm font-semibold">{t.scope}
              <input name="scope" className={institutionField} maxLength={40} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title={t.scopeHelp} />
            </label>}
            {view === "history" && <label className="text-sm font-semibold">{t.action}
              <select name="action" className={institutionField}>
                <option value="">{t.all}</option>
                {moderationHistoryActions.map((action) => <option value={action} key={action}>{actions[action]}</option>)}
              </select>
            </label>}
            {dated && <>
              <label className="text-sm font-semibold">{t.from}<input name="from" type="date" className={institutionField} /></label>
              <label className="text-sm font-semibold">{t.through}<input name="through" type="date" className={institutionField} /></label>
            </>}
          {dated && <p className="text-xs text-[var(--theme-body)] sm:col-span-2">{t.rangeHelp}</p>}
          </div>
        </details>
      </form>
    </section>
    <section className={adminCompactCard} aria-label={t[copyKeys[view]]}>
      {resource.error !== null && <AdminFeedback error={resource.error} retry={resource.retry} />}
      {resource.error === null && !resource.page && <p role="status">{authMessages[locale].working}</p>}
      {resource.page?.rows.length === 0 && <p role="status">{t.empty}</p>}
      {!!resource.page?.rows.length && (view === "history"
        ? <ModerationHistory rows={resource.page.rows} workspace={workspace} onNavigate={onNavigate} format={format} />
        : <ul className="divide-y divide-[var(--theme-border)]">
          {resource.page.rows.map((row) => <ModerationRow key={row.timelineId} row={row} view={view} onNavigate={onNavigate} format={format} />)}
        </ul>)}
      {resource.page?.nextCursor && <button className={`${adminSecondaryAction} mt-4`} type="button" disabled={resource.loadingMore}
        onClick={() => void resource.more()}>{resource.loadingMore ? authMessages[locale].working : common.next}</button>}
    </section>
  </>;
}

type HistoryRow = ModerationSummary & { timelineId: string };
type HistoryProps = { rows: HistoryRow[]; workspace: string; onNavigate: Navigate; format: Intl.DateTimeFormat };

function ModerationHistory({ rows, workspace, onNavigate, format }: HistoryProps) {
  const [locale] = useLocale();
  const t = moderationCenterMessages[locale];
  const accounts = new Map<string, HistoryRow[]>();
  const other: HistoryRow[] = [];

  for (const row of rows) {
    // Object targets carry a resource ID, not the ID of the account that owns it.
    if (row.target !== "account" || !row.targetId) {
      other.push(row);
      continue;
    }
    const entries = accounts.get(row.targetId);
    if (entries) entries.push(row);
    else accounts.set(row.targetId, [row]);
  }
  return <div className="grid min-w-0 gap-4">
    {accounts.size > 0 && <section className="grid gap-2">
      <h3 className="font-semibold">{t.historyByAccount}</h3>
      {[...accounts].map(([accountId, entries]) => <AccountHistoryGroup key={accountId} workspace={workspace}
        accountId={accountId} rows={entries} format={format} onNavigate={onNavigate} />)}
    </section>}
    {other.length > 0 && <section className="grid gap-2">
      <h3 className="font-semibold">{t.historyOther}</h3>
      <ul className="divide-y divide-[var(--theme-border)]">
        {other.map((row) => <ModerationRow key={row.timelineId} row={row} view="history" onNavigate={onNavigate} format={format} />)}
      </ul>
    </section>}
  </div>;
}

function AccountHistoryGroup({ accountId, rows, workspace, onNavigate, format }: HistoryProps & { accountId: string }) {
  const [locale] = useLocale();
  const load = useCallback(async (signal: AbortSignal) => {
    const accounts = await loadAdminAccounts(accountId, 0, workspace, signal);
    return accounts.find(({ id }) => id === accountId) ?? null;
  }, [accountId, workspace]);
  const account = useInstitutionResource(load).data;
  const username = account?.username ? `@${account.username}` : null;
  const label = account?.displayName || username || accountId;
  const newest = rows[0]?.occurredAt;

  return <details className="min-w-0 rounded-lg border border-[var(--theme-border)]">
    <summary className={adminDisclosure}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-all">
          {label}
          {username && username !== label && <span className="ms-2 text-xs font-normal text-[var(--theme-body)]">{username}</span>}
          {account && <span className="ms-1"><AdminMemberBadges username={account.username} claims={account.personalClaims} /></span>}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {newest && <time className="text-xs font-normal text-[var(--theme-body)]" dateTime={newest}>{format.format(new Date(newest))}</time>}
          <span className="rounded-md bg-[var(--theme-selected)] px-2 py-0.5 text-xs">{new Intl.NumberFormat(locale).format(rows.length)}</span>
        </span>
      </span>
    </summary>
    <ul className="divide-y divide-[var(--theme-border)] border-t border-[var(--theme-border)] p-3">
      {rows.map((row) => <ModerationRow key={row.timelineId} row={row} view="history" onNavigate={onNavigate} format={format} />)}
    </ul>
  </details>;
}

function ModerationRow({ row, view, onNavigate, format }: {
  row: ModerationSummary; view: ListView; onNavigate: Navigate; format: Intl.DateTimeFormat;
}) {
  const [locale] = useLocale();
  const t = moderationCenterMessages[locale];
  const labels: Record<string, string> = { ...accountEnforcementMessages[locale], ...t, ...featureMessages[locale], ...appealHistoryLabels(locale) };
  const feed = feedMessages[locale];
  const categories: Record<string, string> = { harassment: feed.harassment, hate: feed.hate, spam: feed.spam, privacy: feed.privacy, other: feed.other };
  const contentTool = row.scopeKey ? "/communities/" + encodeURIComponent(row.scopeKey) + "/moderation" : "/feed/moderation";
  const contentQuery = new URLSearchParams(row.target === "comment" ? { target: "comments" } : {});
  if (row.status === "hidden") contentQuery.set("scope", "hidden");
  const href = row.domain === "feed" || row.domain === "communities"
    ? contentTool + (contentQuery.size ? "?" + contentQuery : "")
    : row.domain === "events" ? "/events/moderation" : row.domain === "projects" ? "/projects/review" : null;
  const action = labels[row.action] ?? categories[row.action] ?? t.unavailable;
  const toolStyle = `${adminSecondaryAction} gap-2 justify-self-start`;
  const toolLabel = <><span>{t.openTool}</span><ShortcutArrow /></>;
  const actionTab = row.source === "enforcement_appeal" ? "moderationAppeals"
    : row.domain === "accounts" ? "accounts" : row.domain === "features" ? "featureRestrictions" : "trust";
  return <li className="grid min-w-0 gap-1.5 py-2.5 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <h3 className="font-semibold">{row.domain === "features" ? featureMessages[locale].features : t[row.domain]} <span aria-hidden="true">·</span> {action}</h3>
      <span className="rounded-md bg-[var(--theme-selected)] px-2 py-1 text-xs font-semibold">{labels[row.status] ?? t.unavailable}</span>
    </div>
    <dl className="grid min-w-0 gap-x-4 gap-y-1 text-xs text-[var(--theme-body)] sm:grid-cols-2 xl:grid-cols-3">
      <div className="min-w-0"><dt className="font-semibold">{t.reference}</dt><dd className="break-all">{row.source}:{row.id}</dd></div>
      {row.caseReference && <div className="min-w-0"><dt className="font-semibold">{accountEnforcementMessages[locale].reference}</dt>
        <dd className="break-all">{row.caseReference}</dd></div>}
      <div className="min-w-0"><dt className="font-semibold">{t.target}</dt><dd className="break-words">{row.capability ? featureMessages[locale][row.capability] : t[row.target]}{row.scopeKey && " · " + row.scopeKey}</dd></div>
      <div><dt className="font-semibold">{t.updated}</dt><dd>{row.occurredAt
        ? <time dateTime={row.occurredAt}>{format.format(new Date(row.occurredAt))}</time> : t.effectiveUnknown}</dd></div>
      {view === "restrictions" && <div><dt className="font-semibold">{t.expires}</dt><dd>{row.expiresAt
        ? <time dateTime={row.expiresAt}>{format.format(new Date(row.expiresAt))}</time> : t.indefinite}</dd></div>}
      {view === "history" && row.actorRef && <div className="min-w-0"><dt className="font-semibold">{t.actor}</dt><dd className="break-all">{row.actorRef}</dd></div>}
    </dl>
    {href && row.source !== "enforcement_appeal" ? <Link className={toolStyle} href={href}>{toolLabel}</Link>
      : <button type="button" className={toolStyle}
        onClick={() => onNavigate(actionTab, actionTab === "accounts" ? row.targetId ?? undefined : undefined)}>{toolLabel}</button>}
  </li>;
}
