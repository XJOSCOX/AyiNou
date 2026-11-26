"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionCard, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { useLocale } from "@/lib/locale-store";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { activationCopy } from "@/lib/activation-i18n";
import { ReviewCommand } from "../projects/outcome-review/review-controls";

type Capability = "intake" | "requirements" | "matching" | "discovery" | "recruitment";
type Command = "enable" | "pause" | "resume" | "emergency_pause";
type Stage = { capability: Capability; configurationVersion: number; configurationReady: boolean; operationalReady: boolean;
  status: "active" | "paused" | "disabled"; dependencies: Capability[]; dependenciesReady: boolean };
type Panel = { version: number; configuration: string; stages: Stage[];
  history: { version: number; capability: Capability | "all"; action: Command | "configuration_changed"; reason: string; affected: Capability[]; at: string }[] };
const path = "/api/v1/admin/volunteer-settings/activation";
const status = { active: "enabled", paused: "paused", disabled: "disabled" } as const;

export function VolunteerActivation({ workspace, settingsVersion }: { workspace: string; settingsVersion: number }) {
  const [locale] = useLocale();
  const t = activationCopy(locale);
  const load = useCallback((signal: AbortSignal): Promise<Panel> => authorizedSocialRequest(path, {
    signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace },
  }), [workspace]);
  const resource = useInstitutionResource(load);
  const observedSettings = useRef(settingsVersion);
  const [saved, setSaved] = useState(false);
  const data = resource.data;
  useEffect(() => {
    if (observedSettings.current === settingsVersion) return;
    observedSettings.current = settingsVersion;
    resource.refresh();
  }, [resource, settingsVersion]);
  const send = (body: string) => authorizedSocialRequest(path, {
    body, method: "PATCH", cache: "no-store", headers: { "X-Ayinou-Workspace": workspace },
  });
  function action(capability: Capability | "all", command: Command) {
    if (!data) return null;
    return <ReviewCommand key={capability + ":" + data.version + ":" + data.configuration}
      action={command} label={t(command)} noteField="reason" minNote={10} version={data.version}
      input={() => ({ capability, configuration: data.configuration })} send={send}
      after={() => { setSaved(true); resource.refresh(); }} />;
  }
  return <section className="grid min-w-0 gap-3 border-b border-[var(--theme-border)] pb-4">
    <h3 className="text-xl font-semibold">{t("title")}</h3>
    <p>{t("intro")}</p>
    <p className="text-sm">{t("pauseHelp")}</p>
    {!data && resource.error === null && <ProjectLoading />}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {saved && <p role="status">{t("updated")}</p>}
    {data && <>
      <ul className="grid min-w-0 gap-3 xl:grid-cols-2">
        {data.stages.map(stage => {
          const command = stage.status === "active" ? "pause" : stage.status === "paused" ? "resume" : "enable";
          const controls = stage.status === "active" || (stage.configurationReady && stage.operationalReady && stage.dependenciesReady);
          return <li key={stage.capability} className={institutionCard + " grid min-w-0 content-start gap-2"}>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
              <h4 className="font-semibold">{t(stage.capability)}</h4>
              <span className="text-sm font-semibold">{t(status[stage.status])}</span>
            </div>
            <p className="text-sm">{stage.configurationReady ? t(stage.configurationVersion > 0 ? "prepared" : "available") + " · v" + stage.configurationVersion : t("incomplete")}</p>
            <p className="text-sm">{t(stage.operationalReady ? "ready" : "incomplete")}</p>
            {stage.dependencies.length > 0 && <p className="text-sm">
              {t("dependencies")} · {stage.dependencies.map(t).join(", ")}
              {!stage.dependenciesReady && <> · {t("dependencyMissing")}</>}
            </p>}
            {controls ? action(stage.capability, command)
              : <button type="button" className="w-fit rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm opacity-60" disabled>{t(command)}</button>}
          </li>;
        })}
        <li className={institutionCard + " grid content-start gap-2"}><h4 className="font-semibold">{t("skills")}</h4><p>{t("unimplemented")} · {t("disabled")}</p></li>
      </ul>
      {data.stages.some(stage => stage.status === "active") ? action("all","emergency_pause")
        : <button type="button" className="w-fit rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm opacity-60" disabled>{t("emergency_pause")}</button>}
      <section className="grid gap-2">
        <h4 className="font-semibold">{t("history")}</h4>
        {data.history.length ? <ul className="grid gap-2">{data.history.map(event => <li key={event.version} className="break-words">
          <p>{t(event.capability)} · {t(event.action)} · <time dateTime={event.at}>{new Intl.DateTimeFormat(locale,{ dateStyle: "short", timeStyle: "short" }).format(new Date(event.at))}</time></p>
          {event.affected.length > 0 && <p className="text-sm">{event.affected.map(t).join(", ")}</p>}
          <p className="text-sm" dir="auto">{event.reason}</p>
        </li>)}</ul> : <p>{t("noHistory")}</p>}
      </section>
    </>}
  </section>;
}
