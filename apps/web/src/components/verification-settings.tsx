"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import type { SavedVerificationPolicy, VerificationPolicyFlag } from "@ayinou/shared";
import { adminEntryPath } from "@/lib/admin-navigation";
import { adminMessages } from "@/lib/admin-i18n";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { institutionMessages } from "@/lib/institution-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { verificationCopy } from "@/lib/verification-policy-i18n";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "./institution-ui";
import { AdminMemberBadges } from "./admin-account-avatar";
import { adminActionPanel, adminCompactCard, adminConfirmation, adminSecondaryAction } from "./admin-controls";

const path = "/api/v1/admin/verification-policy";
const sections = {
  verificationSettings: ["personalIntake", "organizationIntake", "publicFigureIntake", "founderBlue", "founderGold", "appealsIntake"],
  rolesAssignments: ["administratorAppointments", "organizationAssignments"],
  officialBadges: ["showBlue", "showGold"],
  recognitionBadges: ["recognitionEnabled", "recognitionAwards", "recognitionPublic"],
} as const satisfies Record<string, readonly VerificationPolicyFlag[]>;

export function VerificationSettings({ section, workspaceId }: { section: keyof typeof sections; workspaceId: string }) {
  const [locale] = useLocale();
  const t = verificationCopy[locale];
  const load = useCallback((signal: AbortSignal): Promise<SavedVerificationPolicy> =>
    authorizedRequest(path, { signal, headers: { "X-Ayinou-Workspace": workspaceId } }), [workspaceId]);
  const policy = useInstitutionResource(load);
  const roles = section === "rolesAssignments";
  return <>
    <section className={roles ? adminCompactCard : institutionCard}>
      <h2 className={roles ? "border-b border-[var(--theme-border)] pb-2.5 text-lg font-semibold" : "text-xl font-semibold"}>{t.sections[section]}</h2>
      {section === "verificationSettings" && <p className="mt-2 text-sm">{t.copy.appealsHelp}</p>}
      {policy.error ? <AdminFeedback error={policy.error} retry={policy.refresh} /> : policy.data
        ? <PolicyForm key={policy.data.revision} flags={sections[section]} current={policy.data} workspaceId={workspaceId} refresh={policy.refresh} compact={roles} />
        : <p role="status">{authMessages[locale].working}</p>}
    </section>
    {section === "rolesAssignments" && <RoleAssignments workspaceId={workspaceId} />}
  </>;
}

function PolicyForm({ flags, current, workspaceId, refresh, compact }: {
  flags: readonly VerificationPolicyFlag[]; current: SavedVerificationPolicy; workspaceId: string; refresh: () => void; compact: boolean;
}) {
  const [locale] = useLocale();
  const t = verificationCopy[locale];
  const router = useRouter();
  const [value, setValue] = useState(current.value);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const request = useRef({ key: "", id: "" });
  const canSave = !busy && reason.trim().length >= 10 && flags.some((flag) => value[flag] !== current.value[flag]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const change = { value, reason: reason.trim(), expectedRevision: current.revision };
    const key = JSON.stringify(change);
    if (request.current.key !== key) request.current = { key, id: crypto.randomUUID() };
    try {
      await authorizedRequest(path, { method: "PATCH", headers: { "X-Ayinou-Workspace": workspaceId },
        body: JSON.stringify({ ...change, requestId: request.current.id }) });
      refresh();
      router.refresh();
    } catch (cause) {
      setError(cause);
      if (apiErrorCode(cause) === "STALE_VERSION") refresh();
    } finally { setBusy(false); }
  }
  return <form className={`${adminActionPanel} mt-3 max-w-5xl gap-4 ${compact ? "lg:grid-cols-2" : ""}`} onSubmit={save}>
    <fieldset disabled={busy} className={compact ? "grid content-start gap-2" : "grid gap-2 sm:grid-cols-2"}>
      {flags.map((flag) => <label key={flag} className={adminConfirmation}>
        <input type="checkbox" checked={value[flag]} onChange={(event) => setValue({ ...value, [flag]: event.target.checked })} />
        {t.flags[flag]}
      </label>)}
    </fieldset>
    <label className="max-w-lg text-sm font-semibold">{adminMessages[locale].registrationPolicy.reason}
      <textarea className={institutionField} required minLength={10} maxLength={500} value={reason}
        onChange={(event) => setReason(event.target.value)} />
    </label>
    {error != null && (compact ? <div className="col-span-full"><AdminFeedback error={error} /></div> : <AdminFeedback error={error} />)}
    <button className={`${institutionAction} justify-self-start ${compact ? "col-span-full" : ""}`} disabled={!canSave}>{t.copy.save}</button>
  </form>;
}

type Assignment = { role: string; username: string; organization?: string; status: "active" | "restricted" | "assigned" | "inactive" };

function RoleAssignments({ workspaceId }: { workspaceId: string }) {
  const [locale] = useLocale();
  const t = verificationCopy[locale];
  const load = useCallback((signal: AbortSignal): Promise<{ platform: Assignment[]; organizations: Assignment[] }> =>
    authorizedRequest("/api/v1/admin/role-assignments", { signal, headers: { "X-Ayinou-Workspace": workspaceId } }), [workspaceId]);
  const result = useInstitutionResource(load);
  const organizationRoles = institutionMessages[locale];
  const platformRoles = adminMessages[locale];
  const roleLabel = ({ role, organization }: Assignment) => {
    if (organization && ["owner", "administrator", "editor", "viewer"].includes(role)) return organizationRoles[role as "owner" | "administrator" | "editor" | "viewer"];
    if (!organization && ["founder", "administrator", "moderator", "verification_reviewer"].includes(role)) return platformRoles[role as "founder" | "administrator" | "moderator" | "verification_reviewer"];
    return role;
  };
  if (result.error != null) return <AdminFeedback error={result.error} retry={result.refresh} />;
  if (!result.data) return <p className={adminCompactCard} role="status">{authMessages[locale].working}</p>;
  const groups = [
    { title: platformRoles.navigationPlatform, items: result.data.platform, label: t.copy.governance, href: adminEntryPath("governance") },
    { title: organizationRoles.institutions, items: result.data.organizations, label: t.copy.organizations, href: "/institutions" },
  ];
  return <div className="grid min-w-0 items-start gap-3 xl:grid-cols-2">
    {groups.map(({ title, items, label, href }) => <section key={href} className={`${adminCompactCard} grid gap-2.5`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--theme-border)] pb-2.5">
        <h3 className="font-semibold">{title}</h3>
        <Link className={`${adminSecondaryAction} gap-2 text-start`} href={href}>{label}<span aria-hidden="true">↗</span></Link>
      </header>
      {items.length ? <ul className="divide-y divide-[var(--theme-border)]">
        {items.map((item, index) => <li key={JSON.stringify([item.organization, item.username, item.role, index])}
          className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div className="min-w-0 break-words">
            <p className="flex flex-wrap items-center gap-1 font-semibold"><span>@{item.username}</span><AdminMemberBadges username={item.username} /></p>
            <p className="text-[var(--theme-body)]">{item.organization && `${item.organization} · `}{roleLabel(item)}</p>
          </div>
          <span className={`rounded-md px-2 py-1 text-xs font-semibold ${item.status === "restricted" ? "bg-[var(--theme-error-bg)] text-[var(--theme-error-text)]" : "bg-[var(--theme-control)]"}`}>{t.status[item.status]}</span>
        </li>)}
      </ul> : <p className="text-sm text-[var(--theme-body)]">{t.copy.empty}</p>}
    </section>)}
  </div>;
}
