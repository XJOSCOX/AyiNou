"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { platformRoles, type AccountStatus, type AdminAccount, type AdminAccountAction, type AdminOverview, type PlatformRole } from "@ayinou/shared";
import { changeAdminAccount, loadAdminAccounts, loadAdminAudit, loadAdminOverview, loadPlatformAccess } from "@/lib/admin-api";
import { adminMessages } from "@/lib/admin-i18n";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { apiErrorCode } from "@/lib/api-errors";
import { localizedApiError } from "@/lib/error-i18n";
import { trustMessages } from "@/lib/trust-i18n";
import { AdministratorMark, institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource, VerifiedCheck } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { SafetyOverviewPanel } from "./moderation-appeals";
import { TrustAdministration } from "./trust-workspace";
import { AmbassadorAdministration } from "./ambassador-workspaces";

const metrics: (keyof AdminOverview)[] = ["members", "organizations", "recentMembershipEvents", "pendingVerifications", "restrictedAccounts", "recentAdminActions"];
const statuses: AccountStatus[] = ["active", "suspended", "banned"];
type AdminTab = "overview" | "accounts" | "audit" | "trust" | "ambassadors";
const tabs: AdminTab[] = ["overview", "accounts", "audit", "trust", "ambassadors"];

export function AdminWorkspace() {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const [tab, setTab] = useState<AdminTab>("overview");
  const access = useInstitutionResource(loadPlatformAccess);
  const overview = useInstitutionResource(loadAdminOverview);
  const refresh = () => { access.refresh(); overview.refresh(); };

  return <MemberShell>
    <div className="grid gap-4">
      <PageHeader title={t.administration} />
      {overview.error ? <AdminFeedback error={overview.error} totp={access.data?.totp} retry={refresh} />
        : !overview.data ? <p role="status">{authMessages[locale].working}</p> : <>
          <nav aria-label={t.administration} className="flex flex-wrap gap-2">
            {tabs.map((section) => <button key={section} type="button" aria-pressed={tab === section} onClick={() => setTab(section)}
              className="rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold aria-pressed:bg-[var(--theme-selected)]">
              {section === "trust" ? trustMessages[locale].trustWorkspace : section === "ambassadors" ? ambassadorMessages[locale].title : t[section]}</button>)}
            {access.data?.reviewer && <Link className={institutionLink} href="/verification/review">{t.reviewWorkspace}</Link>}
          </nav>
          {tab === "overview" && <><dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map((metric) => <div key={metric} className={institutionCard}>
              <dt className="text-sm text-[var(--theme-body)]">{t[metric]}</dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums">{new Intl.NumberFormat(locale).format(overview.data![metric])}</dd>
            </div>)}
          </dl><SafetyOverviewPanel /></>}
          {tab === "accounts" && <AccountManagement onChange={overview.refresh} />}
          {tab === "audit" && <AuditFeed />}
          {tab === "trust" && <TrustAdministration />}
          {tab === "ambassadors" && <AmbassadorAdministration />}
        </>}
    </div>
  </MemberShell>;
}

export function AdminFeedback({ error, totp, retry, next = "/admin" }: {
  error: unknown; totp?: boolean; retry?: () => void; next?: "/admin" | "/verification/review";
}) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const code = apiErrorCode(error);
  const message = code === "MFA_REQUIRED" ? (totp === false ? t.enrollRequired : t.mfaRequired)
    : code === "VERIFICATION_REQUIRED" ? t.adminVerificationRequired
    : code === "FORBIDDEN" ? t.forbidden : code === "CONFLICT" ? t.conflict : code === "UNAUTHORIZED" ? t.unavailableSession : localizedApiError(locale, error);
  return <div className={institutionErrorBox}>
    <p role="alert">{message}</p>
    {code === "MFA_REQUIRED" && <Link className={institutionLink}
      href={totp === false ? "/settings" : `/mfa?next=${next}`}>{totp === false ? t.accountSecurity : t.verifyNow}</Link>}
    {code === "UNAUTHORIZED" && <Link className={institutionLink} href="/login">{authMessages[locale].loginTitle}</Link>}
    {retry && !["FORBIDDEN", "MFA_REQUIRED", "UNAUTHORIZED"].includes(code) &&
      <button type="button" className={institutionLink} onClick={retry}>{authMessages[locale].retry}</button>}
  </div>;
}

function AccountManagement({ onChange }: { onChange: () => void }) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const loader = useCallback((signal: AbortSignal) => loadAdminAccounts(query, offset, signal), [query, offset]);
  const accounts = useInstitutionResource(loader);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get("query")).trim();
    setSelected(null);
    if (next === query && offset === 0) accounts.refresh();
    setQuery(next);
    setOffset(0);
  }

  return <section className="grid min-w-0 gap-3">
    <form onSubmit={search} className={institutionCard}>
      <label className="block text-sm font-semibold">{t.search}
        <input name="query" type="search" maxLength={100} className={institutionField} placeholder={t.searchHelp} />
      </label>
      <button className={`${institutionAction} mt-3`}>{t.search}</button>
    </form>
    {accounts.error ? <AdminFeedback error={accounts.error} retry={accounts.refresh} /> : !accounts.data ? <p role="status">{authMessages[locale].working}</p>
      : accounts.data.length ? accounts.data.map((account) => <article className={institutionCard} key={account.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words font-semibold">{account.displayName ?? t.unnamed}{account.verified && <>{" "}<VerifiedCheck label={t.identityVerified} /></>}
              {account.roles.includes("administrator") && <>{" "}<AdministratorMark /></>}</h2>
            {account.bootstrapTrust && <p className="text-sm text-[var(--theme-body)]">{trustMessages[locale].bootstrapTrust}</p>}
            {account.username && <p className="break-all text-sm">@{account.username}</p>}
            <p className="break-all text-xs text-[var(--theme-body)]">{account.id}</p>
          </div>
          <p className="font-semibold">{t[account.status]}</p>
        </div>
        <p className="mt-2 text-sm text-[var(--theme-body)]">
          {[account.confirmed ? t.confirmed : t.unconfirmed, account.authBanned ? t.authBanned : null, account.totp ? t.totpOn : t.totpOff,
            ...account.roles.map((role) => t[role])].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-2 text-sm">{t.joined} · {new Intl.DateTimeFormat(locale).format(new Date(account.createdAt))}</p>
        {account.reason && <p className="mt-2 break-words text-sm">{account.restrictionUpdatedAt &&
          `${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(account.restrictionUpdatedAt))} · `}{account.reason}</p>}
        <button type="button" className={`${institutionLink} mt-3`} aria-expanded={selected === account.id}
          onClick={() => setSelected(selected === account.id ? null : account.id)}>{t.manage}</button>
        {selected === account.id && <AccountAction key={account.id} account={account}
          onChange={() => { setSelected(null); accounts.refresh(); onChange(); }} />}
      </article>) : <p>{t.emptyAccounts}</p>}
    {(offset > 0 || accounts.data?.length === 25) && <div className="flex flex-wrap gap-3">
      {offset > 0 && <button type="button" className={institutionLink} onClick={() => setOffset(offset - 25)}>{t.previous}</button>}
      {offset < 10000 && accounts.data?.length === 25 && <button type="button" className={institutionLink} onClick={() => setOffset(offset + 25)}>{t.next}</button>}
    </div>}
  </section>;
}

function AccountAction({ account, onChange }: { account: AdminAccount; onChange: () => void }) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const [kind, setKind] = useState<"status" | "roles">("status");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    const option = form.get("value");
    const role = platformRoles.find((item) => item === option);
    const status = statuses.find((item) => item === option);
    const input: AdminAccountAction | null = kind === "roles" && role
      ? { action: account.roles.includes(role) ? "revoke" : "grant", value: role, reason }
      : kind === "status" && status ? { action: "status", value: status, reason } : null;
    if (!input) return;
    setError(null);
    setBusy(true);
    try { await changeAdminAccount(account.id, input); onChange(); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="mt-3 grid gap-3 border-t border-[var(--theme-border)] pt-3 sm:max-w-xl" aria-busy={busy}>
    <label className="text-sm font-semibold">{t.action}
      <select className={institutionField} value={kind} disabled={busy} onChange={(event) => setKind(event.target.value === "roles" ? "roles" : "status")}>
        <option value="status">{t.changeStatus}</option><option value="roles">{t.changeRole}</option>
      </select>
    </label>
    <label className="text-sm font-semibold">{t.value}
      <select key={kind} className={institutionField} name="value" required defaultValue="" disabled={busy}>
        <option value="" disabled>{t.select}</option>
        {kind === "status" ? statuses.filter((status) => status !== account.status).map((status) =>
          <option key={status} value={status}>{t[status]}</option>) : platformRoles.map((role: PlatformRole) =>
          <option key={role} value={role} disabled={!account.roles.includes(role) && (!account.totp || (role === "administrator" && !account.verified))}>
            {account.roles.includes(role) ? t.revoke : t.grant} · {t[role]}
          </option>)}
      </select>
    </label>
    {kind === "roles" && !account.verified && !account.roles.includes("administrator") &&
      <p className="text-sm text-[var(--theme-body)]">{t.adminVerificationRequired}</p>}
    <label className="text-sm font-semibold">{t.reason}
      <input name="reason" className={institutionField} required minLength={10} maxLength={500} disabled={busy} placeholder={t.reasonHelp} />
    </label>
    {error !== null && <AdminFeedback error={error} />}
    <button className={`${institutionAction} justify-self-start`} disabled={busy}>{t.apply}</button>
  </form>;
}

function AuditFeed() {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const audit = useInstitutionResource(loadAdminAudit);
  const labels: Partial<Record<string, string>> = t.events;
  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.audit}</h2>
    <p className="mt-2 text-sm text-[var(--theme-body)]">{t.auditScope}</p>
    {audit.error ? <AdminFeedback error={audit.error} retry={audit.refresh} /> : !audit.data ? <p role="status">{authMessages[locale].working}</p>
      : audit.data.length ? <ol className="mt-3 divide-y divide-[var(--theme-border)]">
        {audit.data.map((event) => <li className="py-3" key={event.id}>
          <p className="font-semibold">{labels[event.event] ?? t.audit}{event.role && ` · ${t[event.role]}`}</p>
          <time className="text-sm" dateTime={event.occurredAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</time>
          {event.reason && <p className="break-words text-sm">{event.reason}</p>}
          {event.actorId && <p className="break-all text-xs">{t.actor} · {event.actorId}</p>}
          {event.subjectId && <p className="break-all text-xs">{t.subject} · {event.subjectId}</p>}
          {event.organizationId && <p className="break-all text-xs">{t.organizationId} · {event.organizationId}</p>}
        </li>)}
      </ol> : <p className="mt-3">{t.emptyAudit}</p>}
  </section>;
}
