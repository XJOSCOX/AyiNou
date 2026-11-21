"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { governanceMessages } from "@/lib/governance-i18n";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionField, institutionLink } from "./institution-ui";

export function useGovernanceCommand(actor: string) {
  const active = useRef<AbortController | null>(null);
  const last = useRef<{ key: string; fingerprint: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function send(path: string, body: object, reload: () => void) {
    if (active.current) return;
    const fingerprint = JSON.stringify([path, body]);
    if (last.current?.fingerprint !== fingerprint) last.current = { fingerprint, key: crypto.randomUUID() };
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const result: { receiptId: string } = await authorizedRequest(path, {
        method: "POST", body: JSON.stringify({ ...body, confirm: true, requestId: last.current.key }),
        signal: controller.signal,
      }, actor);
      if (controller.signal.aborted) return;
      setReceipt(result.receiptId);
      last.current = null;
      reload();
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause);
      if (apiErrorCode(cause) === "STALE_VERSION") reload();
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      active.current = null;
    }
  }
  return { send, busy, error, receipt };
}

export function GovernanceFeedback({ error, receipt, next = "/admin" }: {
  error: unknown; receipt?: string | null; next?: "/admin" | "/settings";
}) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  const code = apiErrorCode(error);
  return <>
    {error != null && (code === "GOVERNANCE_REQUIRED" ? <p role="alert">{t.closed}</p>
      : ["STALE_VERSION", "IDEMPOTENCY_CONFLICT"].includes(code) ? <p role="alert">{t.stale}</p>
      : <ApiErrorNotice error={error} signIn />)}
    {code === "MFA_REQUIRED" && <Link className={institutionLink} href={`/mfa?next=${next}`}>{t.mfa}</Link>}
    {receipt && <p role="status" className="break-all text-sm">{t.receipt} · {receipt}</p>}
  </>;
}

export function GovernanceConfirmation({ reason = false, conflict = false, disabled = false }: {
  reason?: boolean; conflict?: boolean; disabled?: boolean;
}) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  return <>
    {reason && <label className="block text-sm font-semibold">{t.reason}
      <input name="reason" className={institutionField} required minLength={10} maxLength={500} disabled={disabled} />
    </label>}
    {conflict && <label className="flex items-start gap-2 text-sm">
      <input className="mt-1" type="checkbox" name="noConflict" required disabled={disabled} />{t.confirmConflict}
    </label>}
    <label className="flex items-start gap-2 text-sm">
      <input className="mt-1" type="checkbox" name="confirm" required disabled={disabled} />{t.confirm}
    </label>
  </>;
}
