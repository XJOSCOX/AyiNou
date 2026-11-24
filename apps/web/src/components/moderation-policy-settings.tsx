"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { accountEnforcementCategories, ordinaryModerationCapabilities, suspensionMinutes, type ModerationPolicy, type ModerationPolicyWorkspace } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { moderationPolicyMessages } from "@/lib/moderation-policy-i18n";
import { moderationPolicyPath } from "@/lib/moderation-policy";
import { useLocale } from "@/lib/locale-store";
import { AdminFeedback } from "./admin-workspace";
import { adminActionPanel, adminCompactCard, adminConfirmation, adminDisclosure, adminSecondaryAction } from "./admin-controls";
import { institutionAction, institutionField, useInstitutionResource } from "./institution-ui";
import { ModerationPolicyChanges, formatModerationPolicyValue } from "./moderation-policy-values";

type Change = { action: "update"; value: ModerationPolicy } | { action: "restore"; restoreRevision: number };
const ceilingFields = [
  ["administratorMaxMinutes", 129600], ["moderatorMaxMinutes", 10080], ["defaultMinutes", 10080],
] as const;

export function ModerationPolicySettings({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const copy = moderationPolicyMessages[locale];
  const [pages, setPages] = useState<number[]>([]);
  const before = pages.at(-1);
  const options = useCallback(() => ({ headers: { "X-Ayinou-Workspace": workspace }, cache: "no-store" as const }), [workspace]);
  const load = useCallback((signal: AbortSignal): Promise<ModerationPolicyWorkspace> =>
    authorizedRequest(moderationPolicyPath + (before ? "?before=" + before : ""), { ...options(), signal }), [before, options]);
  const resource = useInstitutionResource(load);
  const current = resource.data;
  return <div className="grid gap-3">
    <section className={adminCompactCard}>
      <h2 className="text-xl font-semibold">{copy.title}</h2>
      <p className="mt-1 text-sm text-[var(--theme-body)]">{copy.intro}</p>
      {resource.error ? <AdminFeedback error={resource.error} retry={resource.refresh} section="moderationPolicies" />
        : !current ? <p role="status">{authMessages[locale].working}</p>
          : <PolicyEditor key={current.revision} current={current} workspace={workspace} onSave={() => {
            setPages([]); resource.refresh();
          }} pages={pages} onPage={setPages} />}
    </section>
  </div>;
}

function PolicyEditor({ current, workspace, onSave, pages, onPage }: {
  current: ModerationPolicyWorkspace; workspace: string; onSave: () => void;
  pages: number[]; onPage: (pages: number[]) => void;
}) {
  const [locale] = useLocale();
  const copy = moderationPolicyMessages[locale];
  const [draft, setDraft] = useState(current.value);
  const [restore, setRestore] = useState<{ revision: number; value: ModerationPolicy } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<{ signature: string; requestId: string } | null>(null);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const target = restore?.value ?? draft;
  const changed = (Object.keys(current.value) as (keyof ModerationPolicy)[])
    .filter((key) => JSON.stringify(current.value[key]) !== JSON.stringify(target[key]));
  const valid = target.reasonCategories.length > 0
    && target.defaultMinutes >= 1 && target.defaultMinutes <= Math.min(target.administratorMaxMinutes, target.moderatorMaxMinutes)
    && (!target.notifyStaffGuidance || target.repeatViolationGuidance.trim().length > 0);

  function edit<Key extends keyof ModerationPolicy>(key: Key, value: ModerationPolicy[Key]) {
    setDraft({ ...draft, [key]: value });
    setConfirmed(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed.length || !valid || busy || !confirmed || reason.trim().length < 10) return;
    const action: Change = restore ? { action: "restore", restoreRevision: restore.revision } : { action: "update", value: draft };
    const command = { ...action, reason: reason.trim(), expectedRevision: current.revision, confirmed: true };
    const signature = JSON.stringify(command);
    if (pending.current?.signature !== signature) pending.current = { signature, requestId: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    try {
      await authorizedRequest(moderationPolicyPath, {
        headers: { "X-Ayinou-Workspace": workspace }, method: "PATCH",
        body: JSON.stringify({ ...command, requestId: pending.current.requestId }),
      });
      onSave();
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  const revisions = current.history.slice(0, 20);
  const last = revisions.at(-1);
  const keys = (Object.keys(current.value) as (keyof ModerationPolicy)[]);
  return <>
    <p className="mt-3 text-sm font-medium" role="status">{copy.revision} {current.revision} · {date.format(new Date(current.updatedAt))}</p>
    <details className="my-3 rounded-md border border-[var(--theme-border)]">
      <summary className={adminDisclosure}>{copy.effective}</summary>
      <dl className="grid gap-2 border-t border-[var(--theme-border)] p-3 text-sm sm:grid-cols-2">
        {keys.map((key) => <div key={key}><dt className="font-semibold">{copy[key]}</dt>
          <dd className="break-words">{formatModerationPolicyValue(locale, key, current.value[key])}</dd></div>)}
      </dl>
    </details>
    <form id="moderation-policy-editor" className={adminActionPanel} onSubmit={submit} aria-busy={busy}>
      {!restore && <fieldset disabled={busy} className="grid min-w-0 gap-3">
        <legend className="sr-only">{copy.title}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {ceilingFields.map(([key, maximum]) => <label key={key} className="min-w-0 text-sm font-semibold">{copy[key]}
            <input className={institutionField} type="number" step={1} min={1} max={maximum} value={draft[key] || ""}
              onChange={(event) => edit(key, Number(event.target.value))} required />
          </label>)}
        </div>
        <PolicyOptions label={copy.suspensionPresets} entries={suspensionMinutes} selected={draft.suspensionPresets}
          onChange={(items) => edit("suspensionPresets", items)} labelFor={(value) => formatModerationPolicyValue(locale, "suspensionPresets", [value])} />
        <PolicyOptions label={copy.reasonCategories} entries={accountEnforcementCategories} selected={draft.reasonCategories}
          onChange={(items) => edit("reasonCategories", items)} labelFor={(value) => formatModerationPolicyValue(locale, "reasonCategories", [value])} />
        <PolicyOptions label={copy.delegableCapabilities} entries={ordinaryModerationCapabilities} selected={draft.delegableCapabilities}
          onChange={(items) => edit("delegableCapabilities", items)} labelFor={(value) => formatModerationPolicyValue(locale, "delegableCapabilities", [value])} />
        <label className="text-sm font-semibold">{copy.repeatViolationGuidance}
          <input className={institutionField} maxLength={500} value={draft.repeatViolationGuidance}
            onChange={(event) => edit("repeatViolationGuidance", event.target.value)} />
        </label>
        <label className={adminConfirmation}><input type="checkbox" checked={draft.notifyStaffGuidance}
          onChange={(event) => edit("notifyStaffGuidance", event.target.checked)} />{copy.notifyStaffGuidance}</label>
      </fieldset>}
      {restore && <div className="flex flex-wrap items-center gap-2" role="status">
        <p className="font-semibold">{copy.restore} {restore.revision}</p>
        <button className={adminSecondaryAction} type="button" disabled={busy} onClick={() => { setRestore(null); setConfirmed(false); }}>{copy.cancel}</button>
      </div>}
      <p className="text-sm text-[var(--theme-body)]">{copy.protectedRules}</p>
      {!valid && <p role="alert" className="text-sm text-[var(--theme-error-text)]">{copy.dependencies}</p>}
      {!!changed.length && <ModerationPolicyChanges changes={changed.map((key) => ({
        key, before: current.value[key], after: target[key],
      }))} />}
      <label className="text-sm font-semibold">{copy.reason}
        <textarea className={institutionField} rows={2} required minLength={10} maxLength={500} value={reason}
          disabled={busy} onChange={(event) => setReason(event.target.value)} />
      </label>
      <label className={adminConfirmation}><input type="checkbox" checked={confirmed} required disabled={busy}
        onChange={(event) => setConfirmed(event.target.checked)} />{copy.confirm}</label>
      {error != null && <AdminFeedback error={error} retry={onSave} section="moderationPolicies" />}
      <button className={`${institutionAction} justify-self-start`}
        disabled={!changed.length || !valid || !confirmed || busy || reason.trim().length < 10}>{copy.save}</button>
    </form>
    <h3 className="mt-5 text-lg font-semibold">{copy.history}</h3>
    {!revisions.length && <p className="mt-2 text-sm">{copy.noHistory}</p>}
    <ol className="mt-2 grid gap-2">
      {revisions.map((entry) => <li key={entry.revision}>
        <details className="rounded-md border border-[var(--theme-border)]">
          <summary className={adminDisclosure}><span>{copy.revision} {entry.revision} · {date.format(new Date(entry.occurredAt))}
            {entry.actorName && <span className="block text-xs">{entry.actorName}</span>}</span></summary>
          <div className="grid gap-2 border-t border-[var(--theme-border)] p-3 text-sm">
            <p className="break-words">{entry.reason}</p>
            {entry.restoredFrom && <p>{copy.restore} {entry.restoredFrom}</p>}
            <ModerationPolicyChanges changes={keys.filter((key) => JSON.stringify(entry.previous[key]) !== JSON.stringify(entry.value[key]))
              .map((key) => ({ key, before: entry.previous[key], after: entry.value[key] }))} />
            <a href="#moderation-policy-editor" className={adminSecondaryAction} aria-disabled={busy}
              onClick={(event) => {
                if (busy) { event.preventDefault(); return; }
                setRestore({ revision: entry.revision - 1, value: entry.previous });
                setConfirmed(false);
                setReason("");
              }}>{copy.restore} {entry.revision - 1}</a>
          </div>
        </details>
      </li>)}
    </ol>
    <div className="mt-2 flex gap-2">
      {!!pages.length && <button type="button" className={adminSecondaryAction} onClick={() => onPage(pages.slice(0, -1))}>{copy.newer}</button>}
      {current.history.length > 20 && last && <button type="button" className={adminSecondaryAction} onClick={() => onPage([...pages, last.revision])}>{copy.older}</button>}
    </div>
  </>;
}

function PolicyOptions<Value extends string | number>({ label, entries, selected, onChange, labelFor }: {
  label: string; entries: readonly Value[]; selected: Value[]; onChange: (items: Value[]) => void; labelFor: (value: Value) => string;
}) {
  return <fieldset className="min-w-0 rounded-md border border-[var(--theme-border)] p-2">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((value) => <label className="flex items-start gap-2 rounded px-2 py-1 text-sm" key={value}>
        <input className="mt-0.5 size-4 shrink-0 accent-[var(--theme-primary)]" type="checkbox" checked={selected.includes(value)}
          onChange={(event) => onChange(event.target.checked ? [...selected, value].sort() : selected.filter((item) => item !== value))} />
        {labelFor(value)}
      </label>)}
    </div>
  </fieldset>;
}
