"use client";

import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { adminMessages } from "@/lib/admin-i18n";
import { useLocale } from "@/lib/locale-store";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "./institution-ui";

type Setting = { enabled: boolean; revision: number; updatedAt: string };
const homepagePath = "/api/v1/admin/homepage/community-statistics";

export function HomepageSettings({ workspaceId, path = homepagePath, title, help }: { workspaceId: string; path?: string; title?: string; help?: string }) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const heading = useId();
  const load = useCallback((signal: AbortSignal): Promise<Setting> =>
    authorizedRequest(path, { signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspaceId } }), [path, workspaceId]);
  const resource = useInstitutionResource(load);
  const [receipt, setReceipt] = useState<Setting | null>(null);
  const current = resource.data && receipt && receipt.revision > resource.data.revision ? receipt : resource.data;

  return <section className={institutionCard} aria-labelledby={heading}>
    <h2 id={heading} className="text-xl font-semibold">{title ?? t.homepageStatistics}</h2>
    {(help || !title) && <p className="mt-1 max-w-prose text-sm text-[var(--theme-body)]">{help ?? t.homepageStatisticsHelp}</p>}
    {resource.error ? <div className="mt-3"><AdminFeedback error={resource.error} retry={resource.refresh} /></div>
      : !current ? <p role="status" className="mt-3">{t.homepageLoading}</p>
      : <>
        <p className="mt-4 font-semibold" role="status">
          {current.enabled ? t.homepageSavedOn : t.homepageSavedOff}
          {receipt?.revision === current.revision && <span className="ms-2 text-sm font-normal">{t.homepageSaved}</span>}
        </p>
        <HomepageSettingForm key={current.revision} current={current} workspaceId={workspaceId} path={path} refresh={resource.refresh}
          onSave={(saved) => { setReceipt(saved); resource.refresh(); }} />
      </>}
  </section>;
}

function HomepageSettingForm({ current, workspaceId, path, onSave, refresh }: {
  current: Setting; workspaceId: string; path: string; onSave: (setting: Setting) => void; refresh: () => void;
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

  return <form className="mt-4 grid max-w-lg gap-4" onSubmit={save} aria-busy={busy}>
    <fieldset disabled={busy || stale}>
      <legend className="text-sm font-semibold">{t.homepageVisibility}</legend>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex min-h-10 items-center gap-2"><input name={field} type="radio" checked={enabled}
          onChange={() => setEnabled(true)} />{t.homepageOn}</label>
        <label className="flex min-h-10 items-center gap-2"><input name={field} type="radio" checked={!enabled}
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
    {error !== null && <AdminFeedback error={error} />}
    <button className={`${institutionAction} justify-self-start`} disabled={!canSave}>
      {t.homepageSave}
    </button>
  </form>;
}
