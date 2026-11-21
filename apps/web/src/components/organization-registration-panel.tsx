"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { organizationRegistrationStatuses, type OrganizationRegistration, type OrganizationRegistrationStatus } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { organizationOnboardingMessages } from "@/lib/organization-onboarding-i18n";
import { correctRegistration, organizationSetupMessages } from "@/lib/organization-setup";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionField, institutionLink } from "./institution-ui";

export function OrganizationRegistrationPanel({ organizationId, initial, canCorrect }: {
  organizationId: string; initial: OrganizationRegistration & { locked: boolean }; canCorrect: boolean;
}) {
  const { memberId } = useMemberIdentity();
  return memberId && <RegistrationEditor key={memberId + ":" + organizationId + ":" + initial.version}
    subject={memberId} organizationId={organizationId} initial={initial} editable={canCorrect && !initial.locked} />;
}

function RegistrationEditor({ subject, organizationId, initial, editable }: {
  subject: string; organizationId: string; initial: OrganizationRegistration; editable: boolean;
}) {
  const [locale] = useLocale();
  const t = organizationSetupMessages[locale];
  const onboarding = organizationOnboardingMessages[locale];
  const [saved, setSaved] = useState(initial);
  const [selected, setSelected] = useState(initial.status);
  const [receipt, setReceipt] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const retry = useRef<{ status: OrganizationRegistrationStatus; key: string } | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === saved.status || request.current) return;
    if (retry.current?.status !== selected) retry.current = { status: selected, key: crypto.randomUUID() };
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    setReceipt(false);
    try {
      const updated = await correctRegistration(organizationId, selected, saved.version, retry.current.key, subject, controller.signal);
      if (!controller.signal.aborted) {
        setSaved(updated);
        retry.current = null;
        setReceipt(true);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const stale = ["STALE_VERSION", "IDEMPOTENCY_CONFLICT"].includes(apiErrorCode(error));
  return <div className="mt-5 grid gap-3 border-t border-[var(--theme-border)] pt-4">
    <p className="text-sm">{t.registrationHelp}</p>
    {editable ? <form className="grid gap-3 sm:flex sm:items-end" onSubmit={submit}>
      <label className="min-w-0 text-sm font-semibold">{t.registration}
        <select className={institutionField} value={selected} onChange={(event) => {
          const status = organizationRegistrationStatuses.find((candidate) => candidate === event.target.value);
          if (status) { setSelected(status); setReceipt(false); }
        }} disabled={busy}>
          {organizationRegistrationStatuses.map((status) => <option key={status} value={status}>{t.status[status]}</option>)}
        </select>
      </label>
      <button className={institutionAction} disabled={busy || stale || selected === saved.status}>{t.correct}</button>
    </form> : <p className="text-sm"><strong>{t.registration}</strong> · {t.status[saved.status]}</p>}
    {receipt && <p role="status" className="text-sm">{t.registeredSaved}</p>}
    {error !== null && (stale ? <><p role="alert">{onboarding.stale}</p>
      <button type="button" className={`${institutionLink} justify-self-start`} onClick={() => window.location.reload()}>{onboarding.refresh}</button></>
      : <ApiErrorNotice error={error} />)}
  </div>;
}
