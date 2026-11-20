"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { futureOrganizationPermissions, organizationPermissions, protectedOrganizationPermissions,
  type OrganizationCustomRole, type OrganizationPermission, type OrganizationRoleWorkspace } from "@ayinou/shared";
import { affiliationMessages } from "@/lib/affiliation-i18n";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { saveInstitution } from "@/lib/institution-api";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { assignOrganizationRole, deactivateOrganizationRole, loadOperationalOrganizations, loadOrganizationRoles,
  revokeOrganizationRole, saveOrganizationRole } from "@/lib/organization-role-api";
import { organizationRoleMessages } from "@/lib/organization-role-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const affiliationPermissions: OrganizationPermission[] = ["affiliations.manage", "affiliations.review", "affiliations.invite"];

function RoleFeedback({ organization, error, refresh }: { organization: string; error: unknown; refresh: () => void }) {
  const [locale] = useLocale();
  if (error === null) return null;
  return <div className="grid gap-2">
    <ApiErrorNotice error={error} retry={refresh} signIn />
    {apiErrorCode(error) === "MFA_REQUIRED" && <Link className={institutionLink}
      href={`/mfa?next=${encodeURIComponent(`/institutions/${organization}/roles`)}`}>{organizationRoleMessages[locale].verify}</Link>}
  </div>;
}

export function OperationalOrganizations() {
  const [locale] = useLocale();
  const t = organizationRoleMessages[locale];
  const resource = useInstitutionResource(loadOperationalOrganizations);
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} />;
  if (!resource.data?.organizations.length) return null;
  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.delegatedWork}</h2>
    <ul className="mt-2 grid gap-2">{resource.data.organizations.map((org) => <li key={org.id} className="min-w-0">
      <Link className={`${institutionLink} break-words`} href={`/institutions/${org.id}/roles`}>{org.name}</Link>
    </li>)}</ul>
  </section>;
}

export function OrganizationRolesScreen({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = organizationRoleMessages[locale];
  const fixed = institutionMessages[locale];
  const [username, setUsername] = useState("");
  const load = useCallback((signal: AbortSignal) => loadOrganizationRoles(id, username, signal), [id, username]);
  const resource = useInstitutionResource(load);
  const data = resource.data;
  return <MemberShell><div className="grid min-w-0 gap-4">
    <header>
      {data?.foundation ? <Link href={`/institutions/${id}`} className={institutionLink}>{fixed.institutionProfile}</Link>
        : <Link className={institutionLink} href="/institutions">{fixed.institutions}</Link>}
      <h1 className="mt-2 break-words text-3xl font-semibold sm:text-4xl">{t.title}</h1>
      {data && <p className="mt-2 break-words font-semibold">{data.organization.name}</p>}
      {data && affiliationPermissions.some((permission) => data.permissions.includes(permission)) &&
        <Link className={`${institutionLink} mt-2 inline-block`} href={`/institutions/${id}/affiliations`}>{affiliationMessages[locale].management}</Link>}
    </header>
    <RoleFeedback organization={id} error={resource.error} refresh={resource.refresh} />
    {!data && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
    {data && <>
      <details className={institutionCard} open>
        <summary className="cursor-pointer font-semibold">{t.permissionDetails}</summary>
        <p className="mt-2 text-sm">{t.permissionHelp}</p>
        {data.foundation && <p className="mt-2 text-sm">{t.foundation} · {fixed[data.foundation]}</p>}
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {organizationPermissions.map((key) => <div key={key} className="min-w-0 border-t border-[var(--theme-border)] pt-2 text-sm">
            <dt className="font-semibold">{t.capabilities[key].label}</dt>
            <dd className="text-[var(--theme-body)]">{t.capabilities[key].detail}</dd>
            <dd>{data.permissions.includes(key) ? t.effective : t.notGranted}</dd>
          </div>)}
        </dl>
        <p className="mt-4 text-sm"><strong>{t.reserved}</strong> · {protectedOrganizationPermissions.map((key) => t.protected[key]).join(", ")}</p>
        <p className="mt-2 text-sm"><strong>{t.future}</strong> · {futureOrganizationPermissions.map((key) => t.planned[key]).join(", ")}</p>
      </details>
      {data.permissions.includes("content.edit") && (data.foundation === null || data.foundation === "viewer") &&
        <DelegatedContent data={data} refresh={resource.refresh} />}
      <section className={institutionCard}>
        <h2 className="text-xl font-semibold">{t.customRoles}</h2>
        <p className="mt-2 text-sm">{t.roleHelp}</p>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {data.canEditRoles && <RoleForm id={id} role={null} refresh={resource.refresh} />}
          {data.roles.map((role) => <article key={role.id} className="min-w-0 rounded-md border border-[var(--theme-border)] p-3">
            <h3 className="break-words font-semibold" dir="auto">{role.name}</h3>
            <p className="mt-1 text-xs">{role.deactivatedAt ? t.inactive : role.assignedToMe ? t.assignedToMe : t.active}</p>
            {role.description && <p className="mt-2 whitespace-pre-line break-words text-sm" dir="auto">{role.description}</p>}
            <p className="mt-2 text-sm">{role.permissions.map((key) => t.capabilities[key].label).join(" · ")}</p>
            {data.canEditRoles && !role.deactivatedAt && <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">{t.edit}</summary>
              <RoleForm key={role.version} id={id} role={role} refresh={resource.refresh} />
            </details>}
          </article>)}
        </div>
        {!data.roles.length && <p className="mt-3 text-sm">{t.noRoles}</p>}
      </section>
      {(data.canViewTeam || data.canAssign) && <section className={institutionCard}>
        <h2 className="text-xl font-semibold">{t.team}</h2>
        <form className="my-3 flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          setUsername(field(new FormData(event.currentTarget), "username").toLowerCase());
        }}>
          <label className="min-w-0 text-sm font-semibold">{t.searchUsername}
            <input name="username" className={institutionField} autoCapitalize="none" spellCheck={false} maxLength={24} />
          </label>
          <button className={institutionAction}>{t.search}</button>
        </form>
        {data.team.length ? <ul className="grid gap-2">{data.team.map((member) => <TeamMember key={member.id}
          data={data} member={member} refresh={resource.refresh} />)}</ul> : <p className="text-sm">{username || data.canViewTeam ? t.noTeam : t.lookupRequired}</p>}
      </section>}
      {data.canEditRoles && <section className={institutionCard}>
        <h2 className="text-xl font-semibold">{t.history}</h2>
        {data.activity.length ? <ul className="mt-2 grid gap-3">{data.activity.map((event) => <li key={event.id} className="border-t border-[var(--theme-border)] pt-2 text-sm">
          <p className="break-words font-medium">{t.events[event.event]} · {event.after?.name ?? data.roles.find((r) => r.id === event.roleId)?.name ?? t.unknown}</p>
          <p className="text-[var(--theme-body)]">
            {event.actor ? `@${event.actor} · ` : ""}{event.subject ? `@${event.subject} · ` : ""}
            <time dateTime={event.occurredAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</time>
          </p>
          {event.before && <p>{t.before} · {event.before.permissions.map((key) => t.capabilities[key].label).join(", ")}</p>}
          {event.after && <p>{t.after} · {event.after.permissions.map((key) => t.capabilities[key].label).join(", ")}</p>}
        </li>)}</ul> : <p className="mt-2 text-sm">{t.noActivity}</p>}
      </section>}
    </>}
  </div></MemberShell>;
}

function DelegatedContent({ data, refresh }: { data: OrganizationRoleWorkspace; refresh: () => void }) {
  const [locale] = useLocale();
  const t = organizationRoleMessages[locale];
  const mutation = useFeedMutation();
  const [saved, setSaved] = useState(false);
  return <section className={institutionCard}>
    <form className="grid max-w-xl gap-2" onSubmit={(event) => {
      event.preventDefault();
      const description = field(new FormData(event.currentTarget), "description");
      void mutation.run(async () => { await saveInstitution(data.organization.id, { description: description || null }); setSaved(true); refresh(); });
    }}>
      <label className="text-sm font-semibold">{institutionMessages[locale].description}
        <textarea className={institutionField} name="description" rows={4} maxLength={600} defaultValue={data.organization.description ?? ""} />
      </label>
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.save}</button>
    </form>
    {saved && <p role="status">{t.saved}</p>}
    <RoleFeedback organization={data.organization.id} error={mutation.error} refresh={refresh} />
  </section>;
}

function RoleForm({ id, role, refresh }: { id: string; role: OrganizationCustomRole | null; refresh: () => void }) {
  const [locale] = useLocale();
  const t = organizationRoleMessages[locale];
  const mutation = useFeedMutation();
  const [confirm, setConfirm] = useState(false);
  const [permissions, setPermissions] = useState<OrganizationPermission[]>(role?.permissions ?? []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void mutation.run(async () => {
      await saveOrganizationRole(id, role, { name: field(fields, "name"), description: field(fields, "description") || null, permissions });
      if (!role) { form.reset(); setPermissions([]); }
      refresh();
    });
  }
  return <form onSubmit={submit} className="grid min-w-0 gap-2 rounded-md border border-[var(--theme-border)] p-3">
    <label className="text-sm font-semibold">{t.name}
      <input name="name" className={institutionField} minLength={2} maxLength={64} defaultValue={role?.name} required />
    </label>
    <label className="text-sm font-semibold">{t.description}
      <textarea name="description" className={institutionField} maxLength={300} rows={2} defaultValue={role?.description ?? ""} />
    </label>
    <fieldset className="grid min-w-0 gap-2 py-1">
      <legend className="text-sm font-semibold">{t.permissionDetails}</legend>
      {organizationPermissions.map((key) => <label key={key} className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={permissions.includes(key)} onChange={(event) => {
          const checked = event.target.checked;
          setPermissions((current) => checked ? [...current, key] : current.filter((item) => item !== key));
        }} />
        {t.capabilities[key].label}
      </label>)}
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <button className={institutionAction} disabled={mutation.busy || !permissions.length}>{role ? t.save : t.create}</button>
      {role && (confirm ? <>
        <p className="basis-full text-sm">{t.confirmDeactivate}</p>
        <button type="button" className={institutionAction} disabled={mutation.busy}
          onClick={() => { void mutation.run(async () => { await deactivateOrganizationRole(id, role); refresh(); }); }}>{t.deactivate}</button>
        <button type="button" className={institutionLink} onClick={() => setConfirm(false)}>{t.cancel}</button>
      </> : <button type="button" className={institutionLink} onClick={() => setConfirm(true)}>{t.deactivate}</button>)}
    </div>
    <RoleFeedback organization={id} error={mutation.error} refresh={refresh} />
  </form>;
}

function TeamMember({ data, member, refresh }: { data: OrganizationRoleWorkspace; member: OrganizationRoleWorkspace["team"][number]; refresh: () => void }) {
  const [locale] = useLocale();
  const t = organizationRoleMessages[locale];
  const id = data.organization.id;
  const mutation = useFeedMutation();
  const choices = data.roles.filter((role) => role.canDelegate && !member.assignments.some((grant) => grant.roleId === role.id));
  return <li className="min-w-0 rounded-md border border-[var(--theme-border)] p-3">
    <p className="break-words font-semibold">{member.displayName ?? t.unknown}{member.username && ` · @${member.username}`}</p>
    <p className="text-sm">{member.foundation ? institutionMessages[locale][member.foundation] : t.affiliated}</p>
    <ul className="mt-2 grid gap-1">{member.assignments.map((grant) => {
      const role = data.roles.find((entry) => entry.id === grant.roleId);
      return role && <li key={grant.id} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="break-words" dir="auto">{role.name}</span>
        {member.assignable && role.canDelegate && <button type="button" className={institutionLink} disabled={mutation.busy}
          onClick={() => { void mutation.run(async () => { await revokeOrganizationRole(id, role, grant.id); refresh(); }); }}>{t.revoke}</button>}
      </li>;
    })}</ul>
    {member.assignable && choices.length > 0 && <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const role = choices.find((entry) => entry.id === field(new FormData(form), "role"));
      if (role) void mutation.run(async () => { await assignOrganizationRole(id, role, member.id); form.reset(); refresh(); });
    }}>
      <label className="min-w-0 text-sm font-semibold">{t.assignment}
        <select name="role" className={institutionField} required>
          <option value="">{t.chooseRole}</option>
          {choices.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </label>
      <button className={institutionAction} disabled={mutation.busy}>{t.assign}</button>
    </form>}
    <RoleFeedback organization={id} error={mutation.error} refresh={refresh} />
  </li>;
}
