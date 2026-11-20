"use client";

import type { LifecycleSummary, Locale, PrivacyRequestSummary } from "@ayinou/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiErrorCode } from "@/lib/api-errors";
import { localizedApiError } from "@/lib/error-i18n";
import { lifecycleMessages } from "@/lib/privacy-lifecycle-i18n";
import { ownPrivacyRequest } from "@/lib/privacy-session";

const button = "min-h-11 rounded-md border border-[var(--theme-button-border)] bg-[var(--theme-button)] px-3 py-2 text-sm disabled:opacity-60";

export function PrivacyLifecyclePanel({ actor, locale, item }: { actor: string; locale: Locale; item: PrivacyRequestSummary }) {
  const t = lifecycleMessages[locale];
  const path = "/api/v1/me/privacy-requests/" + item.id + "/deletion-";
  const [summary, setSummary] = useState<LifecycleSummary | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<unknown>(null);
  const pending = useRef<AbortController | null>(null);
  const planKey = useRef<string>(null);
  const confirmKey = useRef<string>(null);

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    ownPrivacyRequest<LifecycleSummary>(actor, path + "preview", { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setSummary(result);
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (["LIFECYCLE_DISABLED", "PRIVACY_DISABLED"].includes(apiErrorCode(cause))) setDisabled(true);
      else setFault(cause);
    }).finally(() => { if (pending.current === controller) pending.current = null; });
    return () => pending.current?.abort();
  }, [actor, path]);

  async function update(action: "status" | "plan" | "confirmation") {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setFault(null);
    try {
      const init: RequestInit = { signal: controller.signal };
      if (action !== "status") {
        const intent = action === "plan" ? planKey : confirmKey;
        intent.current ??= crypto.randomUUID();
        init.method = "POST";
        init.headers = { "Idempotency-Key": intent.current };
        init.body = JSON.stringify({ caseVersion: item.version, ...(action === "confirmation" && { planVersion: summary?.planVersion }) });
      }
      const result = await ownPrivacyRequest<LifecycleSummary>(actor, path + action, init);
      controller.signal.throwIfAborted();
      setSummary(result);
      if (action === "plan") { planKey.current = null; confirmKey.current = null; }
    } catch (cause) {
      if (!controller.signal.aborted) {
        const code = apiErrorCode(cause);
        if (["LIFECYCLE_DISABLED", "PRIVACY_DISABLED"].includes(code)) setDisabled(true);
        else {
          if (code === "UNAUTHORIZED") setSummary(null);
          setFault(cause);
        }
      }
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const code = apiErrorCode(fault);
  return <section className="grid min-w-0 gap-2 border-t border-[var(--theme-border)] py-3">
    <h4 className="font-semibold">{t.title}</h4>
    {disabled ? <p>{t.disabled}</p> : <>
      <p className="text-sm text-[var(--theme-body)]">{t.synthetic}</p>
      {fault ? <p role="alert" className="text-[var(--theme-error-text)]">
        {code === "LIFECYCLE_CONFLICT" ? t.changed : localizedApiError(locale, fault)}
      </p> : null}
      {code === "MFA_REQUIRED" && <Link className="text-[var(--theme-link)] underline"
        href="/mfa?next=%2Fsettings%2Fprivacy-requests">{t.verify}</Link>}
      {summary ? <>
        <p role="status">{t.state[summary.state]}</p>
        {summary.warnings.length > 0 && <ul className="list-disc space-y-1 ps-5 text-sm">
          {summary.warnings.map((warning) => <li key={warning}>{t.warning[warning]}</li>)}
        </ul>}
        {summary.receipt && <p className="break-all text-sm">{t.receipt} {summary.receipt}</p>}
        {summary.state === "partial" && <p className="text-sm">{t.checkedSteps.replace("{count}", String(summary.verifiedSteps))}</p>}
      </> : !fault && <p role="status">{t.loading}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => void update("status")}>{t.refresh}</button>
        {summary && (!summary.receipt || summary.state === "stale") &&
          <button type="button" className={button} disabled={busy} onClick={() => void update("plan")}>{t.save}</button>}
        {summary?.state === "review_required" && !summary.confirmed && summary.planVersion !== null &&
          <button type="button" className={button} disabled={busy} onClick={() => void update("confirmation")}>{t.confirm}</button>}
      </div>
    </>}
  </section>;
}
