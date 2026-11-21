"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { governmentKinds, invitedRoles, type InstitutionManagement } from "@ayinou/shared";
import { accountMessages } from "@/lib/account-i18n";
import { affiliationMessages } from "@/lib/affiliation-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { inviteRepresentative, loadInstitution, resolveInvitation, revokeRepresentative, saveInstitution, uploadInstitutionLogo } from "@/lib/institution-api";
import { institutionError, institutionMessages } from "@/lib/institution-i18n";
import { membershipMessages } from "@/lib/membership-i18n";
import { useLocale } from "@/lib/locale-store";
import { trustMessages } from "@/lib/trust-i18n";
import { organizationRoleMessages } from "@/lib/organization-role-i18n";
import { pollMessages } from "@/lib/poll-i18n";
import { InstitutionForm } from "./institution-form";
import { OrganizationRegistrationPanel } from "./organization-registration-panel";
import { OrganizationEarlyPartners } from "./early-partner-workspace";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, InstitutionLogo,
  InstitutionStatus, useInstitutionResource, VerifiedBadge } from "./institution-ui";
import { MemberShell } from "./member-shell";

export function InstitutionManagementScreen({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const auth = authMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadInstitution(id, signal), [id]);
  const details = useInstitutionResource(load);

  return (
    <MemberShell>
      {details.error ? <div className={institutionCard}>
        <p role="alert">{institutionError(t, details.error)}</p>
        <button type="button" onClick={details.refresh} className={`${institutionLink} mt-2`}>{auth.retry}</button>
      </div> : details.data ? <InstitutionWorkspace detail={details.data} refresh={details.refresh} />
        : <p role="status">{auth.working}</p>}
    </MemberShell>
  );
}

function InstitutionWorkspace({ detail, refresh }: { detail: InstitutionManagement; refresh: () => void }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const auth = authMessages[locale];
  const { organization: org, role } = detail;
  const manageTeam = role === "owner" || role === "administrator";
  const inviteRoles = invitedRoles.filter((item) => role === "owner" || item !== "administrator");
  const applyAs = governmentKinds.includes(org.kind) ? "government" : "organization";
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  const [notice, setNotice] = useState<"invited" | "saved" | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const when = (date: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(date));

  async function run(action: () => Promise<void>, message?: "invited" | "saved") {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    setNotice(null);
    try {
      await action();
      refresh();
      if (message) setNotice(message);
      setConfirm(null);
    } catch (cause) { setFailed(cause); }
    finally { setBusy(false); }
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const username = String(fields.get("username") ?? "").trim();
    const invitedRole = inviteRoles.find((item) => item === fields.get("role"));
    const term = fields.get("term");
    if (!invitedRole) return;
    void run(async () => {
      await inviteRepresentative(org.id, username, invitedRole, term ? Number(term) : null);
      form.reset();
    }, "invited");
  }

  return (
    <div className="grid gap-5">
      <header className={`${institutionCard} flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex min-w-0 items-center gap-4">
          <InstitutionLogo organization={org} />
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{org.name}</h1>
            <p className="mt-1 break-words text-sm text-[var(--theme-body)]">@{org.handle} · {t[org.kind]} · {t[role]}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <InstitutionStatus status={org.verificationStatus} kind={org.kind} />
          <Link href={`/organization/${org.handle}`} className={institutionLink}>{t.publicProfile}</Link>
          <Link href={`/institutions/${org.id}/roles`} className={institutionLink}>{organizationRoleMessages[locale].title}</Link>
          {org.verificationStatus === "verified" && <Link href={"/polls?scope=organization&scopeId=" + org.id} className={institutionLink}>{pollMessages[locale].title}</Link>}
          {manageTeam && <Link href={`/institutions/${org.id}/affiliations`} className={institutionLink}>{affiliationMessages[locale].management}</Link>}
        </div>
      </header>
      {failed !== null && <p role="alert" className={institutionErrorBox}>{institutionError(t, failed)}</p>}
      {notice && <p role="status" className="text-sm text-[var(--theme-link)]">{t[notice]}</p>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
        <div className="grid content-start gap-4">
          <section className={institutionCard}>
            <h2 className="mb-4 text-xl font-semibold">{t.institutionProfile}</h2>
            {role === "viewer" ? <>
              <p className="text-sm text-[var(--theme-body)]">{org.countryCode}{org.departmentCode && ` · ${org.departmentCode}`}</p>
              {org.description && <p className="mt-2 whitespace-pre-line break-words">{org.description}</p>}
            </> : <>
              <InstitutionForm initial={{ ...org, contactEmail: detail.contactEmail }} role={role} identityLocked={detail.identityLocked}
                onSave={async (input) => { await saveInstitution(org.id, input); refresh(); }} />
              {detail.registration && <OrganizationRegistrationPanel organizationId={org.id} initial={detail.registration} canCorrect={role === "owner"} />}
              <div className="mt-5 border-t border-[var(--theme-border)] pt-4">
                <label className="inline-flex">
                  <input type="file" className="peer sr-only" accept="image/jpeg,image/png,image/webp" disabled={busy}
                    aria-describedby="institution-logo-hint"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void run(() => uploadInstitutionLogo(org.id, file), "saved");
                    }} />
                  <span className={`${institutionAction} cursor-pointer peer-focus-visible:outline-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60`}>{t.uploadLogo}</span>
                </label>
                <small id="institution-logo-hint" className="mt-1 block text-[var(--theme-body)]">{membershipMessages[locale].photoHint}</small>
              </div>
            </>}
          </section>
          <section className={institutionCard}>
            <h2 className="text-xl font-semibold">{t.verification}</h2>
            <div className="mt-3 flex flex-wrap gap-4">
              {role === "owner" && org.verificationStatus !== "verified" && <Link className={institutionLink} href={`/verification?institution=${org.id}&kind=${applyAs}`}>{t.request}</Link>}
              <Link className={institutionLink} href={`/verification?institution=${org.id}&kind=representative`}>{t.representative}</Link>
            </div>
          </section>
          {manageTeam && <OrganizationEarlyPartners organizationId={org.id} />}
          {manageTeam && <section className={institutionCard}>
            <h2 className="text-xl font-semibold">{t.activity}</h2>
            {detail.activity.length ? <ul className="mt-3 divide-y divide-[var(--theme-border)]">
              {detail.activity.map(({ event, occurredAt }, index) => <li key={`${event}-${occurredAt}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span>{t[event as keyof typeof t] ?? t.activity}</span><time dateTime={occurredAt} className="text-[var(--theme-body)]">{when(occurredAt)}</time>
              </li>)}
            </ul> : <p className="mt-2 text-[var(--theme-body)]">{t.emptyActivity}</p>}
          </section>}
        </div>
        <div className="grid content-start gap-4">
          <section className={institutionCard}>
            <h2 className="text-xl font-semibold">{t.team}</h2>
            <ul className="mt-3 divide-y divide-[var(--theme-border)]">
              {detail.representatives.map((rep) => (
                <li key={rep.id} className="space-y-1.5 py-3">
                  <p className="break-words font-medium">{rep.displayName ?? rep.username ?? t.representative}{rep.isSelf ? ` · ${t.you}` : ""}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--theme-body)]">
                    <span>{t[rep.role]}{rep.expiresAt && ` · ${t.expires} ${when(rep.expiresAt)}`}</span>
                    {rep.verified && <VerifiedBadge label={trustMessages[locale].representative} />}
                  </p>
                  {(role === "owner" && rep.role !== "owner" || role === "administrator" && ["viewer", "editor"].includes(rep.role)) && (
                    confirm === rep.id ? <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} className={institutionAction} onClick={() => { void run(() => revokeRepresentative(org.id, rep.id)); }}>{t.revokeAccess}</button>
                      <button type="button" disabled={busy} className={institutionLink} onClick={() => setConfirm(null)}>{accountMessages[locale].cancel}</button>
                    </div> : <button type="button" disabled={busy} className={institutionLink} onClick={() => setConfirm(rep.id)}>{t.revokeAccess}</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {manageTeam && <section className={institutionCard}>
            <h2 className="text-xl font-semibold">{t.invite}</h2>
            <p className="mt-2 text-sm text-[var(--theme-body)]">{t.inviteHelp}</p>
            <form className="mt-4 grid gap-3" onSubmit={invite} aria-busy={busy}>
              <label className="text-sm font-semibold">{membershipMessages[locale].username}<input name="username" className={institutionField} maxLength={24} required /></label>
              <label className="text-sm font-semibold">{t.role}<select name="role" className={institutionField} defaultValue="viewer">
                {inviteRoles.map((item) => <option key={item} value={item}>{t[item]}</option>)}
              </select></label>
              <label className="text-sm font-semibold">{t.term}<input name="term" type="number" min={1} max={730} className={institutionField} /></label>
              <button type="submit" className={institutionAction} disabled={busy}>{busy ? auth.working : t.invite}</button>
            </form>
            <h3 className="mt-6 border-t border-[var(--theme-border)] pt-4 font-semibold">{t.invitations}</h3>
            {detail.invitations.length ? <ul className="mt-2 divide-y divide-[var(--theme-border)]">
              {detail.invitations.map((entry) => <li key={entry.id} className="space-y-1 py-2 text-sm">
                <p>{entry.username ? `@${entry.username}` : t.representative} · {t[entry.role]}</p>
                <p className="text-[var(--theme-body)]">{t.expires} {when(entry.expiresAt)}</p>
                {(role === "owner" || entry.role !== "administrator") && <button type="button" disabled={busy} onClick={() => {
                  void run(() => resolveInvitation(entry.id, "revoke"));
                }} className={institutionLink}>{t.cancelInvite}</button>}
              </li>)}
            </ul> : <p className="mt-2 text-sm text-[var(--theme-body)]">{t.noInvitations}</p>}
          </section>}
        </div>
      </div>
    </div>
  );
}
