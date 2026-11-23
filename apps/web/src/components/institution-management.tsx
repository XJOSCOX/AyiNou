"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
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

const workspaceButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)] disabled:opacity-60";

const workspaceNavLink = "inline-flex min-h-11 items-center rounded-md bg-[var(--theme-control)] px-4 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)]";

function InstitutionWorkspace({ detail, refresh }: { detail: InstitutionManagement; refresh: () => void }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  const auth = authMessages[locale];
  const { organization: org, role } = detail;
  const manageTeam = role === "owner" || role === "administrator";
  const inviteRoles = invitedRoles.filter((item) => role === "owner" || item !== "administrator");
  const applyAs = governmentKinds.includes(org.kind) ? "government" : "organization";
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const focusUsername = useCallback((input: HTMLInputElement | null) => input?.focus(), []);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ cause: unknown; invitation: boolean } | null>(null);
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
    } catch (cause) { setFailed({ cause, invitation: message === "invited" }); }
    finally { setBusy(false); }
  }

  function closeInvitation() {
    setInviting(false);
    setFailed((current) => current?.invitation ? null : current);
    inviteButton.current?.focus();
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const username = String(fields.get("username") ?? "").trim();
    const invitedRole = inviteRoles.find((item) => item === fields.get("role"));
    const term = fields.get("term");
    if (!invitedRole) return;
    void run(async () => {
      await inviteRepresentative(org.id, username, invitedRole, term ? Number(term) : null);
      closeInvitation();
    }, "invited");
  }

  return (
    <div className="grid gap-5">
      <header className="min-w-0 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
        <div className="bg-[var(--theme-hero)] p-5 sm:px-7 sm:py-6">
          <Link href="/institutions" className={institutionLink}>
            <span aria-hidden="true">← </span>{t.institutions}
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 sm:gap-6">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <InstitutionLogo organization={org} large />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="min-w-0 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{org.name}</h1>
                  <InstitutionStatus status={org.verificationStatus} kind={org.kind} />
                </div>
                <p className="mt-1 break-words text-sm text-[var(--theme-body)]">@{org.handle} · {t[org.kind]} · {t[role]}</p>
              </div>
            </div>
            <Link href={`/organization/${org.handle}`} className={`${workspaceButton} bg-[var(--theme-surface)] px-4`}>
              {t.publicProfile}<span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-[var(--theme-border)] px-5 py-3 sm:px-7">
          <Link href={`/institutions/${org.id}/roles`} className={workspaceNavLink}>{organizationRoleMessages[locale].title}</Link>
          {manageTeam && <Link href={`/institutions/${org.id}/affiliations`} className={workspaceNavLink}>{affiliationMessages[locale].management}</Link>}
          {org.verificationStatus === "verified" && <Link href={"/polls?scope=organization&scopeId=" + org.id} className={workspaceNavLink}>{pollMessages[locale].title}</Link>}
        </div>
      </header>
      {failed && !failed.invitation && <p role="alert" className={institutionErrorBox}>{institutionError(t, failed.cause)}</p>}
      {notice === "saved" && <p role="status" className="text-sm text-[var(--theme-link)]">{t.saved}</p>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(21rem,2fr)] xl:grid-rows-[auto_minmax(0,1fr)]">
        <section className={institutionCard}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">{t.institutionProfile}</h2>
            {role !== "viewer" && <button type="button" className={workspaceButton} disabled={busy}
              aria-expanded={editing} aria-controls="institution-profile-content" onClick={() => setEditing(!editing)}>
              {editing ? accountMessages[locale].cancel : t.editOrganizationProfile}
            </button>}
          </div>
          <div id="institution-profile-content">
            {!editing || role === "viewer" ? <>
              <p className="text-sm text-[var(--theme-body)]">{org.departmentName ? `${org.departmentName} · ` : ""}{new Intl.DisplayNames(locale, { type: "region" }).of(org.countryCode)}</p>
              {org.description && <p dir="auto" className="mt-2 whitespace-pre-line break-words">{org.description}</p>}
              {org.website && <a className={`${institutionLink} mt-3 inline-block`} href={org.website} target="_blank" rel="noreferrer">{trustMessages[locale].listedWebsite}</a>}
            </> : <>
              <InstitutionForm initial={{ ...org, contactEmail: detail.contactEmail }} role={role} identityLocked={detail.identityLocked}
                onSave={async (input) => { await saveInstitution(org.id, input); setEditing(false); setNotice("saved"); refresh(); }} />
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
          </div>
        </section>
        <section className={`${institutionCard} xl:col-start-2 xl:row-start-1 xl:row-span-2`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t.team}</h2>
            {manageTeam && <button type="button" ref={inviteButton} className={`${institutionAction} min-h-11 gap-2 aria-disabled:opacity-60`}
              aria-expanded={inviting} aria-controls="institution-invite-form" aria-disabled={busy}
              onClick={() => {
                if (busy) return;
                if (inviting) closeInvitation();
                else setInviting(true);
              }}>
              <span aria-hidden="true" className="text-lg leading-none">+</span>{t.invite}
            </button>}
          </div>
          {manageTeam && <div id="institution-invite-form" hidden={!inviting}>
            {inviting && <form className="mt-4 grid gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4" onSubmit={invite} aria-busy={busy}>
              <p className="text-sm text-[var(--theme-body)]">{t.inviteHelp}</p>
              {failed?.invitation && <p role="alert" className={institutionErrorBox}>{institutionError(t, failed.cause)}</p>}
              <label className="text-sm font-semibold">{membershipMessages[locale].username}
                <input ref={focusUsername} name="username" className={institutionField} maxLength={24} required />
              </label>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="text-sm font-semibold">{t.role}
                  <select name="role" className={institutionField} defaultValue="viewer">
                    {inviteRoles.map((item) => <option key={item} value={item}>{t[item]}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">{t.term}
                  <input name="term" type="number" min={1} max={730} className={institutionField} />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={`${institutionAction} min-h-11`} disabled={busy}>{busy ? auth.working : t.sendInvitation}</button>
                <button type="button" className={workspaceButton} disabled={busy} onClick={closeInvitation}>{accountMessages[locale].cancel}</button>
              </div>
            </form>}
          </div>}
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
          {manageTeam && <div className="mt-3 border-t border-[var(--theme-border)] pt-4">
            <h3 className="font-semibold">{t.invitations}</h3>
            {notice === "invited" && <p role="status" className="mt-2 text-sm text-[var(--theme-link)]">{t.invited}</p>}
            {detail.invitations.length ? <ul className="mt-2 divide-y divide-[var(--theme-border)]">
              {detail.invitations.map((entry) => <li key={entry.id} className="space-y-1 py-2 text-sm">
                <p>{entry.username ? `@${entry.username}` : t.representative} · {t[entry.role]}</p>
                <p className="text-[var(--theme-body)]">{t.expires} {when(entry.expiresAt)}</p>
                {(role === "owner" || entry.role !== "administrator") && <button type="button" disabled={busy} onClick={() => {
                  void run(() => resolveInvitation(entry.id, "revoke"));
                }} className={institutionLink}>{t.cancelInvite}</button>}
              </li>)}
            </ul> : <p className="mt-2 text-sm text-[var(--theme-body)]">{t.noInvitations}</p>}
          </div>}
        </section>
        <div className="grid min-w-0 content-start gap-5 xl:col-start-1">
          <section className={institutionCard}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{t.verification}</h2>
              <InstitutionStatus status={org.verificationStatus} kind={org.kind} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {role === "owner" && org.verificationStatus !== "verified" && <Link className={workspaceButton} href={`/verification?institution=${org.id}&kind=${applyAs}`}>{t.request}</Link>}
              <Link className={workspaceButton} href={`/verification?institution=${org.id}&kind=representative`}>{t.representative}</Link>
            </div>
          </section>
          {manageTeam && <div className="min-w-0"><OrganizationEarlyPartners organizationId={org.id} /></div>}
          {manageTeam && <section className={institutionCard}>
            <h2 className="text-xl font-semibold">{t.activity}</h2>
            {detail.activity.length ? <ul className="mt-3 divide-y divide-[var(--theme-border)]">
              {detail.activity.map(({ event, occurredAt }, index) => <li key={`${event}-${occurredAt}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span>{t[event as keyof typeof t] ?? t.activity}</span><time dateTime={occurredAt} className="text-[var(--theme-body)]">{when(occurredAt)}</time>
              </li>)}
            </ul> : <p className="mt-2 text-[var(--theme-body)]">{t.emptyActivity}</p>}
          </section>}
        </div>
      </div>
    </div>
  );
}
