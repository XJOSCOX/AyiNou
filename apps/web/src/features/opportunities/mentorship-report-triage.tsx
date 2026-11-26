
"use client";

import { useCallback, useState } from "react";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionField, useInstitutionResource } from "@/components/institution-ui";
import { SettingsHistory } from "@/components/settings-disclosures";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useLocale } from "@/lib/locale-store";
import { coordinationCopy } from "@/lib/mentorship-coordination-i18n";
import type { mentorshipReportCategories } from "@ayinou/shared";
import { ReviewCommand } from "../projects/outcome-review/review-controls";
import { OpportunityState, opportunitySecondary, opportunitySettingsCard, opportunityTag } from "./presentation";

const path = "/api/v1/admin/moderation/mentorship";
type Report = { id: string; state: "open" | "assigned" | "referred" | "closedCase"; version: number; createdAt: string;
  assigned: boolean; reviewer: string | null };
type ReportDetail = Omit<Report,"assigned"|"reviewer"> & {category: typeof mentorshipReportCategories[number]; explanation: string};
type Queue = { state: "available" | "closed"; items: (Omit<Report,"state"> & {state: "open" | "assigned" | "referred" | "closed"})[]; founder?: boolean };

export function MentorshipReportTriage({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  const load = useCallback((signal: AbortSignal): Promise<Queue> => authorizedSocialRequest(path,
    {signal, cache:"no-store", headers:{"X-Ayinou-Workspace":workspace}}),[workspace]);
  const resource = useInstitutionResource(load);
  const list = resource.data;
  if (list?.state === "closed") return null;
  return <section className={opportunitySettingsCard}>
    <h2 className="text-lg font-semibold">{t("reports")}</h2>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {list?.items.length === 0 && <OpportunityState>{t("none")}</OpportunityState>}
    {list?.items.map(entry => <ReportRow key={entry.id+":"+entry.version} report={{...entry,state:entry.state === "closed" ? "closedCase" : entry.state}}
      workspace={workspace} after={resource.refresh} canAssign={list.founder===true} />)}
  </section>;
}

function ReportRow({report,workspace,after,canAssign}: {report:Report;workspace:string;after:()=>void;canAssign:boolean}) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  const [opened,setOpened] = useState(false);
  const endpoint = path + "/" + report.id;
  const load = useCallback((signal:AbortSignal): Promise<ReportDetail|null> =>
    opened ? authorizedSocialRequest(endpoint,{signal, cache:"no-store",headers:{"X-Ayinou-Workspace":workspace}}) : Promise.resolve(null),
  [workspace,endpoint,opened]);
  const detail = useInstitutionResource(load);
  const send = (body:string) => authorizedSocialRequest(endpoint,{method:"PATCH",body,headers:{"X-Ayinou-Workspace":workspace}});
  return <article className="grid min-w-0 gap-2 rounded-md border border-[var(--theme-border)] p-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className={opportunityTag}>{t(report.state)}</span>
      <time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString(locale)}</time>
      {report.reviewer && <span>{report.reviewer}</span>}
      {report.assigned && <button type="button" aria-expanded={opened} className={opportunitySecondary + " ms-auto"}
        onClick={() => setOpened(value => !value)}>{t("openCase")}</button>}
    </div>
    {opened && detail.error !== null && <ApiErrorNotice error={detail.error} retry={detail.refresh} signIn />}
    {opened && detail.data && <div className="grid min-w-0 gap-2">
      <h3 className="font-semibold">{t(detail.data.category)}</h3>
      <p className="whitespace-pre-wrap break-words" dir="auto">{detail.data.explanation}</p>
      {report.state === "assigned" && <SettingsHistory title={t("caseActions")}>
        <div className="grid min-w-0 gap-2">
          {(["refer","close"] as const).map(action => <ReviewCommand key={action} action={action} label={t(action)}
            minNote={10} noteField="reason" version={report.version} send={send} after={after} disclosureGroup="mentorship-case" />)}
        </div>
      </SettingsHistory>}
    </div>}
    {canAssign && (report.state === "open" || report.state === "assigned") &&
      <ReviewCommand label={t("assignCase")} action="assign" minNote={10} noteField="reason" version={report.version}
        send={send} after={after} disclosureGroup="mentorship-case"
        input={form => ({reviewer:String(form.get("reviewer") ?? "").trim()})}>
        <label>{t("reviewerUsername")}<input className={institutionField} required name="reviewer" minLength={2} maxLength={50} /></label>
      </ReviewCommand>}
  </article>;
}
