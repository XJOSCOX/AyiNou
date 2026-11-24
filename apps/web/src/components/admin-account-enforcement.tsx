"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import {
  maxSuspensionMinutes, suspensionMinutes,
  type AdminAccount, type EnforcementAction,
} from "@ayinou/shared";
import { applyAccountEnforcement } from "@/lib/admin-api";
import { adminMessages } from "@/lib/admin-i18n";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { apiErrorCode } from "@/lib/api-errors";
import { loadModerationActionPolicy } from "@/lib/moderation-policy";
import { moderationPolicyMessages } from "@/lib/moderation-policy-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionField, useInstitutionResource } from "./institution-ui";
import { adminActionPanel, adminConfirmation, adminDangerAction } from "./admin-controls";

const durations = ["hours1", "hours24", "days3", "days7", "days30", "days90"] as const;



export function AdminAccountEnforcement({ account, founder, workspace, onChange }: {
  account: AdminAccount; founder: boolean; workspace: string; onChange: () => void;
}) {
  const [locale] = useLocale();
  const t = accountEnforcementMessages[locale];
  const labels = adminMessages[locale];
  const notice = account.enforcement;
  const options: EnforcementAction["action"][] = notice?.legacy ? (founder ? ["lift_legacy"] : [])
    : notice?.kind === "banned" ? (founder ? ["lift"] : [])
      : notice ? ["extend", "lift"] : founder ? ["suspend", "ban"] : ["suspend"];
  const [action, setAction] = useState(options[0]);
  const [selectedDuration, setDuration] = useState<string>();
  const loadPolicy = useCallback((signal: AbortSignal) => loadModerationActionPolicy(workspace, signal), [workspace]);
  const resource = useInstitutionResource(loadPolicy);
  const policy = resource.data;
  const ceiling = founder ? maxSuspensionMinutes : policy?.administratorMaxMinutes ?? maxSuspensionMinutes;
  const fallback = policy?.defaultMinutes ?? 60;
  const presets = policy?.suspensionPresets.filter((value) => value <= ceiling) ?? [];
  const categories = policy?.reasonCategories ?? [];
  const duration = selectedDuration ?? (presets.includes(fallback) ? String(fallback) : "custom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const limited = action === "suspend" || action === "extend";
  const needsCategory = action === "suspend" || action === "ban";
  if (!account.enforcementEligible || !action || options.length === 0) return null;

  if (resource.error) return <AdminFeedback error={resource.error} retry={resource.refresh} section="accounts" />;
  if (!policy) return <p role="status">{authMessages[locale].working}</p>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    if (values.get("confirm") !== "yes") return;
    const category = categories.find((value) => value === values.get("category"));
    const minutes = Number(duration === "custom" ? values.get("custom") : duration);
    const common = { expected: account.restrictionRevision ?? null, reason: String(values.get("reason") ?? "").trim(),
      confirmed: true as const, requestId: "" };
    const command: EnforcementAction | null = action === "suspend" && category ? { ...common, action, category, minutes }
      : action === "ban" && category ? { ...common, action, category }
        : action === "extend" && notice ? { ...common, action, reference: notice.reference, minutes }
          : (action === "lift" || action === "lift_legacy") && notice ? { ...common, action, reference: notice.reference } : null;
    if (!command) return;
    const signature = JSON.stringify(command);
    if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    try {
      await applyAccountEnforcement(account.id, { ...command, requestId: pending.current.id }, workspace);
      onChange();
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className={adminActionPanel} aria-busy={busy}>
    <label className="text-sm font-semibold">{labels.changeStatus}
      <select className={institutionField} value={action} disabled={busy} onChange={(event) => {
        const selected = options.find((item) => item === event.target.value);
        if (selected) setAction(selected);
      }}>
        {options.map((item) => <option key={item} value={item}>{t[item]}</option>)}
      </select>
    </label>
    {limited && <label className="text-sm font-semibold">{t.duration}
      <select className={institutionField} value={duration} disabled={busy} onChange={(event) => setDuration(event.target.value)}>
        {suspensionMinutes.map((value, index) => presets.includes(value) && <option value={value} key={value}>{t[durations[index]]}</option>)}
        <option value="custom">{t.custom}</option>
      </select>
    </label>}
    {limited && duration === "custom" && <label className="text-sm font-semibold">{t.minutes}
      <input name="custom" type="number" min={1} max={ceiling} step={1} defaultValue={fallback} className={institutionField} required disabled={busy} />
    </label>}
    {needsCategory && <label className="text-sm font-semibold">{t.category}
      <select name="category" className={institutionField} required disabled={busy} defaultValue="">
        <option value="" disabled>{labels.select}</option>
        {categories.map((item) => <option value={item} key={item}>{t[item]}</option>)}
      </select>
    </label>}
    {policy.notifyStaffGuidance && needsCategory && <p role="status" className="rounded-md bg-[var(--theme-surface)] p-2 text-sm">
      <strong>{moderationPolicyMessages[locale].staffGuidance}</strong> · {policy.repeatViolationGuidance}
    </p>}
    <label className="text-sm font-semibold">{labels.reason}
      <textarea name="reason" rows={3} className={institutionField} required minLength={10} maxLength={500} disabled={busy} />
    </label>
    <label key={action} className={adminConfirmation}>
      <input className="mt-1" name="confirm" value="yes" type="checkbox" required disabled={busy} />
      {t.confirm}
    </label>
    {error !== null && (apiErrorCode(error) === "ACCOUNT_ENFORCEMENT_LIMIT"
      ? <p className="text-sm" role="alert">{t.limit}</p> : <AdminFeedback error={error} />)}
    <button className={`${needsCategory || action === "extend" ? adminDangerAction : institutionAction} justify-self-start`} disabled={busy}>{t[action]}</button>
  </form>;
}
