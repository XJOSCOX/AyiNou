"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import {
  featureScopes, suspensionMinutes, type ModerationPolicy,
  type FeatureCapability, type FeatureCommand, type FeatureEnforcementCase, type FeatureEnforcementPage, type FeatureScope,
} from "@ayinou/shared";
import { accountMessages } from "@/lib/account-i18n";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { adminMessages } from "@/lib/admin-i18n";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { featureMessages } from "@/lib/feature-enforcement-i18n";
import { loadModerationActionPolicy } from "@/lib/moderation-policy";
import { moderationPolicyMessages } from "@/lib/moderation-policy-i18n";
import { useLocale } from "@/lib/locale-store";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionField, useInstitutionResource } from "./institution-ui";
import { AdminMemberBadges } from "./admin-account-avatar";
import { adminActionPanel, adminCompactCard, adminConfirmation, adminDangerAction, adminSecondaryAction } from "./admin-controls";

const endpoint = "/api/v1/moderation/feature-enforcement";
const presets = ["hours1", "hours24", "days3", "days7", "days30", "days90"] as const;

export function FeatureEnforcementPanel({ workspace, delegate = false }: { workspace: string; delegate?: boolean }) {
  const [locale] = useLocale();
  const t = featureMessages[locale], admin = adminMessages[locale];
  const [q, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [edit, setEdit] = useState<{ record: FeatureEnforcementCase; action: FeatureCommand } | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages.at(-1);
  const load = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({ q });
    if (subject) params.set("subject", subject);
    if (cursor) params.set("cursor", cursor);
    const result: FeatureEnforcementPage = await authorizedRequest(endpoint + "?" + params, {
      signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace },
    });
    const policy = await loadModerationActionPolicy(workspace, signal);
    return { result, policy, key: params.toString() };
  }, [q, subject, cursor, workspace]);
  const resource = useInstitutionResource(load);
  const data = resource.data?.result;
  const policy = resource.data?.policy;
  const labels: Record<string, string> = t;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const records = delegate ? data?.delegations : data?.restrictions;
  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery(String(new FormData(event.currentTarget).get("search") ?? "").trim());
    setSubject("");
    setPages([]);
    setEdit(null);
  };
  const refresh = () => { setEdit(null); setPages([]); resource.refresh(); };
  const history = data?.history.filter((row) => row.action.includes("delegat") === delegate);
  const options = data?.subjects?.filter((item) => !delegate || item.moderator) ?? [];
  const selectedSubject = options.find((item) => item.id === subject);
  return <div className="grid min-w-0 gap-2.5">
    <section className={adminCompactCard}>
      <h2 className="text-xl font-semibold">{delegate ? t.delegations : t.features}</h2>
      <form onSubmit={search} className="mt-3 grid items-end gap-3 sm:grid-cols-[minmax(0,32rem)_auto] sm:justify-start">
        <label className="min-w-0 flex-1 text-sm font-semibold">{t.lookup}
          <input type="search" name="search" minLength={2} maxLength={100} className={institutionField} />
        </label>
        <button type="submit" className={`${institutionAction} min-h-11 justify-self-start`}>{admin.search}</button>
      </form>
      {!!options.length && <label className="mt-3 block max-w-lg text-sm font-semibold">{t.subject}
        <select value={subject} className={institutionField} onChange={(event) => {
          setSubject(event.target.value); setPages([]); setEdit(null);
        }}>
          <option value="">{admin.select}</option>
          {options.map((item) => <option value={item.id} key={item.id}>@{item.username}</option>)}
        </select>
      </label>}
      {selectedSubject && <p className="mt-2 flex flex-wrap items-center gap-1 text-sm">
        <span>@{selectedSubject.username}</span><AdminMemberBadges username={selectedSubject.username} />
      </p>}
      {q && !options.length && !resource.error && <p className="mt-3 text-sm">{t.none}</p>}
      {resource.error ? <div className="mt-3"><AdminFeedback error={resource.error} retry={resource.refresh} section={delegate ? "moderatorDelegation" : "featureRestrictions"} /></div>
        : !data || !policy ? <p role="status" className="mt-3">{authMessages[locale].working}</p>
          : subject && !edit && (!delegate || data.authority !== "moderator") && <DecisionForm key={subject}
            workspace={workspace} data={data} policy={policy} subject={subject} action={delegate ? "delegate" : "restrict"} onSave={refresh} />}
    </section>
    {data && policy && <section className={adminCompactCard}>
      <h3 className="font-semibold">{t.options}</h3>
      {!records?.length && <p className="mt-2 text-sm">{t.none}</p>}
      <ul className="mt-2 divide-y divide-[var(--theme-border)]">
        {records?.map((record) => {
          const active = record.status === "active" && record.subject !== null;
          const allowed = data.authority === "founder" || (delegate ? data.authority === "administrator"
            : !!record.expiresAt && !data.capabilities.some((item) => item.key === record.capability && item.highImpact)
              && (data.authority === "administrator" || data.delegations.some((d) =>
              d.status === "active" && d.capability === record.capability &&
              (d.scope === "platform" || (d.scope === record.scope && d.scopeId === record.scopeId)))));
          return <li key={record.id} className="grid min-w-0 gap-1.5 py-2.5">
            <p className="font-semibold">{t[record.capability]} · {t[record.status]}</p>
            <p className="break-all text-sm">{t[record.scope]}{record.scopeId && " · " + record.scopeId} · {record.subject}</p>
            <p className="text-sm">{date.format(new Date(record.startsAt))} · {record.expiresAt ? date.format(new Date(record.expiresAt)) : t.indefinitely}</p>
            {record.maxMinutes != null && <p className="text-sm">{t.durationLimit} · {record.maxMinutes}</p>}
            {active && allowed && <div className="flex flex-wrap gap-4">
              {(delegate || record.expiresAt !== null)
                && (!(delegate || data.authority === "moderator") || policy.delegableCapabilities.includes(record.capability)) && <button type="button" className={adminSecondaryAction}
                onClick={() => setEdit({ record, action: delegate ? "update_delegation" : "extend" })}>{delegate ? t.updateDecision : t.change}</button>}
              <button type="button" className={delegate ? adminDangerAction : adminSecondaryAction}
                onClick={() => setEdit({ record, action: delegate ? "revoke_delegation" : "revoke" })}>{t.revokeDecision}</button>
            </div>}
            {edit?.record.id === record.id && record.subject && <DecisionForm key={record.id + edit.action}
              workspace={workspace} data={data} policy={policy} subject={record.subject} record={record} action={edit.action}
              onSave={refresh} onCancel={() => setEdit(null)} />}
          </li>;
        })}
      </ul>
    </section>}
    {data && <section className={adminCompactCard}>
      <h3 className="font-semibold">{t.history}</h3>
      {!history?.length && <p className="mt-2 text-sm">{t.none}</p>}
      <ul className="mt-2 divide-y divide-[var(--theme-border)]">
        {history?.map((row) => <li key={row.id} className="break-words py-2 text-sm">
          <p>{labels[row.action] ?? row.action} · {t[row.capability]} · {date.format(new Date(row.occurredAt))}</p>
          <p className="break-all text-[var(--theme-body)]">{t[row.scope]} · {row.caseId}</p>
        </li>)}
      </ul>
      <div className="mt-3 flex gap-4">
        {pages.length > 0 && <button type="button" className={adminSecondaryAction} onClick={() => setPages(pages.slice(0, -1))}>{t.newer}</button>}
        {data.nextCursor && <button type="button" className={adminSecondaryAction}
          onClick={() => data.nextCursor && setPages([...pages, data.nextCursor])}>{t.older}</button>}
      </div>
    </section>}
  </div>;
}

function DecisionForm({ workspace, data, policy, subject, action, record, onSave, onCancel }: {
  workspace: string; data: FeatureEnforcementPage; policy: ModerationPolicy; subject: string; action: FeatureCommand;
  record?: FeatureEnforcementCase; onSave: () => void; onCancel?: () => void;
}) {
  const [locale] = useLocale();
  const t = featureMessages[locale], admin = adminMessages[locale], account = accountEnforcementMessages[locale];
  const delegation = action.includes("delegat");
  const revoke = action.startsWith("revoke");
  const [capabilities, setCapabilities] = useState<FeatureCapability[]>(record ? [record.capability] : []);
  const [preferredScope, setScope] = useState<FeatureScope>(record?.scope ?? "platform");
  const [selectedDuration, setDuration] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const assigned = data.delegations.filter((item) => item.status === "active");
  const delegated = data.authority === "moderator";
  const selectable = data.capabilities.filter(({ key, highImpact }) =>
    (!highImpact || !delegation && data.authority === "founder")
    && (!(delegation || delegated) || policy.delegableCapabilities.includes(key)) && (!delegated || assigned.some((item) => item.capability === key)));
  const scopes = featureScopes.filter((kind) => capabilities.every((key) =>
    (kind === "platform" || selectable.find((item) => item.key === key)?.scopes.includes(kind))
    && (!delegated || assigned.some((item) => item.capability === key && (item.scope === "platform" || item.scope === kind)))));
  const scope = record?.scope ?? (scopes.includes(preferredScope) ? preferredScope : scopes[0] ?? "platform");
  const max = delegated ? Math.min(policy.moderatorMaxMinutes, ...capabilities.map((key) =>
    Math.max(1, ...assigned.filter((item) => item.capability === key && (item.scope === scope || item.scope === "platform"))
      .map((item) => item.maxMinutes ?? 1))))
    : data.authority === "administrator" && !delegation ? policy.administratorMaxMinutes : 129600;
  const suggested = Math.min(policy.defaultMinutes, max);
  const shownPresets = policy.suspensionPresets.filter((value) => value <= max);
  const duration = selectedDuration ?? (record && delegation ? "indefinite" : shownPresets.includes(suggested) ? String(suggested) : "custom");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !capabilities.length) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    const body = {
      subject, action, capabilities, scope, scopeId: scope === "platform" ? null : record?.scopeId ?? String(form.get("scopeId") ?? "").trim(),
      reference: record?.id ?? null, version: record?.version ?? null, reason, confirmed: form.get("confirm") === "yes",
      minutes: revoke || duration === "indefinite" ? null : Number(duration === "custom" ? form.get("minutes") : duration),
      maxMinutes: delegation && !revoke ? Number(form.get("max")) : null,
      indefinite: action === "restrict" && duration === "indefinite",
      category: action === "restrict" ? String(form.get("category")) : null,
    };
    const key = JSON.stringify(body);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    try {
      await authorizedRequest(endpoint, { method: "POST", headers: { "X-Ayinou-Workspace": workspace },
        body: JSON.stringify({ ...body, requestId: pending.current.id }) });
      onSave();
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  return <form className={`${adminActionPanel} mt-4 max-w-3xl`} onSubmit={submit} aria-busy={busy}>
    {!record && <>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">{t.capabilities}</legend>
        {selectable.map(({ key }) => <label key={key} className="flex items-start gap-2 text-sm">
          <input className="mt-1" type="checkbox" disabled={busy} checked={capabilities.includes(key)} onChange={(event) => {
            setCapabilities(event.target.checked ? [...capabilities, key] : capabilities.filter((value) => value !== key));
          }} />{t[key]}
        </label>)}
      </fieldset>
      <label className="text-sm font-semibold">{t.context}
        <select value={scope} className={institutionField} onChange={(event) => setScope(event.target.value as FeatureScope)}>
          {scopes.map((item) => <option value={item} key={item}>{t[item]}</option>)}
        </select>
      </label>
      {scope !== "platform" && <label className="text-sm font-semibold">{t.scopeId}
        <input name="scopeId" required maxLength={36} className={institutionField} placeholder={t.missing} />
      </label>}
    </>}
    {!revoke && <>
      <label className="text-sm font-semibold">{t.term}
        <select className={institutionField} value={duration} onChange={(event) => setDuration(event.target.value)}>
          {suspensionMinutes.map((value, i) => shownPresets.includes(value) ? <option key={value} value={value}>{account[presets[i]]}</option> : null)}
          <option value="custom">{t.custom}</option>
          {(delegation || action === "restrict" && data.authority === "founder") && <option value="indefinite">{t.indefinitely}</option>}
        </select>
      </label>
      {duration === "custom" && <label className="text-sm font-semibold">{account.minutes}
        <input className={institutionField} type="number" name="minutes" min={1} max={max} defaultValue={suggested} required />
      </label>}
      {delegation && <label className="text-sm font-semibold">{t.durationLimit}
        <input className={institutionField} type="number" name="max" min={1} max={policy.moderatorMaxMinutes} defaultValue={Math.min(record?.maxMinutes ?? policy.moderatorMaxMinutes, policy.moderatorMaxMinutes)} required />
      </label>}
      {action === "restrict" && <label className="text-sm font-semibold">{t.category}
        <select className={institutionField} name="category">{policy.reasonCategories.map((value) =>
          <option value={value} key={value}>{account[value]}</option>)}</select>
      </label>}
    </>}
    {policy.notifyStaffGuidance && action === "restrict" && <p role="status" className="rounded-md bg-[var(--theme-surface)] p-2 text-sm">
      <strong>{moderationPolicyMessages[locale].staffGuidance}</strong> · {policy.repeatViolationGuidance}
    </p>}
    <label className="text-sm font-semibold">{admin.reason}
      <textarea className={institutionField} name="reason" required minLength={10} maxLength={500} />
    </label>
    <div className="rounded-md bg-[var(--theme-control)] p-3 text-sm">
      <p>{t.scopePreview}</p>
      {!!capabilities.length && <p className="mt-1 font-semibold">
        {capabilities.map((key) => t[key]).join(", ")} · {t[scope]}
        {!revoke && " · " + (duration === "indefinite" ? t.indefinitely
          : duration === "custom" ? t.custom : account[presets[suspensionMinutes.findIndex((n) => n===Number(duration))]])}
      </p>}
    </div>
    <label className={adminConfirmation}><input name="confirm" value="yes" type="checkbox" required />{t.reasonReview}</label>
    {error !== null && <AdminFeedback error={error} section={delegation ? "moderatorDelegation" : "featureRestrictions"} />}
    <div className="flex flex-wrap gap-3">
      <button className={action === "restrict" || action === "extend" || action === "revoke_delegation" ? adminDangerAction : institutionAction} disabled={busy || capabilities.length === 0 || !record && !scopes.includes(scope) || !revoke && duration !== "indefinite" && duration !== "custom" && Number(duration)>max}>
        {t.submit}
      </button>
      {onCancel && <button type="button" className={adminSecondaryAction} disabled={busy} onClick={onCancel}>{accountMessages[locale].cancel}</button>}
    </div>
  </form>;
}
