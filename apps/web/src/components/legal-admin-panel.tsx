"use client";

import { useState, type FormEvent } from "react";
import { useLocale } from "@/lib/locale-store";
import { languageNames, locales } from "@/lib/i18n";
import { legalAdminMessages, legalAdminPolicyNames } from "@/lib/legal-admin-i18n";
import { changeLegalAvailability, loadAdminLegal, loadLegalAudit, type LegalPolicyStatus } from "@/lib/legal-admin-api";
import { apiErrorCode } from "@/lib/api-errors";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "./institution-ui";

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

  if (status.error) return <section className={institutionCard}><p role="alert">{failure(status.error)}</p><button onClick={status.refresh}>{t.retry}</button></section>;
  if (!status.data) return <p role="status">{t.busy}</p>;
  const global = status.data.global;
  const select = (policy: LegalPolicyStatus | null, action: Action) => { setError(null); setTarget({ policy, action }); };

  return <div className="grid min-w-0 gap-4">
    <section className={institutionCard}>
      <h2 className="text-xl font-semibold">{t.global}</h2><p className="mt-1 text-sm text-[var(--theme-body)]">{t.intro}</p>
      <p className="mt-3 font-semibold">{global.suspended ? t.suspended : global.enabled ? t.enabled : t.disabled}</p>
      <p className="mt-2 text-sm text-[var(--theme-body)]">{t.drafts} {t.missingDetails}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!global.enabled && <button type="button" className={institutionAction} disabled={!status.data.policies.some((p) => p.enabled && p.eligible)} onClick={() => select(null, global.suspended ? "restore" : "enable")}>{global.suspended ? t.restore : t.enable}</button>}
        {global.enabled && <><button type="button" className={institutionAction} onClick={() => select(null, "disable")}>{t.disable}</button>
          <button type="button" className={institutionAction} onClick={() => select(null, "suspend")}>{t.suspend}</button></>}
      </div>
      <p className="mt-3 text-sm text-[var(--theme-body)]">{t.warning}</p>
    </section>
    <section className="grid gap-3"><h2 className="text-xl font-semibold">{t.inventory}</h2>
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{status.data.policies.map((policy) => <article className={institutionCard} key={policy.policyId}>
        <h3 className="font-semibold">{names[policy.policyId]}</h3>
        <p className="mt-1 text-sm">{t[policy.state]} · {policy.enabled ? t.enabled : t.disabled} · {policy.eligible ? t.eligible : t.ineligible}</p>
        <p className="mt-2 text-sm">{t.release}: {policy.releaseVersion ?? t.noRelease}</p>
        <p className="mt-1 text-sm">{t.languages}: {locales.map((item) => languageNames[item]).join(" · ")}</p>
        {!policy.eligible && <p className="mt-2 text-sm text-[var(--theme-body)]">{t.missing}: {t.missingDetails}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {!policy.enabled && <button type="button" className={institutionAction} disabled={!policy.eligible} onClick={() => select(policy, policy.state === "suspended" ? "restore" : "enable")}>{policy.state === "suspended" ? t.restore : t.enable}</button>}
          {policy.enabled && <><button type="button" className={institutionAction} onClick={() => select(policy, "disable")}>{t.disable}</button>
            <button type="button" className={institutionAction} onClick={() => select(policy, "suspend")}>{t.suspend}</button></>}
        </div>
      </article>)}</div>
      <article className={institutionCard}><h3 className="font-semibold">{t.earlyPartner}</h3><p className="mt-1 text-sm">{t.unavailable}</p></article>
    </section>
    {target && <section className={institutionCard}><h2 className="font-semibold">{t.action}: {t[target.action]} · {target.policy ? names[target.policy.policyId] : t.global}</h2>
      <form onSubmit={submit} className="mt-3 grid max-w-xl gap-3" aria-busy={busy}>
        <label className="text-sm font-semibold">{t.reason}<textarea className={institutionField} name="reason" required minLength={10} maxLength={500} disabled={busy} placeholder={t.reasonHelp} /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" required disabled={busy} />{t.confirm}</label>
        {error !== null && <p role="alert">{failure(error)}</p>}
        <button className={institutionAction} disabled={busy}>{t.apply}</button>
      </form>
    </section>}
    <section className={institutionCard}><h2 className="text-xl font-semibold">{t.acceptance}</h2><p className="mt-1 text-sm text-[var(--theme-body)]">{t.inactive}</p>
      <ul className="mt-2 list-inside list-disc text-sm"><li>{t.terms}</li><li>{t.privacy}</li><li>{t.consent}</li><li>{t.notices}</li></ul>
    </section>
    <div className="grid gap-3 md:grid-cols-2"><section className={institutionCard}><h2 className="font-semibold">{t.current}</h2>
      {status.data.current.length ? <ul className="mt-2 text-sm">{status.data.current.map((item) => <li key={item.policyId}>{names[item.policyId]} · {item.version}</li>)}</ul> : <p className="mt-2 text-sm">{t.none}</p>}</section>
      <section className={institutionCard}><h2 className="font-semibold">{t.history}</h2>
      {status.data.historical.length ? <ul className="mt-2 text-sm">{status.data.historical.map((item) => <li key={`${item.policyId}:${item.version}`}>{names[item.policyId]} · {item.version}</li>)}</ul> : <p className="mt-2 text-sm">{t.none}</p>}</section></div>
    <section className={institutionCard}><h2 className="text-xl font-semibold">{t.audit}</h2>
      {audit.error ? <p role="alert">{failure(audit.error)}</p> : !audit.data ? <p>{t.busy}</p> : audit.data.length ? <ol className="mt-2 divide-y divide-[var(--theme-border)]">{audit.data.map((event) => <li key={event.id} className="py-2 text-sm"><strong>{t[event.action]}</strong> · {event.scope === "policy" ? names[event.policyId ?? ""] : t.global} · {event.previousEnabled ? t.enabled : t.disabled} → {event.nextEnabled ? t.enabled : t.disabled}<p>{event.reason}</p><time dateTime={event.occurredAt}>{new Intl.DateTimeFormat(locale).format(new Date(event.occurredAt))}</time></li>)}</ol> : <p className="mt-2 text-sm">{t.emptyAudit}</p>}
    </section>
  </div>;
}
