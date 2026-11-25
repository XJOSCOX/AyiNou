"use client";

import { useCallback } from "react";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { apiErrorCode } from "@/lib/api-errors";
import { changeImpactMapping, changeImpactNeedConsent, loadImpactMapping, loadImpactNeedConsent } from "@/lib/impact-api";
import { impactCopy } from "@/lib/impact-i18n";
import { useLocale } from "@/lib/locale-store";
import { ReviewCommand } from "../projects/outcome-review/review-controls";

export const impactReceipt = { noteField: "reason", minNote: 10 } as const;

export function OutcomeImpactMapping({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const resource = useInstitutionResource(useCallback((signal: AbortSignal) => loadImpactMapping(id, signal), [id]));
  if (apiErrorCode(resource.error) === "IMPACT_DISABLED" || apiErrorCode(resource.error) === "DEPENDENCY_BLOCKED") return null;
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} />;
  const mapping = resource.data;
  if (!mapping) return null;
  const send = (body: string) => changeImpactMapping(id, body);
  const common = { ...impactReceipt, version: mapping.version, send, after: resource.refresh };
  return <section className="grid gap-3">
    <h5 className="font-semibold">{t("mapping")}</h5>
    {mapping.state && <p className="text-sm">{t(mapping.state)}</p>}
    {!mapping.catalog.length && <p className="text-sm">{t("noMapping")}</p>}
    {mapping.catalog.length > 0 && mapping.state !== "submitted" &&
      <ReviewCommand {...common} key={mapping.version} action="submit_mapping" label={t("submitMapping")} confirmation={t("mappingConsent")}
        input={(form) => {
          const definition = mapping.catalog[Number(form.get("definition"))];
          return { code: definition.code, definitionVersion: definition.version,
            deliveryReference: String(form.get("deliveryReference")).trim() };
        }}>
        <label>{t("definitions")}<select className={institutionField} name="definition" required>
          {mapping.catalog.map((definition, index) => <option value={index} key={definition.code}>
            {definition.names[locale]} · {definition.units[locale]} · v{definition.version}</option>)}
        </select></label>
        <label>{t("delivery")}<input className={institutionField} name="deliveryReference" required minLength={8} maxLength={80}
          pattern={"[A-Z0-9][A-Z0-9_\\-]{7,79}"} /><span className="text-sm">{t("deliveryHelp")}</span></label>
      </ReviewCommand>}
    {mapping.state && mapping.state !== "withdrawn" && <ReviewCommand {...common} key={"withdraw" + mapping.version}
      action="withdraw_mapping" label={t("withdrawMapping")} />}
  </section>;
}

export function NeedImpactConsent({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const resource = useInstitutionResource(useCallback((signal: AbortSignal) => loadImpactNeedConsent(id, signal), [id]));
  if (apiErrorCode(resource.error) === "IMPACT_DISABLED") return null;
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} />;
  if (!resource.data) return null;
  const { version, consented } = resource.data;
  return <ReviewCommand {...impactReceipt} key={version} version={version} action={consented ? "withdraw_need" : "allow_need"}
    label={t(consented ? "withdrawNeed" : "needConsent")} send={(body) => changeImpactNeedConsent(id, body)} after={resource.refresh}>
    <p>{t("needHelp")}</p>
  </ReviewCommand>;
}
