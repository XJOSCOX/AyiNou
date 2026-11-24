"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import type { SignupPath } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { adminMessages } from "@/lib/admin-i18n";
import { accountMessages } from "@/lib/account-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { organizationOnboardingMessages } from "@/lib/organization-onboarding-i18n";
import { useLocale } from "@/lib/locale-store";
import type { RegistrationPolicy } from "@/lib/registration";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "./institution-ui";
import { adminActionPanel, adminConfirmation } from "./admin-controls";

type SavedPolicy = RegistrationPolicy & { revision: number; updatedAt: string; rewardsEnabled: false };
const endpoint = "/api/v1/admin/registration";
const flags = ["enabled", "individualEnabled", "organizationEnabled", "referralsEnabled"] as const;
const modes = ["public", "invitation_only", "closed"] as const;
const minReason = 10;

export function RegistrationSettings({ workspaceId }: { workspaceId: string }) {
  const [locale] = useLocale();
  const t = adminMessages[locale].registrationPolicy;
  const headers = useCallback(() => ({ "X-Ayinou-Workspace": workspaceId }), [workspaceId]);
  const load = useCallback((signal: AbortSignal): Promise<SavedPolicy> =>
    authorizedRequest(endpoint, { headers: headers(), signal, cache: "no-store" }), [headers]);
  const resource = useInstitutionResource(load);
  const [saved, setSaved] = useState<SavedPolicy>();
  const current = !resource.data || !saved || resource.data.revision >= saved.revision ? resource.data : saved;

  return <section className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.title}</h2>
    <p className="mt-2 max-w-prose text-sm text-[var(--theme-body)]">{t.help}</p>
    {resource.error ? <div className="mt-4"><AdminFeedback error={resource.error} retry={resource.refresh} /></div>
      : !current ? <p role="status">{authMessages[locale].working}</p>
      : <RegistrationForm key={current.revision} current={current} workspaceId={workspaceId}
        refresh={resource.refresh} onSave={(result) => { setSaved(result); resource.refresh(); }} />}
  </section>;
}

function RegistrationForm({ current, workspaceId, onSave, refresh }: {
  current: SavedPolicy; workspaceId: string; onSave: (result: SavedPolicy) => void; refresh: () => void;
}) {
  const [locale] = useLocale();
  const t = adminMessages[locale].registrationPolicy;
  const [value, setValue] = useState<RegistrationPolicy>({
    enabled: current.enabled, mode: current.mode, individualEnabled: current.individualEnabled,
    organizationEnabled: current.organizationEnabled, referralsEnabled: current.referralsEnabled,
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const retry = useRef({ body: "", requestId: "" });
  const dirty = value.mode !== current.mode || flags.some((key) => value[key] !== current[key]);
  const options = { headers: { "X-Ayinou-Workspace": workspaceId } };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || busy || reason.trim().length < minReason) return;
    setBusy(true);
    setError(null);
    const command = { action: "update", expectedRevision: current.revision, reason: reason.trim(), value };
    const body = JSON.stringify(command);
    if (retry.current.body !== body) retry.current = { body, requestId: crypto.randomUUID() };
    try {
      onSave(await authorizedRequest(endpoint, {
        ...options, method: "PATCH", body: JSON.stringify({ ...command, requestId: retry.current.requestId }),
      }));
    } catch (cause) {
      setError(cause);
      if (apiErrorCode(cause) === "STALE_VERSION") refresh();
    } finally { setBusy(false); }
  }

  return <>
    <p className="mt-3 text-sm" role="status">{t.savedMode} · {t[current.mode]} · {t.revision} {current.revision}</p>
    <form className={`${adminActionPanel} mt-4 max-w-2xl gap-4`} onSubmit={save} aria-busy={busy}>
      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="sr-only">{t.title}</legend>
        <label className={adminConfirmation}><input type="checkbox" checked={value.enabled}
          onChange={(event) => setValue({ ...value, enabled: event.target.checked })} />{t.enabled}</label>
        <label>{t.mode}<select className={institutionField} value={value.mode} onChange={(event) =>
          setValue({ ...value, mode: event.target.value as RegistrationPolicy["mode"] })}>
          {modes.map((mode) => <option key={mode} value={mode}>{t[mode]}</option>)}
        </select></label>
        {(["individualEnabled", "organizationEnabled"] as const).map((key) => <label key={key} className={adminConfirmation}>
          <input type="checkbox" checked={value[key]} onChange={(event) => setValue({ ...value, [key]: event.target.checked })} />{t[key]}
        </label>)}
      </fieldset>
      <fieldset className="border-t border-[var(--theme-border)] pt-2" disabled={busy}>
        <legend className="font-semibold">{accountMessages[locale].referrals}</legend>
        <label className={adminConfirmation}><input type="checkbox" checked={value.referralsEnabled}
          onChange={(event) => setValue({ ...value, referralsEnabled: event.target.checked })} />{t.referralsEnabled}</label>
        <p className="text-sm text-[var(--theme-body)]">{t.rewardsOff}</p>
      </fieldset>
      <label>{t.reason}<textarea className={institutionField} value={reason} onChange={(event) => setReason(event.target.value)}
        required minLength={minReason} maxLength={500} disabled={busy} /></label>
      {error !== null && <AdminFeedback error={error} />}
      <button className={`${institutionAction} justify-self-start`} disabled={!dirty || busy || reason.trim().length < minReason}>{t.save}</button>
    </form>
    {current.enabled && current.mode === "invitation_only" && (current.individualEnabled || current.organizationEnabled) &&
      <RegistrationInvitation current={current} workspaceId={workspaceId} />}
  </>;
}

function RegistrationInvitation({ current, workspaceId }: { current: SavedPolicy; workspaceId: string }) {
  const [locale] = useLocale();
  const t = adminMessages[locale].registrationPolicy;
  const signup = organizationOnboardingMessages[locale];
  const [pathway, setPathway] = useState<SignupPath>(current.individualEnabled ? "individual" : "organization");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [issued, setIssued] = useState<{ code: string; expiresAt: string }>();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const retry = useRef({ body: "", requestId: "", code: "" });

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || reason.trim().length < minReason) return;
    setCopied(false);
    setCopyFailed(false);
    setIssued(undefined);
    setBusy(true);
    setError(null);
    const command = { action: "invite", expectedRevision: current.revision, email: email.trim(), pathway, reason: reason.trim() };
    const body = JSON.stringify(command);
    if (retry.current.body !== body) {
      retry.current = {
        body, requestId: crypto.randomUUID(),
        code: Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, "0")).join(""),
      };
    }
    const { requestId, code } = retry.current;
    try {
      const result: { expiresAt: string } = await authorizedRequest(endpoint + "/invitations", {
        headers: { "X-Ayinou-Workspace": workspaceId }, method: "POST",
        body: JSON.stringify({ ...command, requestId, code }),
      });
      setIssued({ code, expiresAt: result.expiresAt });
      retry.current = { body: "", requestId: "", code: "" };
      setEmail("");
      setReason("");
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  return <section className="mt-6 border-t border-[var(--theme-border)] pt-5">
    <h3 className="text-lg font-semibold">{t.invite}</h3>
    <p className="mt-2 max-w-prose text-sm text-[var(--theme-body)]">{t.inviteHelp}</p>
    <form className={`${adminActionPanel} mt-3 max-w-2xl`} onSubmit={issue} aria-busy={busy}>
      <label>{t.email}<input className={institutionField} type="email" autoComplete="off" maxLength={254} required
        value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
      <label>{signup.choice}<select className={institutionField} value={pathway} disabled={busy}
        onChange={(event) => setPathway(event.target.value as SignupPath)}>
        {current.individualEnabled && <option value="individual">{signup.individual}</option>}
        {current.organizationEnabled && <option value="organization">{signup.organization}</option>}
      </select></label>
      <label>{t.reason}<textarea className={institutionField} value={reason} onChange={(event) => setReason(event.target.value)}
        required minLength={minReason} maxLength={500} disabled={busy} /></label>
      {error !== null && <AdminFeedback error={error} />}
      <button className={`${institutionAction} justify-self-start`} disabled={busy || reason.trim().length < minReason}>{t.issue}</button>
    </form>
    {issued && <div className="mt-4 grid justify-items-start gap-2">
      <p role="status">{t.expires} · <time dateTime={issued.expiresAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(issued.expiresAt))}</time></p>
      <code className="max-w-full break-all rounded-md bg-[var(--theme-control)] p-2">{issued.code}</code>
      <button type="button" className={institutionAction} onClick={() => {
        void navigator.clipboard.writeText(issued.code).then(() => setCopied(true)).catch(() => setCopyFailed(true));
      }}>{t.copy}</button>
      {(copied || copyFailed) && <p role="status">{copied ? accountMessages[locale].copied : accountMessages[locale].shareFailed}</p>}
    </div>}
  </section>;
}
