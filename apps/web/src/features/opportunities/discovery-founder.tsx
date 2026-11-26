"use client";

import { useCallback } from "react";
import { opportunityDiscoveryCriteria, opportunityDiscoveryDimensions, opportunityPreferenceFields,
  professionalOpportunityTypes, professionalOpportunityScopes, type OpportunityDiscoverySettings } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { SettingsHistory, SettingsOptions } from "@/components/settings-disclosures";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useLocale } from "@/lib/locale-store";
import { mentorshipCopy } from "@/lib/mentorship-i18n";
import { discoveryOpportunityCopy } from "@/lib/opportunity-discovery-i18n";
import { publicationCopy } from "@/lib/opportunity-publication-i18n";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { ReviewCommand } from "../projects/outcome-review/review-controls";
import { OpportunityState, opportunitySettingsCard, opportunitySettingsGroup, opportunityTag } from "./presentation";

const path = "/api/v1/admin/opportunity-settings/discovery";
const groups = {
  types: professionalOpportunityTypes, scopes: professionalOpportunityScopes,
  dimensions: opportunityDiscoveryDimensions, criteria: opportunityDiscoveryCriteria, fields: opportunityPreferenceFields,
};
const limits = { pageLimit: [4, 24], recommendationLimit: [4, 20], savedLimit: [10, 200], dismissDays: [7, 60] } as const;
const limitKeys = Object.keys(limits) as (keyof typeof limits)[];

export function DiscoveryFounder({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = discoveryOpportunityCopy(locale), o = opportunityCopy(locale), p = publicationCopy(locale), m = mentorshipCopy(locale);
  const load = useCallback((signal: AbortSignal): Promise<OpportunityDiscoverySettings> =>
    authorizedSocialRequest(path, { signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace } }), [workspace]);
  const resource = useInstitutionResource(load);
  const data = resource.data;
  const title = { types: o("type"), scopes: t("scopes"), dimensions: t("dimensions"), criteria: t("criteria"), fields: t("fields") };
  const filters = {
    keyword: t("keyword"), type: o("type"), category: o("category"), country: o("country"), department: o("department"),
    mode: o("mode"), skill: o("skills"), language: o("language"), deadline: o("closes"),
    employmentType: p("employmentType"), payment: p("payment"), funding: p("funding"),
  };
  const labels: Record<(typeof opportunityPreferenceFields)[number], string> = {
    types: o("type"), interests: o("category"), skills: o("skills"), experience: m("experience"), countries: o("country"),
    departments: o("department"), modes: o("mode"), languages: o("language"), objectives: t("objectives"), compensation: p("compensation"),
  };
  const criteria = {
    type: labels.types, interest: labels.interests, skill: labels.skills, language: labels.languages, location: o("country") + " / " + o("department"),
    mode: labels.modes, experience: labels.experience, compensation: labels.compensation,
  };
  const display: Record<keyof typeof groups, Record<string, string>> = {
    types: Object.fromEntries(professionalOpportunityTypes.map(type => [type, o(type)])),
    scopes: Object.fromEntries(professionalOpportunityScopes.map(scope => [scope, o(scope)])),
    dimensions: filters, criteria, fields: labels,
  };
  const keys = Object.keys(groups) as (keyof typeof groups)[];
  return <section className={opportunitySettingsCard}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="text-lg font-semibold">{t("settings")}</h2>
      {data && <span className={opportunityTag}>{o("version")} {data.version}</span>}
    </header>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!data && resource.error === null && <OpportunityState>{p("loading")}</OpportunityState>}
    {data && <>
      <OpportunityState>{t("closed")} {t("activation")}</OpportunityState>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {limitKeys.map(key => <div key={key} className={opportunityTag}>{t(key)} · {data.configuration[key]}</div>)}
      </div>
      <ReviewCommand key={data.version} action="configure" label={o("configuration")} triggerLabel={t("edit")}
        version={data.version} noteField="reason" minNote={10} disclosureGroup={opportunitySettingsGroup}
        input={form => ({ configuration: {
          ...Object.fromEntries(keys.map(key => [key, form.getAll(key)])),
          ...Object.fromEntries(limitKeys.map(key => [key, Number(form.get(key))])),
          readinessNotes: String(form.get("readinessNotes") ?? "").trim(),
        } })}
        send={body => {
          const input = JSON.parse(body);
          delete input.action;
          return authorizedSocialRequest(path, { method: "PATCH", body: JSON.stringify(input), headers: { "X-Ayinou-Workspace": workspace } });
        }} after={resource.refresh}>
        <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {keys.map(group => <SettingsOptions key={group} title={title[group]}>
            {groups[group].map(value => <label key={value} className="flex min-w-0 items-start gap-2 py-1">
              <input name={group} type="checkbox" value={value} defaultChecked={(data.configuration[group] as string[]).includes(value)} />
              {display[group][value]}
            </label>)}
          </SettingsOptions>)}
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {limitKeys.map(key => <label key={key}>{t(key)}
            <input className={institutionField} type="number" required min={limits[key][0]} max={limits[key][1]}
              name={key} defaultValue={data.configuration[key]} />
          </label>)}
        </div>
        <label>{t("readinessNotes")}<textarea className={institutionField} name="readinessNotes" rows={2}
          maxLength={500} defaultValue={data.configuration.readinessNotes} /></label>
      </ReviewCommand>
      {data.history.length > 0 && <SettingsHistory title={o("history")}><ol className="grid gap-2">
        {data.history.map(item => <li key={item.version}><strong>{o("version")} {item.version}</strong> ·{" "}
          <time dateTime={item.recordedAt}>{new Date(item.recordedAt).toLocaleString(locale)}</time>
          <p>{item.reason}</p></li>)}
      </ol></SettingsHistory>}
    </>}
  </section>;
}
