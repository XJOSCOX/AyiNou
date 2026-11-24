"use client";

import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { adminMessages } from "@/lib/admin-i18n";
import { useLocale } from "@/lib/locale-store";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionField, useInstitutionResource } from "./institution-ui";
import { adminActionPanel, adminCompactCard, adminDisclosure } from "./admin-controls";

type Setting = { enabled: boolean; revision: number; updatedAt: string };
const homepagePath = "/api/v1/admin/homepage/community-statistics";

export function HomepageSettings({ workspaceId, path = homepagePath, title }: { workspaceId: string; path?: string; title?: string }) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const heading = useId();
  const load = useCallback((signal: AbortSignal): Promise<Setting> =>
    authorizedRequest(path, { signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspaceId } }), [path, workspaceId]);
  const resource = useInstitutionResource(load);
  const [receipt, setReceipt] = useState<Setting | null>(null);
  const current = resource.data && receipt && receipt.revision > resource.data.revision ? receipt : resource.data;

  const form = resource.error ? <AdminFeedback error={resource.error} retry={resource.refresh} />
    : !current ? <p role="status" className="text-sm">{t.homepageLoading}</p>
    : <HomepageSettingForm key={current.revision} current={current} workspaceId={workspaceId} path={path} refresh={resource.refresh}
      wide={!title} onSave={(saved) => { setReceipt(saved); resource.refresh(); }} />;
  const saved = current && !resource.error && receipt?.revision === current.revision;
  const status = current && !resource.error && <span className={`rounded-md px-2 py-1 text-xs font-semibold ${current.enabled ? "bg-[var(--theme-selected)] text-[var(--theme-link)]" : "bg-[var(--theme-control)] text-[var(--theme-body)]"}`}>
    {title ? (current.enabled ? t.homepageOn : t.homepageOff) : (current.enabled ? t.homepageSavedOn : t.homepageSavedOff)}
  </span>;

  if (title) return <details className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)]">
    <summary className={adminDisclosure}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 break-words">
        {title}
        {status}
      </span>
    </summary>
    <div className="grid gap-2 border-t border-[var(--theme-border)] p-3">
      {form}
      {saved && <p className="text-sm" role="status">{t.homepageSaved}</p>}
    </div>
  </details>;

  return <section className={`${adminCompactCard} grid gap-3`} aria-labelledby={heading}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--theme-border)] pb-3">
      <div>
        <h2 id={heading} className="text-lg font-semibold">{t.homepageStatistics}</h2>
        <p className="mt-1 max-w-prose text-sm text-[var(--theme-body)]">{t.homepageStatisticsHelp}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="status">
        {status}
        {saved && <span className="text-sm">{t.homepageSaved}</span>}
      </div>
    </header>
    {form}
  </section>;
}

function HomepageSettingForm({ current, workspaceId, path, wide, onSave, refresh }: {
  current: Setting; workspaceId: string; path: string; wide: boolean; onSave: (setting: Setting) => void; refresh: () => void;
}) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const field = useId();
  const [enabled, setEnabled] = useState(current.enabled);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const retry = useRef<{ requestId: string; value: boolean; reason: string } | null>(null);
  const minimumReasonLength = 10;
  const note = reason.trim();
  const canSave = !busy && !stale && enabled !== current.enabled && note.length >= minimumReasonLength;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    if (retry.current?.value !== enabled || retry.current.reason !== note)
      retry.current = { requestId: crypto.randomUUID(), value: enabled, reason: note };
    setBusy(true);
    setError(null);
    try {
      const saved: Setting = await authorizedRequest(path, {
        method: "PATCH", headers: { "X-Ayinou-Workspace": workspaceId },
        body: JSON.stringify({ enabled, expectedRevision: current.revision, requestId: retry.current.requestId, reason: note }),
      });
      onSave(saved);
    } catch (cause) {
      setError(cause);
      if (apiErrorCode(cause) === "STALE_VERSION") { setStale(true); refresh(); }
    } finally {
      setBusy(false);
    }
  }

  const option = "flex min-h-10 min-w-0 items-center gap-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm has-[:checked]:border-[var(--theme-link)] has-[:checked]:bg-[var(--theme-selected)]";
  return <form className={`${adminActionPanel} ${wide ? "max-w-4xl sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)]" : ""}`} onSubmit={save} aria-busy={busy}>
    <fieldset className="min-w-0" disabled={busy || stale}>
      <legend className="text-sm font-semibold">{t.homepageVisibility}</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <label className={option}><input name={field} type="radio" className="accent-[var(--theme-primary)]" checked={enabled}
          onChange={() => setEnabled(true)} />{t.homepageOn}</label>
        <label className={option}><input name={field} type="radio" className="accent-[var(--theme-primary)]" checked={!enabled}
          onChange={() => setEnabled(false)} />{t.homepageOff}</label>
      </div>
    </fieldset>
    <div>
      <label className="text-sm font-semibold" htmlFor={field + "-reason"}>{t.homepageReason}</label>
      <textarea id={field + "-reason"} aria-describedby={field + "-help"}
        className={institutionField} value={reason} onChange={(event) => setReason(event.target.value)}
        rows={3} required minLength={minimumReasonLength} maxLength={500} disabled={busy || stale} />
      <p id={field + "-help"} className="mt-1 text-sm text-[var(--theme-body)]">{t.homepageReasonHelp}</p>
    </div>
    <div className="col-span-full grid gap-2">
      {error !== null && <AdminFeedback error={error} />}
      <button className={`${institutionAction} justify-self-start`} disabled={!canSave}>{t.homepageSave}</button>
    </div>
  </form>;
}
