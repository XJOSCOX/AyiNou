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
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

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
  return <>
    <section className={institutionCard}>
      <h2 className="text-xl font-semibold">{t.sections[section]}</h2>
      {section === "verificationSettings" && <p className="mt-2 text-sm">{t.copy.appealsHelp}</p>}
      {policy.error ? <AdminFeedback error={policy.error} retry={policy.refresh} /> : policy.data
        ? <PolicyForm key={policy.data.revision} flags={sections[section]} current={policy.data} workspaceId={workspaceId} refresh={policy.refresh} />
        : <p role="status">{authMessages[locale].working}</p>}
    </section>
    {section === "rolesAssignments" && <RoleAssignments workspaceId={workspaceId} />}
  </>;
}

function PolicyForm({ flags, current, workspaceId, refresh }: {
  flags: readonly VerificationPolicyFlag[]; current: SavedVerificationPolicy; workspaceId: string; refresh: () => void;
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
  return <form className="mt-3 grid gap-4" onSubmit={save}>
    <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2">
      {flags.map((flag) => <label key={flag} className="flex min-h-10 items-center gap-2">
        <input type="checkbox" checked={value[flag]} onChange={(event) => setValue({ ...value, [flag]: event.target.checked })} />
        {t.flags[flag]}
      </label>)}
    </fieldset>
    <label className="max-w-lg">{adminMessages[locale].registrationPolicy.reason}
      <textarea className={institutionField} required minLength={10} maxLength={500} value={reason}
        onChange={(event) => setReason(event.target.value)} />
    </label>
    {error != null && <AdminFeedback error={error} />}
    <button className={`${institutionAction} justify-self-start`} disabled={!canSave}>{t.copy.save}</button>
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
  return <section className={institutionCard}>
    <div className="flex flex-wrap gap-4">
      <Link className={institutionLink} href={adminEntryPath("governance")}>{t.copy.governance}</Link>
      <Link className={institutionLink} href="/institutions">{t.copy.organizations}</Link>
    </div>
    {result.error != null && <AdminFeedback error={result.error} retry={result.refresh} />}
    {result.data && <ul className="mt-3 divide-y divide-[var(--theme-border)]">
      {[...result.data.platform, ...result.data.organizations].map((item, index) =>
        <li key={index} className="py-2 text-sm">{item.organization && `${item.organization} · `}@{item.username} · {roleLabel(item)} · {t.status[item.status]}</li>)}
    </ul>}
  </section>;
}
