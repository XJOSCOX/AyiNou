"use client";

import { useCallback, useState } from "react";
import { opportunityPauseScopes, type OpportunityActivationCommand, type OpportunityActivationRead,
  type OpportunityActivationStage, type OpportunityPauseScope } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { useInstitutionResource } from "@/components/institution-ui";
import { SettingsHistory, SettingsOptions } from "@/components/settings-disclosures";
import { activationCopy } from "@/lib/activation-i18n";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useLocale } from "@/lib/locale-store";
import { mentorshipCopy } from "@/lib/mentorship-i18n";
import { opportunityActivationCopy } from "@/lib/opportunity-activation-i18n";
import { ReviewCommand } from "../projects/outcome-review/review-controls";
import { OpportunityState, opportunitySecondary, opportunitySettingsCard, opportunitySettingsGroup, opportunityTag } from "./presentation";

const path = "/api/v1/admin/opportunity-settings/activation";
const groups = ["opportunities", "mentorship"] as const;
const labels = { active: "enabled", paused: "paused", disabled: "disabled" } as const;
const parent = (key: OpportunityActivationStage) => key.startsWith("mentorship_") ? "mentorship" : "opportunities";

export function OpportunityActivation({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = opportunityActivationCopy(locale);
  const [open, setOpen] = useState(false);
  return <section className={opportunitySettingsCard}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1 basis-48">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--theme-body)]">{t("intro")}</p>
      </div>
      <button className={opportunitySecondary} type="button" aria-expanded={open} aria-controls="opportunity-activation"
        onClick={() => setOpen(!open)}>{t(open ? "hide" : "open")}</button>
    </header>
    <div id="opportunity-activation" hidden={!open}>
      {open && <ActivationControls workspace={workspace} />}
    </div>
  </section>;
}

function ActivationControls({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = opportunityActivationCopy(locale), a = activationCopy(locale);
  const load = useCallback((signal: AbortSignal): Promise<OpportunityActivationRead> =>
    authorizedSocialRequest(path, { signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace } }), [workspace]);
  const resource = useInstitutionResource(load);
  const [saved, setSaved] = useState(false);
  const data = resource.data;
  function control(capability: OpportunityActivationStage | OpportunityPauseScope, command: OpportunityActivationCommand, digest: string, label: string) {
    if (!data) return null;
    return <ReviewCommand key={capability + ":" + data.version + ":" + digest}
      action={command} label={label} noteField="reason" minNote={10} version={data.version} disclosureGroup={opportunitySettingsGroup}
      input={() => ({ capability, configuration: digest })}
      send={body => authorizedSocialRequest(path, { method: "PATCH", body, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace } })}
      after={() => { setSaved(true); resource.refresh(); }} />;
  }
  const revisionNames = { drafts: "drafts", publication: "publication", discovery: "discovery",
    intake: "mentorship_intake", coordination: "mentorship_coordination" } as const;
  return <div className="grid min-w-0 gap-4 text-sm">
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {!data && resource.error === null && <OpportunityState>{mentorshipCopy(locale)("loading")}</OpportunityState>}
    {saved && <p role="status">{a("updated")}</p>}
    {data && <>
      {groups.map(group => <section className="grid min-w-0 gap-2" key={group}>
        <h3 className="font-semibold">{t(group)}</h3>
        <ul className="grid min-w-0 items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
          {data.stages.filter(stage => parent(stage.capability) === group).map(stage => {
            const r = stage.readiness;
            const deps = Object.entries(r.dependencies) as [OpportunityActivationStage, boolean][];
            const revisions = Object.entries(r.configuration).filter(([key]) => key !== "catalog") as [keyof typeof revisionNames, number][];
            const canOpen = r.configurationPrepared && r.technicalReady && r.operationsApproved && r.privacyApproved
              && r.safeguardingApproved && r.releaseAuthorized && r.reviewerReady !== false && deps.every(([, ready]) => ready);
            const command = stage.status === "active" ? "pause" : stage.status === "paused" ? "resume" : "enable";
            const configState = r.configurationPrepared ? "configured" : revisions.some(([, v]) => v === 0) ? "defaultConfig" : "notPrepared";
            return <li className={opportunitySettingsCard + " content-start"} key={stage.capability}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="font-semibold">{t(stage.capability)}</h4>
                <span className={opportunityTag}>{a(labels[stage.status])}</span>
              </div>
              <p className="text-[var(--theme-body)]">{t(r.releaseAuthorized ? configState : "releaseMissing")}</p>
              <SettingsOptions title={t("requirementDetails")}>
                <ul className="grid gap-1 text-[var(--theme-body)]">
                  <li>{t(configState)}</li>
                  <li>{t(r.technicalReady ? "technicalReady" : "technicalUnavailable")}</li>
                  <li>{t(r.operationsApproved ? "operationsApproved" : "operationsMissing")}</li>
                  <li>{t(r.privacyApproved ? "privacyApproved" : "privacyMissing")}</li>
                  <li>{t(r.safeguardingApproved ? "safeguardingApproved" : "safeguardingMissing")}</li>
                  {r.reviewerReady !== null && <li>{t(r.reviewerReady ? "reviewerReady" : "reviewerMissing")}</li>}
                  <li>{t(r.releaseAuthorized ? "releaseApproved" : "releaseMissing")}</li>
                </ul>
                {deps.length > 0 && <dl className="mt-2 grid gap-1">
                  {deps.map(([key, ready]) => <div className="flex flex-wrap justify-between gap-x-2" key={key}>
                    <dt>{t(key)}</dt><dd>{a(ready ? "enabled" : "dependencyMissing")}</dd>
                  </div>)}
                </dl>}
                <p className="mt-2 font-semibold">{t("configuration")}</p>
                <ul>{revisions.map(([key, version]) => <li key={key}>{t(revisionNames[key])} · {version}</li>)}</ul>
              </SettingsOptions>
              {stage.status === "active" || canOpen
                ? control(stage.capability, command, stage.digest, a(command))
                : <button type="button" className={opportunitySecondary + " w-fit opacity-60"} disabled>{a(command)}</button>}
            </li>;
          })}
        </ul>
      </section>)}
      <section className={opportunitySettingsCard}>
        <h3 className="font-semibold">{a("emergency_pause")}</h3>
        <p>{t("pauseHelp")}</p>
        <ul className="grid gap-2 md:grid-cols-3">
          {opportunityPauseScopes.map(scope => <li className="grid content-start gap-2" key={scope}>
            {data.stages.some(stage => stage.status === "active" && (scope === "all" || parent(stage.capability) === scope))
              ? control(scope, "emergency_pause", data.emergency[scope], a("pause") + " · " + t(scope))
              : <><button className={opportunitySecondary + " opacity-60"} type="button" disabled>{a("pause")} · {t(scope)}</button>
                <p className="text-xs text-[var(--theme-body)]">{t("noActive")}</p></>}
          </li>)}
        </ul>
      </section>
      <SettingsHistory title={a("history")}>
        {data.history.length > 0 ? <ol className="grid gap-2">
          {data.history.map(item => <li key={item.version}>
            <strong>{t(item.capability)} · {a(item.action === "readiness_changed" ? "configuration_changed" : item.action)}</strong>{" · "}
            <time dateTime={item.at}>{new Date(item.at).toLocaleString(locale)}</time>
            {item.affected.length > 0 && <p>{item.affected.map(t).join(", ")}</p>}
            <p dir="auto">{item.reason}</p>
          </li>)}
        </ol> : <p>{a("noHistory")}</p>}
      </SettingsHistory>
      <p className="text-[var(--theme-body)]">{t("unsupported")} · {a("unimplemented")}</p>
    </>}
  </div>;
}
