"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { f25FeaturePolicyKeys, platformRoles, type AdminAccount, type AdminAccountAction, type AdminOverview, type PlatformRole } from "@ayinou/shared";
import { changeAdminAccount, loadAdminAccounts, loadAdminOverview, loadPlatformAccess } from "@/lib/admin-api";
import { adminEntryPath, adminSections, type AdminTab } from "@/lib/admin-navigation";
import { feedLanguageMessages } from "@/lib/feed-language-i18n";
import { adminMessages } from "@/lib/admin-i18n";
import { moderationCenterMessages } from "@/lib/moderation-center-i18n";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { apiErrorCode } from "@/lib/api-errors";
import { localizedApiError } from "@/lib/error-i18n";
import { trustMessages } from "@/lib/trust-i18n";
import { FounderMark, institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { adminActionPanel, adminCompactCard, adminSecondaryAction } from "./admin-controls";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { SafetyOverviewPanel } from "./moderation-appeals";
import { ModerationAppeals, ModerationList, ModerationOverview } from "./moderation-center";
import { featureMessages } from "@/lib/feature-enforcement-i18n";
import { FeatureEnforcementPanel } from "./feature-enforcement";
import { StaffAppeals } from "./enforcement-appeals";
import { AdminAccountIdentity } from "./admin-account-avatar";
import { AdminAccountEnforcement } from "./admin-account-enforcement";
import { EnforcementDetails } from "./account-enforcement-details";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { TrustAdministration } from "./trust-workspace";
import { AmbassadorAdministration } from "./ambassador-workspaces";
import { LegalAdminPanel } from "./legal-admin-panel";
import { legalAdminMessages } from "@/lib/legal-admin-i18n";
import { founderMessages } from "@/lib/founder-i18n";
import { FounderIdentityPanel } from "./founder-identity";
import { AdminOnboardingCorrections } from "./onboarding-corrections";
import { PlatformGovernance } from "./platform-governance";
import { governanceMessages } from "@/lib/governance-i18n";
import { earlyPartnerMessages } from "@/lib/early-partner-i18n";
import { AdminEarlyPartners } from "./early-partner-workspace";
import { HomepageSettings } from "./homepage-settings";
import { ModerationPolicySettings } from "./moderation-policy-settings";
import { moderationPolicyMessages } from "@/lib/moderation-policy-i18n";
import { RegistrationSettings } from "./registration-settings";
import { VerificationSettings } from "./verification-settings";
import { RecognitionAdmin } from "./recognition-admin";
import { verificationCopy } from "@/lib/verification-policy-i18n";
import { MemberExperienceSettings } from "./member-experience-settings";
import { authorizedRequest } from "@/lib/api";
import { needReviewLabel } from "@/lib/community-needs-review-i18n";
import { StaffPublication } from "./community-need-publication";
import { StaffNeeds } from "./community-needs-review";
import { AdminAuditWorkspace } from "./admin-audit-workspace";
import { AdminSectionContext, useAdminRenewalPath } from "./admin-section-context";

const metrics = [
  { key: "members" },
  { key: "organizations" },
  { key: "recentMembershipEvents" },
  { key: "pendingVerifications", destination: "trust" },
  { key: "restrictedAccounts", destination: "moderationRestrictions" },
  { key: "recentAdminActions", destination: "audit" },
] as const satisfies readonly { key: keyof AdminOverview; destination?: AdminTab }[];
type AdminSectionGroup = typeof adminSections[number]["label"];
const adminNavigationButton = "inline-flex min-h-10 max-w-full items-center rounded-md px-3 py-1.5 text-start text-sm font-semibold leading-snug focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)]";
const loadNeedsOversight = (signal: AbortSignal): Promise<{ oversight: boolean }> =>
  authorizedRequest("/api/v1/private/community-needs-review/triage-access", { signal });

const adminCategoryButton = `${adminNavigationButton} border border-transparent hover:bg-[var(--theme-control)] aria-pressed:bg-[var(--theme-primary)] aria-pressed:text-[var(--theme-on-primary)]`;
const adminSectionButton = `${adminNavigationButton} border border-[var(--theme-border)] hover:bg-[var(--theme-control)] aria-pressed:border-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)] aria-pressed:text-[var(--theme-link)]`;

export function AdminWorkspace({ workspaceAction, workspaceId, section, onSectionChange }: {
  workspaceAction: ReactNode; workspaceId: string; section: AdminTab; onSectionChange: (section: AdminTab) => void;
}) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const moderation = moderationCenterMessages[locale];
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationQuery, setNavigationQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>();
  const content = useRef<HTMLElement>(null);
  const labels: Record<AdminTab, string> = {
    overview: t.overview, homepage: t.homepage, eventFeedSettings: feedLanguageMessages[locale].settings, registration: t.registrationPolicy.title, memberExperience: t.memberExperience.title, accounts: t.accounts, audit: t.audit,
    trust: trustMessages[locale].trustWorkspace, ambassadors: ambassadorMessages[locale].title,
    legal: legalAdminMessages[locale].title, founder: founderMessages[locale].adminTitle,
    corrections: governanceMessages[locale].corrections, governance: governanceMessages[locale].governance,
    partners: earlyPartnerMessages[locale].title,
    moderationOverview: moderation.overview, moderationReports: moderation.reports, moderationContent: moderation.content,
    moderationRestrictions: moderation.restrictions, moderationAppeals: moderation.appeals, moderationHistory: moderation.history,
    communityNeeds: needReviewLabel(locale,"queue"),
    featureRestrictions: featureMessages[locale].features, moderatorDelegation: featureMessages[locale].delegations,
    moderationPolicies: moderationPolicyMessages[locale].title,
    ...verificationCopy[locale].sections,
  };
  const access = useInstitutionResource(loadPlatformAccess);
  const needs = useInstitutionResource(loadNeedsOversight);
  const visibleSections = adminSections.filter(({ label }) => label !== "navigationSettings" || access.data?.founder)
    .map(({ label, pages }) => ({ label, pages: (pages as readonly AdminTab[])
      .filter((page) => page !== "communityNeeds" || needs.data?.oversight) }));
  const tab = visibleSections.some(({ pages }) => pages.some((page) => page === section)) ? section : "overview";
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase(locale);
  const query = normalize(navigationQuery.trim());
  const groupLabel = (label: AdminSectionGroup) => label === "navigationModeration" ? moderation.title : t[label];
  const activeGroup = visibleSections.find(({ pages }) => pages.some((page) => page === tab))?.label;
  const navigationGroups = visibleSections.filter(({ label }) => query || label === activeGroup).map(({ label, pages }) => {
    const heading = groupLabel(label);
    const groupMatch = normalize(heading).includes(query);
    return {
      label, heading,
      pages: pages.filter((page) => groupMatch || normalize(labels[page]).includes(query)),
      showReview: label === "navigationMembers" && access.data?.reviewer &&
        (groupMatch || normalize(t.reviewWorkspace).includes(query)),
    };
  }).filter(({ pages, showReview }) => pages.length || showReview);
  const overview = useInstitutionResource(loadAdminOverview);
  const number = new Intl.NumberFormat(locale);
  const refresh = () => { access.refresh(); overview.refresh(); };
  function navigate(next: AdminTab, account?: string) {
    setAccountFilter(account);
    onSectionChange(next);
  }

  return <AdminSectionContext.Provider value={tab}><MemberShell>
    <div className="grid gap-4" data-admin-workspace>
      <PageHeader title={t.administration} description={tab === "overview" ? t.administrationIntro : labels[tab]} actions={<>{access.data?.founder && <FounderMark />}{workspaceAction}</>} />
      {overview.error ? <AdminFeedback error={overview.error} totp={access.data?.totp} retry={refresh} />
        : !overview.data ? <p role="status" className={institutionCard}>{authMessages[locale].working}</p> : <>
          <div className="grid min-w-0 gap-4">
            <div className="min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
              <button type="button" aria-expanded={navigationOpen} aria-controls="admin-section-navigation"
                onClick={() => setNavigationOpen(!navigationOpen)}
                className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 rounded-lg px-3 py-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 lg:hidden">
                <span className="font-semibold">{t.navigationSections}</span>
                <span aria-hidden="true" className="flex min-w-0 items-center gap-2 text-sm text-[var(--theme-body)]">
                  {labels[tab]}
                  <svg viewBox="0 0 24 24" className={`size-4 shrink-0 motion-safe:transition-transform ${navigationOpen ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </span>
              </button>
              <nav id="admin-section-navigation" aria-label={t.administration} className={navigationOpen ? "block" : "hidden lg:block"}>
                <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--theme-border)] p-2 sm:px-3">
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {visibleSections.map(({ label, pages }) => <button key={label} type="button" aria-pressed={!query && activeGroup === label}
                      className={adminCategoryButton}
                      onClick={() => { setNavigationQuery(""); navigate(pages[0]); }}>{groupLabel(label)}</button>)}
                  </div>
                  <label className="relative block min-w-0 basis-full sm:basis-48 lg:basis-52">
                    <span className="sr-only">{t.navigationSearch}</span>
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute start-3 top-3 size-4 text-[var(--theme-body)]"
                      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></svg>
                    <input type="search" value={navigationQuery} onChange={(event) => setNavigationQuery(event.target.value)}
                      placeholder={t.navigationSearch}
                      className="min-h-10 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] pe-2 ps-9 text-sm focus-visible:outline-2 focus-visible:outline-[var(--theme-link)]" />
                  </label>
                </div>
                <div className="grid gap-2 p-2 sm:px-3">
                  {!navigationGroups.length && <p role="status" className="px-2 py-1 text-sm text-[var(--theme-body)]">{t.navigationNoResults}</p>}
                  {navigationGroups.map(({ label, heading, pages, showReview }) => <section key={label} aria-labelledby={label}>
                    <h2 id={label} className={query ? "px-2 pb-1 text-xs font-semibold text-[var(--theme-body)]" : "sr-only"}>{heading}</h2>
                    <ul className="flex flex-wrap items-center gap-1.5">
                      {pages.map((page) => <li key={page}>
                        <button type="button" aria-pressed={tab === page} className={adminSectionButton} onClick={() => {
                          navigate(page);
                          if (navigationQuery) setNavigationQuery("");
                          if (navigationOpen || query) content.current?.focus();
                          setNavigationOpen(false);
                        }}>{labels[page]}</button>
                      </li>)}
                      {showReview && <li><Link className={`${institutionLink} inline-flex min-h-10 items-center px-3 py-2`} href="/verification/review">{t.reviewWorkspace}</Link></li>}
                    </ul>
                  </section>)}
                </div>
              </nav>
            </div>
            <section ref={content} tabIndex={-1} aria-label={labels[tab]} className="grid min-w-0 gap-4 [&_button:disabled]:cursor-not-allowed [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-[var(--theme-link)]">
              {tab === "overview" && <>
                <section aria-labelledby="platform-overview" className="overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
                  <h2 id="platform-overview" className="border-b border-[var(--theme-border)] px-4 py-3 text-lg font-semibold sm:px-5">{t.overview}</h2>
                  <dl className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3 min-[2000px]:grid-cols-6">
                    {metrics.map((metric) => <div key={metric.key} className="relative min-w-0 rounded-lg bg-[var(--theme-control)] p-3">
                      <dt className="text-sm text-[var(--theme-body)]">{t[metric.key]}</dt>
                      <dd className="mt-1 text-2xl font-semibold tabular-nums">{number.format(overview.data![metric.key])}
                        {"destination" in metric && <button type="button" onClick={() => { navigate(metric.destination); content.current?.focus(); }}
                          aria-label={t.openAdminSection.replace("{section}", labels[metric.destination])}
                          className="absolute inset-0 flex items-end justify-end rounded-lg p-3 text-[var(--theme-link)] hover:ring-1 hover:ring-inset hover:ring-[var(--theme-link)] focus-visible:outline-2 focus-visible:-outline-offset-2">
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor"
                            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
                        </button>}
                      </dd>
                    </div>)}
                  </dl>
                </section>
                <SafetyOverviewPanel />
              </>}
              {tab === "communityNeeds" && <><StaffNeeds workspace={workspaceId} lane="admin" /><StaffPublication workspace={workspaceId} lane="admin" /></>}
              {tab === "moderationOverview" && <ModerationOverview workspace={workspaceId} onNavigate={navigate} />}
              {tab === "moderationReports" && <ModerationList key="reports" view="reports" workspace={workspaceId} onNavigate={navigate} />}
              {tab === "moderationContent" && <ModerationList key="content" view="content" workspace={workspaceId} onNavigate={navigate} />}
              {tab === "moderationRestrictions" && <ModerationList key="restrictions" view="restrictions" workspace={workspaceId} onNavigate={navigate} />}
              {tab === "moderationHistory" && <ModerationList key={accountFilter ?? "history"} view="history" workspace={workspaceId} target={accountFilter} onNavigate={navigate} />}
              {tab === "moderationAppeals" && <>
                <StaffAppeals workspace={workspaceId} lane="admin" />
                <ModerationAppeals reviewer={access.data?.reviewer === true} onNavigate={navigate} />
              </>}
              {tab === "featureRestrictions" && <FeatureEnforcementPanel key="features" workspace={workspaceId} />}
              {tab === "moderatorDelegation" && <FeatureEnforcementPanel key="delegation" workspace={workspaceId} delegate />}
              {tab === "accounts" && <AccountManagement key={accountFilter ?? "accounts"} initialQuery={accountFilter}
                workspace={workspaceId} founder={access.data?.founder === true}
                onHistory={(id) => navigate("moderationHistory", id)} onChange={overview.refresh} />}
              {tab === "audit" && <AdminAuditWorkspace key={workspaceId} workspaceId={workspaceId} founder={access.data?.founder === true} />}
              {tab === "trust" && <TrustAdministration founderWorkspace={access.data?.founder ? workspaceId : undefined} />}
              {tab === "ambassadors" && <AmbassadorAdministration />}
              {tab === "legal" && <LegalAdminPanel />}
              {tab === "founder" && <FounderIdentityPanel admin workspaceId={workspaceId} />}
              {tab === "corrections" && <AdminOnboardingCorrections />}
              {tab === "governance" && <PlatformGovernance />}
              {tab === "partners" && <AdminEarlyPartners />}
              {access.data?.founder && (tab === "verificationSettings" || tab === "rolesAssignments" || tab === "officialBadges") &&
                <VerificationSettings key={tab} section={tab} workspaceId={workspaceId} />}
              {access.data?.founder && (tab === "recognitionBadges" || tab === "recognitionHistory") &&
                <RecognitionAdmin key={tab} section={tab} workspaceId={workspaceId} />}
              {tab === "homepage" && access.data?.founder && <HomepageSettings key={workspaceId} workspaceId={workspaceId} />}
              {tab === "eventFeedSettings" && access.data?.founder && <div className="grid min-w-0 items-start gap-3 xl:grid-cols-2">
                {(["events", "feed"] as const).map((group) => <section key={group} className={`${adminCompactCard} grid gap-2`} aria-labelledby={`admin-policy-${group}`}>
                  <h2 id={`admin-policy-${group}`} className="border-b border-[var(--theme-border)] pb-2 text-lg font-semibold">{moderation[group]}</h2>
                  {f25FeaturePolicyKeys.filter((key) => key.startsWith(group + ".")).map((key) => <HomepageSettings
                    key={workspaceId + key} workspaceId={workspaceId}
                    path={"/api/v1/admin/feature-policy/" + key} title={feedLanguageMessages[locale].features[key]} />)}
                </section>)}
              </div>}
              {tab === "moderationPolicies" && access.data?.founder && <ModerationPolicySettings key={workspaceId} workspace={workspaceId} />}
              {tab === "registration" && access.data?.founder && <RegistrationSettings key={workspaceId} workspaceId={workspaceId} />}
              {tab === "memberExperience" && access.data?.founder && <MemberExperienceSettings key={workspaceId} workspaceId={workspaceId} />}
            </section>
          </div>
        </>}
    </div>
  </MemberShell></AdminSectionContext.Provider>;
}

export function AdminFeedback({ error, totp, retry, section, next = "/admin" }: {
  error: unknown; totp?: boolean; retry?: () => void; section?: AdminTab; next?: "/admin" | "/verification/review";
}) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const code = apiErrorCode(error);
  const adminRenewalPath = useAdminRenewalPath();
  const message = code === "MFA_REQUIRED" ? (totp === false ? t.enrollRequired : t.mfaRequired)
    : code === "VERIFICATION_REQUIRED" ? t.adminVerificationRequired
    : code === "FORBIDDEN" ? t.forbidden : code === "CONFLICT" ? t.conflict : code === "UNAUTHORIZED" ? t.unavailableSession : localizedApiError(locale, error);
  return <div className={institutionErrorBox}>
    <p role="alert">{message}</p>
    {code === "MFA_REQUIRED" && <Link className={institutionLink}
      href={totp === false ? "/settings" : section ? adminEntryPath(section, true) : next === "/admin" ? adminRenewalPath : `${next}?verify=1`}>{totp === false ? t.accountSecurity : t.verifyNow}</Link>}
    {code === "UNAUTHORIZED" && <Link className={institutionLink} href="/login">{authMessages[locale].loginTitle}</Link>}
    {retry && !["FORBIDDEN", "MFA_REQUIRED", "UNAUTHORIZED"].includes(code) &&
      <button type="button" className={institutionLink} onClick={retry}>{authMessages[locale].retry}</button>}
  </div>;
}

function AccountManagement({ initialQuery = "", founder, workspace, onChange, onHistory }: {
  initialQuery?: string; founder: boolean; workspace: string; onChange: () => void; onHistory: (id: string) => void;
}) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const [query, setQuery] = useState(initialQuery);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const loader = useCallback((signal: AbortSignal) => loadAdminAccounts(query, offset, workspace, signal), [query, offset, workspace]);
  const accounts = useInstitutionResource(loader);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get("query")).trim();
    setSelected(null);
    if (next === query && offset === 0) accounts.refresh();
    setQuery(next);
    setOffset(0);
  }

  return <section className="grid min-w-0 gap-2.5">
    <form onSubmit={search} className={`${adminCompactCard} grid items-end gap-3 sm:grid-cols-[minmax(0,32rem)_auto] sm:justify-start`}>
      <label className="block min-w-0 text-sm font-semibold">{t.search}
        <input name="query" type="search" maxLength={100} className={institutionField} placeholder={t.searchHelp} defaultValue={initialQuery} />
      </label>
      <button className={`${institutionAction} min-h-11 justify-self-start`}>{t.search}</button>
    </form>
    {accounts.error ? <AdminFeedback error={accounts.error} retry={accounts.refresh} /> : !accounts.data ? <p role="status">{authMessages[locale].working}</p>
      : accounts.data.length ? <div className="min-w-0 divide-y divide-[var(--theme-border)] rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)]">
        {accounts.data.map((account) => <article className="@container min-w-0 px-3 py-2.5 sm:px-4" key={account.id}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <AdminAccountIdentity account={account} fallback={t.unnamed} />
            </div>
            <p className={`rounded-md px-2 py-1 text-xs font-semibold ${account.status === "active" && !account.authBanned
              ? "bg-[var(--theme-control)]" : "bg-[var(--theme-error-bg)] text-[var(--theme-error-text)]"}`}>{account.authBanned ? t.authBanned : t[account.status]}</p>
            <div className="flex w-full flex-wrap gap-1.5 @min-[44rem]:w-auto">
              <button type="button" className={`${adminSecondaryAction} group gap-1.5 aria-expanded:border-[var(--theme-link)] aria-expanded:bg-[var(--theme-selected)]`} aria-expanded={selected === account.id}
                onClick={() => setSelected(selected === account.id ? null : account.id)}>
                {t.manage}
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 group-aria-expanded:rotate-180"
                  fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <button type="button" className={adminSecondaryAction} onClick={() => onHistory(account.id)}>{moderationCenterMessages[locale].accountHistory}</button>
            </div>
          </div>
          {selected === account.id && <div className="mt-3 grid gap-2">
            <div className="grid gap-1 rounded-md bg-[var(--theme-control)] p-3 text-sm">
              {account.bootstrapTrust && <p>{trustMessages[locale].bootstrapTrust}</p>}
              <p>{[account.confirmed ? t.confirmed : t.unconfirmed, account.authBanned ? t.authBanned : null, account.totp ? t.totpOn : t.totpOff,
                ...account.roles.map((role) => t[role])].filter(Boolean).join(" · ")}</p>
              <p>{t.joined} · {new Intl.DateTimeFormat(locale).format(new Date(account.createdAt))}</p>
              <p className="break-all text-xs text-[var(--theme-body)]">{t.subject} · {account.id}</p>
              {account.restrictionUpdatedAt && <p>{moderationCenterMessages[locale].updated} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(account.restrictionUpdatedAt))}</p>}
              {account.reason && <p className="break-words">{account.reason}</p>}
            </div>
            {account.enforcement && <div>
              <EnforcementDetails notice={account.enforcement} />
              <p className="mt-1 text-sm text-[var(--theme-body)]">{accountEnforcementMessages[locale].noticeReady}</p>
            </div>}
            <div className="grid items-start gap-3 @min-[52rem]:grid-cols-2">
              <AdminAccountEnforcement key={account.restrictionRevision ?? account.id} account={account}
                founder={founder} workspace={workspace} onChange={() => { setSelected(null); accounts.refresh(); onChange(); }} />
              <AccountAction key={account.id} account={account} onChange={() => { setSelected(null); accounts.refresh(); onChange(); }} />
            </div>
          </div>}
        </article>)}
      </div> : <p className={adminCompactCard}>{t.emptyAccounts}</p>}
    {(offset > 0 || accounts.data?.length === 25) && <div className="flex flex-wrap gap-3">
      {offset > 0 && <button type="button" className={adminSecondaryAction} onClick={() => setOffset(offset - 25)}>{t.previous}</button>}
      {offset < 10000 && accounts.data?.length === 25 && <button type="button" className={adminSecondaryAction} onClick={() => setOffset(offset + 25)}>{t.next}</button>}
    </div>}
  </section>;
}

function AccountAction({ account, onChange }: { account: AdminAccount; onChange: () => void }) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    const option = form.get("value");
    const role = platformRoles.find((item) => item === option);
    if (!role) return;
    const input: AdminAccountAction = { action: account.roles.includes(role) ? "revoke" : "grant", value: role, reason };
    setError(null);
    setBusy(true);
    try { await changeAdminAccount(account.id, input); onChange(); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className={adminActionPanel} aria-busy={busy}>
    <label className="text-sm font-semibold">{t.changeRole}
      <select className={institutionField} name="value" required defaultValue="" disabled={busy}>
        <option value="" disabled>{t.select}</option>
        {platformRoles.filter((role) => role !== "administrator").map((role: PlatformRole) =>
          <option key={role} value={role} disabled={!account.roles.includes(role) && !account.totp}>
            {account.roles.includes(role) ? t.revoke : t.grant} · {t[role]}
          </option>)}
      </select>
    </label>
    <p className="text-sm text-[var(--theme-body)]">{governanceMessages[locale].protectedRole}</p>
    <label className="text-sm font-semibold">{t.reason}
      <input name="reason" className={institutionField} required minLength={10} maxLength={500} disabled={busy} placeholder={t.reasonHelp} />
    </label>
    {error !== null && <AdminFeedback error={error} />}
    <button className={`${institutionAction} justify-self-start`} disabled={busy}>{t.apply}</button>
  </form>;
}
