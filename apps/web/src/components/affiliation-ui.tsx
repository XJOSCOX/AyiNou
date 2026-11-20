"use client";

import { useState, type ComponentProps } from "react";
import { affiliationTypes, type Affiliation } from "@ayinou/shared";
import { accountMessages } from "@/lib/account-i18n";
import { leaveAffiliation, setAffiliationConsent } from "@/lib/affiliation-api";
import { affiliationMessages } from "@/lib/affiliation-i18n";
import { institutionError, institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionAction, institutionErrorBox, institutionField, institutionLink } from "./institution-ui";

export function AffiliationTypeSelect({ allowStaff = true, ...props }: ComponentProps<"select"> & { allowStaff?: boolean }) {
  const [locale] = useLocale();
  const t = affiliationMessages[locale];
  return (
    <label className="block min-w-0 text-sm font-semibold">{t.type}
      <select className={institutionField} {...props}>
        {affiliationTypes.filter((type) => allowStaff || type !== "staff").map((type) => <option key={type} value={type}>{t[type]}</option>)}
      </select>
    </label>
  );
}

export function useAffiliationAction(refresh: () => void) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try { await action(); refresh(); setSaved(true); }
    catch (cause) { setFailure(cause); }
    finally { setBusy(false); }
  }

  return { busy, failure, saved, run };
}

export function AffiliationFeedback({ failure, saved }: { failure: unknown; saved: boolean }) {
  const [locale] = useLocale();
  if (failure !== null) return <p role="alert" className={institutionErrorBox}>{institutionError(institutionMessages[locale], failure)}</p>;
  return saved ? <p role="status" className="text-sm text-[var(--theme-link)]">{affiliationMessages[locale].changed}</p> : null;
}

export function OwnAffiliationActions({ affiliation, refresh }: { affiliation: Affiliation; refresh: () => void }) {
  const [locale] = useLocale();
  const t = affiliationMessages[locale];
  const action = useAffiliationAction(refresh);
  const [confirm, setConfirm] = useState(false);
  const pending = affiliation.status === "pending";
  return (
    <div className="mt-3 space-y-3">
      {affiliation.status === "active" && <label className="flex max-w-2xl items-start gap-2 text-sm text-[var(--theme-body)]">
        <input type="checkbox" checked={affiliation.listed} disabled={action.busy} className="mt-0.5"
          onChange={(event) => { const listed = event.target.checked; void action.run(() => setAffiliationConsent(affiliation.organizationId, listed)); }} />
        {t.optIn}
      </label>}
      {confirm ? <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-sm">{pending ? t.withdrawQuestion : t.leaveQuestion}</p>
        <button type="button" className={institutionAction} disabled={action.busy} onClick={() => {
          void action.run(async () => { await leaveAffiliation(affiliation.organizationId); setConfirm(false); });
        }}>{pending ? t.withdraw : t.leave}</button>
        <button type="button" className={institutionLink} disabled={action.busy} onClick={() => setConfirm(false)}>{accountMessages[locale].cancel}</button>
      </div> : <button type="button" className={institutionLink} disabled={action.busy} onClick={() => setConfirm(true)}>{pending ? t.withdraw : t.leave}</button>}
      <AffiliationFeedback failure={action.failure} saved={action.saved} />
    </div>
  );
}
