"use client";

import { exportCategories, type ExportStatus, type Locale, type PrivacyRequestSummary } from "@ayinou/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiErrorCode } from "@/lib/api-errors";
import { localizedApiError } from "@/lib/error-i18n";
import { exportMessages } from "@/lib/privacy-export-i18n";
import { ownPrivacyRequest, privacyExportDownload } from "@/lib/privacy-session";

const button = "min-h-11 rounded-md border border-[var(--theme-button-border)] bg-[var(--theme-button)] px-3 py-2 text-sm disabled:opacity-60";
const artifactPath = "/api/v1/me/privacy-exports/";
const disabledError = (cause: unknown) => ["PRIVACY_EXPORT_DISABLED", "PRIVACY_DISABLED"].includes(apiErrorCode(cause));

export function PrivacyExportPanel({ actor, locale, item }: { actor: string; locale: Locale; item: PrivacyRequestSummary }) {
  const t = exportMessages[locale];
  const path = "/api/v1/me/privacy-requests/" + item.id + "/export";
  const [status, setStatus] = useState<ExportStatus | "disabled" | null>(null);
  const [fault, setFault] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [generateKey, setGenerateKey] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const revokeKey = useRef<string>(null);
  const url = useRef<string>(null);

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    ownPrivacyRequest<ExportStatus>(actor, path, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setStatus(value); })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (disabledError(cause)) setStatus("disabled");
        else setFault(cause);
      }).finally(() => { if (pending.current === controller) pending.current = null; });
    return () => {
      pending.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, [actor, path]);

  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setFault(null);
    try { await operation(controller.signal); } catch (cause) {
      if (controller.signal.aborted) return;
      if (disabledError(cause)) setStatus("disabled");
      else {
        if (apiErrorCode(cause) === "UNAUTHORIZED") setStatus(null);
        setFault(cause);
      }
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function refresh(signal: AbortSignal) {
    const value = await ownPrivacyRequest<ExportStatus>(actor, path, { signal });
    signal.throwIfAborted();
    setStatus(value);
  }

  function generate() {
    void run(async (signal) => {
      const key = generateKey ?? crypto.randomUUID();
      setGenerateKey(key);
      const value = await ownPrivacyRequest<ExportStatus>(actor, path, {
        method: "POST", body: JSON.stringify({ version: item.version }),
        headers: { "Idempotency-Key": key }, signal,
      });
      signal.throwIfAborted();
      setStatus(value);
    });
  }

  function revoke(id: string) {
    void run(async (signal) => {
      revokeKey.current ??= crypto.randomUUID();
      const value = await ownPrivacyRequest<ExportStatus>(actor, artifactPath + id + "/revoke", {
        method: "POST", body: "{}", headers: { "Idempotency-Key": revokeKey.current }, signal,
      });
      signal.throwIfAborted();
      setStatus(value);
      setConfirm(false);
    });
  }

  function download(id: string) {
    void run(async (signal) => {
      const file = await privacyExportDownload(actor, id, signal);
      signal.throwIfAborted();
      if (url.current) URL.revokeObjectURL(url.current);
      const localUrl = URL.createObjectURL(file);
      url.current = localUrl;
      const link = document.createElement("a");
      link.href = localUrl;
      link.download = "ayinou-synthetic-export.json";
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(localUrl);
        if (url.current === localUrl) url.current = null;
      }, 1_000);
      await refresh(signal);
    });
  }

  const code = apiErrorCode(fault);
  const runStatus = status && status !== "disabled" && status.state !== "none" ? status : null;
  return <section className="grid min-w-0 gap-2 border-t border-[var(--theme-border)] py-3">
    <h4 className="font-semibold">{t.title}</h4>
    {status === "disabled" ? <p>{t.disabled}</p> : <>
      {fault ? <p role="alert" className="text-[var(--theme-error-text)]">
        {code === "EXPORT_CHANGED" ? t.changed : code === "EXPORT_CONFLICT" ? t.conflict :
          code === "EXPORT_EXPIRED" ? t.state.expired : code === "EXPORT_RETRY" ? t.failure :
          localizedApiError(locale, fault)}
      </p> : null}
      {code === "MFA_REQUIRED" && <Link className="text-[var(--theme-link)] underline"
        href="/mfa?next=%2Fsettings%2Fprivacy-requests">{t.verify}</Link>}
      {status && <p role="status">{t.state[status.state]}</p>}
      {!status && !fault && <p role="status">{t.loading}</p>}
      {runStatus?.state === "available" && <p>
        {t.expires} <time dateTime={runStatus.expiresAt}>{new Date(runStatus.expiresAt).toLocaleString(locale)}</time>
      </p>}
      {runStatus?.counts && <dl className="grid gap-1 sm:grid-cols-2">
        {exportCategories.map((category) => <div key={category} className="flex flex-wrap gap-2 text-sm">
          <dt>{t.categories[category]}</dt><dd>{Math.min(runStatus.counts![category], 100)}</dd>
        </div>)}
      </dl>}
      {status && <p className="text-sm text-[var(--theme-body)]">{t.limited}</p>}
      <div className="flex flex-wrap gap-2">
        {item.state === "received" && (status?.state === "none" ||
          (generateKey && ["failed_retryable", "generating"].includes(runStatus?.state ?? ""))) &&
          <button className={button} type="button" disabled={busy} onClick={generate}>{t.generate}</button>}
        {item.state === "received" && runStatus?.canDownload &&
          <button className={button} type="button" disabled={busy} onClick={() => download(runStatus.id)}>{t.download}</button>}
        {runStatus && ["generating", "available", "failed_retryable"].includes(runStatus.state) && !confirm &&
          <button className={button} type="button" disabled={busy} onClick={() => setConfirm(true)}>{t.revoke}</button>}
        {confirm && runStatus && <>
          <button className={button} type="button" disabled={busy} onClick={() => revoke(runStatus.id)}>{t.confirm}</button>
          <button className={button} type="button" disabled={busy} onClick={() => setConfirm(false)}>{t.cancel}</button>
        </>}
        <button className={button} type="button" disabled={busy} onClick={() => void run(refresh)}>{t.refresh}</button>
      </div>
    </>}
  </section>;
}
