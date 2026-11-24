"use client";

import { useState, type FormEvent } from "react";
import { accountMessages } from "@/lib/account-i18n";
import { useLocale } from "@/lib/locale-store";
import { languageNames, locales } from "@/lib/i18n";
import { legalAdminMessages, legalAdminPolicyNames } from "@/lib/legal-admin-i18n";
import { changeLegalAvailability, loadAdminLegal, loadLegalAudit, type LegalPolicyStatus } from "@/lib/legal-admin-api";
import { apiErrorCode } from "@/lib/api-errors";
import { institutionAction, institutionField, useInstitutionResource } from "./institution-ui";
import { adminActionPanel, adminCompactCard, adminConfirmation, adminDangerAction, adminSecondaryAction } from "./admin-controls";

type Action = "enable" | "disable" | "suspend" | "restore";
export function LegalAdminPanel() {
  const [locale] = useLocale();
  const t = legalAdminMessages[locale];
  const names = legalAdminPolicyNames[locale];
  const status = useInstitutionResource(loadAdminLegal);
  const audit = useInstitutionResource(loadLegalAudit);
  const [target, setTarget] = useState<{ policy: LegalPolicyStatus | null; action: Action } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status.data || !target || busy) return;
    const form = new FormData(event.currentTarget);
    if (form.get("confirm") !== "yes") return;
    setBusy(true); setError(null);
    try {
      await changeLegalAvailability({ scope: target.policy ? "policy" : "global", policyId: target.policy?.policyId ?? null,
        action: target.action, expectedRevision: target.policy?.revision ?? status.data.global.revision,
        reason: String(form.get("reason") ?? "").trim() });
      setTarget(null); status.refresh(); audit.refresh();
    } catch (cause) { setError(cause); status.refresh(); }
    finally { setBusy(false); }
  }

  const failure = (cause: unknown) => apiErrorCode(cause) === "LEGAL_APPROVAL_REQUIRED" ? t.approval
    : apiErrorCode(cause) === "CONFLICT" ? t.conflict
    : ["MFA_REQUIRED", "FORBIDDEN"].includes(apiErrorCode(cause)) ? t.mfa : t.error;

  if (status.error) return <section className={adminCompactCard}><p role="alert">{failure(status.error)}</p><button type="button" className={`${adminSecondaryAction} mt-3`} onClick={status.refresh}>{t.retry}</button></section>;
  if (!status.data) return <p role="status">{t.busy}</p>;
  const global = status.data.global;
  const select = (policy: LegalPolicyStatus | null, action: Action) => { setError(null); setTarget({ policy, action }); };

  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const dangerous = target?.action === "suspend" || target?.action === "disable";
  const confirmation = target && <form key={`${target.policy?.policyId ?? "global"}:${target.action}`} onSubmit={submit} className={`${adminActionPanel} mt-3 max-w-2xl`} aria-busy={busy}>
    <h3 className="font-semibold">{t[target.action]} · {target.policy ? names[target.policy.policyId] : t.global}</h3>
    <label className="text-sm font-semibold">{t.reason}<textarea rows={3} className={institutionField} name="reason" required minLength={10} maxLength={500} disabled={busy} placeholder={t.reasonHelp} /></label>
    <label className={adminConfirmation}><input type="checkbox" name="confirm" value="yes" required disabled={busy} />{t.confirm}</label>
    {error !== null && <p role="alert">{failure(error)}</p>}
    <div className="flex flex-wrap gap-2">
      <button className={dangerous ? adminDangerAction : institutionAction} disabled={busy}>{t.apply}</button>
      <button type="button" className={adminSecondaryAction} disabled={busy} onClick={() => setTarget(null)}>{accountMessages[locale].cancel}</button>
    </div>
  </form>;

  return <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <div className="grid min-w-0 gap-3">
      <section className={adminCompactCard}>
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--theme-border)] pb-2.5">
          <div>
            <h2 className="text-lg font-semibold">{t.global}</h2>
            <p className="mt-1 text-sm text-[var(--theme-body)]">{t.intro}</p>
          </div>
          <p className={`rounded-md px-2 py-1 text-sm font-semibold ${global.suspended ? "bg-[var(--theme-error-bg)] text-[var(--theme-error-text)]" : "bg-[var(--theme-selected)]"}`}>{global.suspended ? t.suspended : global.enabled ? t.enabled : t.disabled}</p>
        </header>
        <p className="mt-2 text-sm text-[var(--theme-body)]">{t.drafts} {t.missingDetails}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!global.enabled && <button type="button" className={institutionAction} disabled={!status.data.policies.some((p) => p.enabled && p.eligible)} onClick={() => select(null, global.suspended ? "restore" : "enable")}>{global.suspended ? t.restore : t.enable}</button>}
          {global.enabled && <><button type="button" className={adminSecondaryAction} onClick={() => select(null, "disable")}>{t.disable}</button>
            <button type="button" className={adminDangerAction} onClick={() => select(null, "suspend")}>{t.suspend}</button></>}
        </div>
        <p className="mt-2 text-xs text-[var(--theme-body)]">{t.warning}</p>
        {target && !target.policy && confirmation}
      </section>
      <section className={`${adminCompactCard} grid gap-2.5`}>
        <h2 className="border-b border-[var(--theme-border)] pb-2 text-lg font-semibold">{t.inventory}</h2>
        <div className="grid min-w-0 gap-2">{status.data.policies.map((policy) => <article className="min-w-0 rounded-lg border border-[var(--theme-border)] p-3" key={policy.policyId}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{names[policy.policyId]}</h3>
            <span className="rounded-md bg-[var(--theme-control)] px-2 py-1 text-xs font-semibold">{t[policy.state]} · {policy.enabled ? t.enabled : t.disabled} · {policy.eligible ? t.eligible : t.ineligible}</span>
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div><dt className="text-xs text-[var(--theme-body)]">{t.release}</dt><dd>{policy.releaseVersion ?? t.noRelease}</dd></div>
            <div><dt className="text-xs text-[var(--theme-body)]">{t.languages}</dt><dd>{locales.map((item) => languageNames[item]).join(" · ")}</dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {!policy.enabled && <button type="button" className={institutionAction} disabled={!policy.eligible} onClick={() => select(policy, policy.state === "suspended" ? "restore" : "enable")}>{policy.state === "suspended" ? t.restore : t.enable}</button>}
            {policy.enabled && <><button type="button" className={adminSecondaryAction} onClick={() => select(policy, "disable")}>{t.disable}</button>
              <button type="button" className={adminDangerAction} onClick={() => select(policy, "suspend")}>{t.suspend}</button></>}
          </div>
          {target?.policy?.policyId === policy.policyId && confirmation}
        </article>)}</div>
        <article className="rounded-lg bg-[var(--theme-control)] p-3"><h3 className="font-semibold">{t.earlyPartner}</h3><p className="mt-1 text-sm">{t.unavailable}</p></article>
      </section>
    </div>
    <aside className="grid min-w-0 gap-3">
      <section className={adminCompactCard}><h2 className="text-xl font-semibold">{t.acceptance}</h2><p className="mt-1 text-sm text-[var(--theme-body)]">{t.inactive}</p>
        <ul className="mt-2 list-inside list-disc text-sm"><li>{t.terms}</li><li>{t.privacy}</li><li>{t.consent}</li><li>{t.notices}</li></ul>
      </section>
      <div className="grid gap-3 md:grid-cols-2"><section className={adminCompactCard}><h2 className="font-semibold">{t.current}</h2>
        {status.data.current.length ? <ul className="mt-2 text-sm">{status.data.current.map((item) => <li key={item.policyId}>{names[item.policyId]} · {item.version}</li>)}</ul> : <p className="mt-2 text-sm">{t.none}</p>}</section>
        <section className={adminCompactCard}><h2 className="font-semibold">{t.history}</h2>
        {status.data.historical.length ? <ul className="mt-2 text-sm">{status.data.historical.map((item) => <li key={`${item.policyId}:${item.version}`}>{names[item.policyId]} · {item.version}</li>)}</ul> : <p className="mt-2 text-sm">{t.none}</p>}</section></div>
      <section className={adminCompactCard}><h2 className="text-xl font-semibold">{t.audit}</h2>
        {audit.error ? <p role="alert">{failure(audit.error)}</p> : !audit.data ? <p>{t.busy}</p> : audit.data.length ? <ol className="mt-2 divide-y divide-[var(--theme-border)]">{audit.data.map((event) => <li key={event.id} className="py-2 text-sm"><strong>{t[event.action]}</strong> · {event.scope === "policy" ? names[event.policyId ?? ""] : t.global} · {event.previousEnabled ? t.enabled : t.disabled} → {event.nextEnabled ? t.enabled : t.disabled}<p>{event.reason}</p><time dateTime={event.occurredAt}>{date.format(new Date(event.occurredAt))}</time></li>)}</ol> : <p className="mt-2 text-sm">{t.emptyAudit}</p>}
      </section>
    </aside>
  </div>;
}
