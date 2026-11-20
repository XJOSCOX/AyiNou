import { fields, field, links, ExplanationFields, TrustError } from "./trust-controls";
import { institutionCard, institutionField, institutionAction } from "@/components/institution-ui";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { submitInstitutionReport, submitImpersonationReport } from "@/lib/trust-api";
import { trustMessages } from "@/lib/trust-i18n";
import { type ImpersonationKind, institutionImpersonationKinds, impersonationKinds } from "@ayinou/shared";
import { useState } from "react";

export function ImpersonationReportForm(target: { username: string } | { institutionHandle: string }) {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  const [kind, setKind] = useState<ImpersonationKind>("institutionHandle" in target ? "institution" : "profile");
  const [saved, setSaved] = useState(false);
  const mutation = useFeedMutation();
  return <details className={institutionCard}>
    <summary className="cursor-pointer font-semibold">{t.report}</summary>
    {saved ? <p role="status" className="mt-3">{t.reportSent}</p> : <form className="mt-3 grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const form = fields(event);
      void mutation.run(async () => {
        if ("institutionHandle" in target) {
          await submitInstitutionReport(target.institutionHandle, kind, field(form, "explanation"), links(form));
        } else {
          await submitImpersonationReport(target.username, kind, kind === "affiliation" ? field(form, "institution") : null,
            field(form, "explanation"), links(form));
        }
        setSaved(true);
      });
    }}>
      <label className="text-sm font-semibold">{t.reason}
        <select className={institutionField} value={kind} onChange={(event) => setKind(event.target.value as ImpersonationKind)}>
          {("institutionHandle" in target ? institutionImpersonationKinds : impersonationKinds).map((value) =>
            <option key={value} value={value}>{value === "representative" ? t.representativeReport : t[value]}</option>)}
        </select>
      </label>
      {kind === "affiliation" && "username" in target && <label className="text-sm font-semibold">{t.institutionHandle}
        <input name="institution" className={institutionField} minLength={3} maxLength={40} required />
      </label>}
      <ExplanationFields />
      {mutation.error !== null && <TrustError error={mutation.error} />}
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.report}</button>
    </form>}
  </details>;
}
