"use client";

import { useCallback } from "react";
import type { OpportunityFounderView, OpportunitySettings } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useLocale } from "@/lib/locale-store";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { PublicationStaff } from "./publication-panels";
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
    <h2 className="text-xl font-semibold">{t("settings")}</h2>
    <p role="status">{t("live")}</p>
    <p>{t("verificationHelp")}</p><p>{t("readiness")}</p>
    <p>{[t("name"), t("description"), t("type"), t("language"), t("category"), t("country"), t("department"), t("mode"),
      t("opens"), t("closes"), t("skills"), t("references"), t("method")].join(" · ")}</p>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {resource.data === null && resource.error === null && <p role="status" aria-busy="true">…</p>}
    {data && <>
      <h3 className="font-semibold">{t("ready")} · {t("version")} {data.version}</h3>
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
      <h3 className="font-semibold">{t("history")}</h3>
      <ul>{data.history.map(item => <li className="break-words" key={item.version}>
        {t("version")} {item.version} · <time dateTime={item.registered_at}>{new Date(item.registered_at).toLocaleString(locale)}</time> · {item.reason}
      </li>)}</ul>
    </>}
    <PublicationStaff workspace={workspace} founder />
    <h3 className="font-semibold">{t("stages")}</h3>
    <ul className="grid gap-1 sm:grid-cols-2">
      {(["employment","internship","scholarship","training","expression","mentorship","recommendations"] as const)
        .map(stage => <li key={stage}>{t(stage)} · {t("unimplemented")}</li>)}
    </ul>
  </section>;
}
