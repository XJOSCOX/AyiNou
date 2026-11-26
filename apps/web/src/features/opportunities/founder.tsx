"use client";

import { useCallback } from "react";
import type { OpportunityFounderView, OpportunitySettings } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionCard, institutionField, useInstitutionResource } from "@/components/institution-ui";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useLocale } from "@/lib/locale-store";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { MentorshipFounder } from "./mentorship-founder";
import { PublicationStaff } from "./publication-panels";
import { OpportunityState, opportunityTag } from "./presentation";
import { ReviewCommand } from "../projects/outcome-review/review-controls";

const path = "/api/v1/admin/opportunity-settings";
const groups = ["types","organizationKinds","scopes","modes"] as const;

export function FounderOpportunitySettings({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = opportunityCopy(locale);
  const load = useCallback((signal: AbortSignal): Promise<OpportunityFounderView> => authorizedSocialRequest(path, {
    signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace },
  }), [workspace]);
  const resource = useInstitutionResource(load);
  const data = resource.data;
  const groupLabels = {types:t("type"),organizationKinds:t("kinds"),scopes:t("scopes"),modes:t("mode")};
  return <section className="grid min-w-0 gap-4">
    <header className="grid gap-3">
      <h2 className="text-xl font-semibold">{t("settings")}</h2>
      <p className="text-sm leading-relaxed text-[var(--theme-body)]">{t("verificationHelp")}</p>
      <OpportunityState>{t("live")}</OpportunityState>
    </header>
    <div className="grid items-start gap-4 2xl:grid-cols-2">
    <section className={institutionCard + " grid gap-3"}>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {resource.data === null && resource.error === null && <p role="status" aria-busy="true">…</p>}
    {data && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{t("ready")}</h3>
        <span className={opportunityTag}>{t("version")} {data.version}</span>
      </div>
      <ReviewCommand key={data.version} action="configure" label={t("configuration")} version={data.version}
        noteField="reason" minNote={10}
        input={fields => ({settings:{...Object.fromEntries(groups.map(group => [group, fields.getAll(group)])),
          draftLimit:Number(fields.get("draftLimit"))}})}
        send={body => {
          const parsed = JSON.parse(body) as {action?:string;settings:OpportunitySettings};
          delete parsed.action;
          return authorizedSocialRequest(path,{method:"PATCH",body:JSON.stringify(parsed),headers:{"X-Ayinou-Workspace":workspace}});
        }} after={resource.refresh}>
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map(group => <fieldset key={group} className="grid gap-1">
            <legend className="mb-1 font-semibold">{groupLabels[group]}</legend>
            {data.defaults[group].map(option => <label key={option} className="flex gap-2">
              <input name={group} type="checkbox" value={option} defaultChecked={(data.settings[group] as string[]).includes(option)} />
              {group === "organizationKinds" ? institutionMessages[locale][option as keyof typeof institutionMessages.en] as string : t(option as Parameters<typeof t>[0])}
            </label>)}</fieldset>)}
        </div>
        <label className="grid gap-1">{t("limit")}
          <input className={institutionField} required type="number" min={1} max={50} name="draftLimit" defaultValue={data.settings.draftLimit} />
        </label>
      </ReviewCommand>
      {data.history.length > 0 && <><h3 className="font-semibold">{t("history")}</h3>
      <ul className="grid gap-2 text-sm">{data.history.map(item => <li className="break-words" key={item.version}>
        {t("version")} {item.version} · <time dateTime={item.registered_at}>{new Date(item.registered_at).toLocaleString(locale)}</time> · {item.reason}
      </li>)}</ul></>}
    </>}
    </section>
    <PublicationStaff workspace={workspace} founder />
    </div>
    <MentorshipFounder workspace={workspace} />
  </section>;
}
