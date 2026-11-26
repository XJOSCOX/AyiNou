
"use client";

import { useCallback } from "react";
import { mentorshipConsiderations, mentorshipCoordinationLimits, type MentorshipCoordinationPreparation } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { SettingsHistory, SettingsOptions } from "@/components/settings-disclosures";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useLocale } from "@/lib/locale-store";
import { coordinationCopy } from "@/lib/mentorship-coordination-i18n";
import { mentorshipCopy } from "@/lib/mentorship-i18n";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { ReviewCommand } from "../projects/outcome-review/review-controls";
import { OpportunityState, opportunitySettingsCard, opportunitySettingsGroup, opportunityTag } from "./presentation";

const path = "/api/v1/admin/opportunity-settings/mentorship/coordination";
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const limits = Object.entries(mentorshipCoordinationLimits) as Array<[keyof typeof mentorshipCoordinationLimits, readonly [number,number]]>;

export function MentorshipCoordinationFounder({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale), m = mentorshipCopy(locale), o = opportunityCopy(locale);
  const load = useCallback((signal: AbortSignal): Promise<MentorshipCoordinationPreparation> =>
    authorizedSocialRequest(path,{ signal,cache:"no-store",headers:{"X-Ayinou-Workspace":workspace} }),[workspace]);
  const resource = useInstitutionResource(load);
  const data = resource.data;
  return <section className={opportunitySettingsCard}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{t("founder")}</h2>
      {data && <span className={opportunityTag}>{o("version")} {data.version}</span>}
    </header>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!data && resource.error === null && <OpportunityState>{m("loading")}</OpportunityState>}
    {data && <>
      <OpportunityState>{t("closed")}</OpportunityState>
      <ul className="flex flex-wrap gap-2">
        {([m("title"),t("recommendations"),t("discovery"),t("requests"),t("title")] as const).map(label =>
          <li key={label} className={opportunityTag}>{label} · {t("closedCase")}</li>)}
      </ul>
      <ReviewCommand key={data.version} action="configure" label={m("configure")} triggerLabel={t("edit")}
        version={data.version} noteField="reason" minNote={10} disclosureGroup={opportunitySettingsGroup}
        input={form => ({ settings:{
          ...Object.fromEntries(limits.map(([key]) => [key, Number(form.get(key))])),
          considerations:form.getAll("considerations"),
          safeguardingSince:text(form,"safeguardingSince"),safeguardingNotes:text(form,"safeguardingNotes"),
          moderationNotes:text(form,"moderationNotes"),
        } })}
        send={body => {
          const input = JSON.parse(body);
          delete input.action;
          return authorizedSocialRequest(path,{method:"PATCH",body:JSON.stringify(input),headers:{"X-Ayinou-Workspace":workspace}});
        }} after={resource.refresh}>
        <div className="grid min-w-0 gap-3">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {limits.map(([key,[minimum,maximum]]) => <label key={key} className="min-w-0">{t(key)}
              <input className={institutionField} name={key} type="number" min={minimum} max={maximum} defaultValue={data.settings[key]} required />
            </label>)}
          </div>
          <SettingsOptions title={t("matchingCriteria")}>
            {mentorshipConsiderations.map(key => <label key={key} className="flex items-start gap-2">
              <input type="checkbox" name="considerations" value={key} defaultChecked={data.settings.considerations.includes(key)} />{t(key)}
            </label>)}
          </SettingsOptions>
          <p className="text-sm">{t("safety")}</p>
          <label>{t("safeguardingSince")}<input className={institutionField} name="safeguardingSince" type="date"
            min={data.settings.safeguardingSince} defaultValue={data.settings.safeguardingSince} required /></label>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {(["safeguardingNotes","moderationNotes"] as const).map(key => <label key={key}>{t(key)}
              <textarea className={institutionField} name={key} rows={2} maxLength={500} defaultValue={data.settings[key]} />
            </label>)}
          </div>
        </div>
      </ReviewCommand>
      {data.history.length > 0 && <SettingsHistory title={m("history")}><ol className="grid gap-2">
        {data.history.map(entry => <li key={entry.version}>
          <strong>{o("version")} {entry.version}</strong> · <time dateTime={entry.recordedAt}>{new Date(entry.recordedAt).toLocaleString(locale)}</time>
          <p>{entry.reason}</p>
        </li>)}
      </ol></SettingsHistory>}
    </>}
  </section>;
}
