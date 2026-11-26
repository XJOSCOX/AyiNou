"use client";

import { useCallback } from "react";
import {
  mentorshipGeographies, mentorshipOptionalFields, mentorshipRoles, mentorshipTopics, volunteerCategories, volunteerModes,
  type MentorshipConfiguration, type MentorshipFounderView,
} from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionCard, institutionField, useInstitutionResource } from "@/components/institution-ui";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useLocale } from "@/lib/locale-store";
import { mentorshipCopy } from "@/lib/mentorship-i18n";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { volunteerCategory } from "@/lib/volunteer-i18n";
import { ReviewCommand } from "../projects/outcome-review/review-controls";
import { OpportunityState, opportunityTag } from "./presentation";

const path = "/api/v1/admin/opportunity-settings/mentorship";
const limits = [
  ["maxWeeklyHours", "weeklyHours", 1, 16], ["maxSessionMinutes", "sessionMinutes", 15, 120],
  ["maxDurationWeeks", "durationWeeks", 1, 52], ["maxCapacity", "capacity", 1, 8],
] as const;
const groups = [
  ["roles", "roles", mentorshipRoles], ["topics", "topics", mentorshipTopics], ["fields", "optionalFields", mentorshipOptionalFields],
  ["skillCategories", "skillCategories", volunteerCategories], ["modes", "mode", volunteerModes],
  ["geographies", "geography", mentorshipGeographies],
] as const;

export function MentorshipFounder({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = mentorshipCopy(locale);
  const common = opportunityCopy(locale);
  const load = useCallback((signal: AbortSignal): Promise<MentorshipFounderView> => authorizedSocialRequest(path, {
    signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace },
  }), [workspace]);
  const resource = useInstitutionResource(load);
  const data = resource.data;
  return <section className={institutionCard + " grid min-w-0 gap-4"}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{t("settings")}</h2>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-[var(--theme-body)]">{t("settingsHelp")}</p>
      </div>
      {data && <span className={opportunityTag}>{common("version")} {data.version}</span>}
    </header>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {data === null && resource.error === null && <OpportunityState>{t("loading")}</OpportunityState>}
    {data && <>
      <OpportunityState>{t("activation")}</OpportunityState>
      <p className="max-w-4xl text-sm leading-relaxed text-[var(--theme-body)]">{t("identity")} {t("policy")}</p>
      <ReviewCommand action="configure" key={data.version} label={t("configure")} version={data.version} noteField="reason" minNote={10}
        input={form => ({
          configuration: {
            ...Object.fromEntries(groups.map(([group]) => [group, form.getAll(group)])),
            ...Object.fromEntries(limits.map(([key]) => [key, Number(form.get(key))])),
          },
          safeguardingPlan: String(form.get("safeguardingPlan") ?? "").trim(),
          readinessNotes: String(form.get("readinessNotes") ?? "").trim(),
        })}
        send={body => {
          const input = JSON.parse(body) as { action?: string; configuration: MentorshipConfiguration };
          delete input.action;
          return authorizedSocialRequest(path, { method: "PATCH", body: JSON.stringify(input), headers: { "X-Ayinou-Workspace": workspace } });
        }} after={resource.refresh}>
        <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map(([group, label, values]) => <fieldset key={group}
            className="grid min-w-0 gap-2 rounded-lg border border-[var(--theme-border)] p-3">
            <legend className="px-1 text-sm font-semibold">{t(label)}</legend>
            {values.map(value => <label className="flex items-start gap-2 text-sm" key={value}>
              <input type="checkbox" name={group} value={value}
                defaultChecked={(data.configuration[group] as readonly string[]).includes(value)} />
              {group === "modes" ? common(value as typeof volunteerModes[number]) :
                group === "skillCategories" ? volunteerCategory(value as typeof volunteerCategories[number], locale) :
                t(value as Parameters<typeof t>[0])}
            </label>)}
          </fieldset>)}
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {limits.map(([key,label,min,max]) => <label key={key} className="min-w-0 text-sm">{t(label)}
            <input className={institutionField} type="number" name={key} min={min} max={max} required defaultValue={data.configuration[key]} />
          </label>)}
        </div>
        <label className="text-sm">{t("safeguardingPlan")}
          <textarea className={institutionField} name="safeguardingPlan" rows={3} maxLength={500} defaultValue={data.safeguardingPlan} />
        </label>
        <label className="text-sm">{t("readinessNotes")}
          <textarea className={institutionField} name="readinessNotes" rows={3} maxLength={500} defaultValue={data.readinessNotes} />
        </label>
      </ReviewCommand>
      {data.history.length > 0 && <details className="rounded-lg border border-[var(--theme-border)] p-3">
        <summary className="cursor-pointer font-semibold">{t("history")}</summary>
        <ul className="mt-3 grid min-w-0 gap-2">
          {data.history.map(entry => <li key={entry.version} className="rounded-md bg-[var(--theme-control)] p-3 text-sm">
            <p>{common("version")} {entry.version} · <time dateTime={entry.recordedAt}>{new Date(entry.recordedAt).toLocaleString(locale)}</time></p>
            <p className="break-words" dir="auto">{entry.reason}</p>
          </li>)}
        </ul>
      </details>}
    </>}
  </section>;
}
