"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { volunteerDepartments, volunteerModes, type VolunteerRecommendation } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { ProjectLoading } from "@/components/project-ui";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { changeMatchingPause, dismissRecommendation, loadRecommendations } from "@/lib/matching-api";
import { matchingCopy } from "@/lib/matching-i18n";
import { loadVolunteer, saveVolunteer } from "@/lib/volunteer-api";
import { volunteerCopy } from "@/lib/volunteer-i18n";
import { departmentNames } from "@/lib/volunteer-i18n";

const profilePath = "/settings/volunteering";
const button = institutionLink + " min-h-10 w-fit";

export function useRevalidateMatching(refresh: () => void, active: boolean) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current=refresh; },[refresh]);
  useEffect(() => {
    if (!active) return;
    const onFocus = () => { if (document.visibilityState==="visible") latest.current(); };
    window.addEventListener("focus",onFocus);
    return () => window.removeEventListener("focus",onFocus);
  },[active]);
}

export function Recommendations() {
  const [locale] = useLocale();
  const t = matchingCopy(locale), v = volunteerCopy(locale);
  const [region,setRegion] = useState("");
  const [mode,setMode] = useState("");
  const [skill,setSkill] = useState("");
  const [weekly,setWeekly] = useState(false);
  const [cursor,setCursor] = useState("");
  const [changed,setChanged] = useState(false);
  const [hide,setHide] = useState(false);
  const mutation = useFeedMutation();
  const attempt = useRef<{ action: string; revision: number; id: string } | null>(null);
  const loader = useCallback((signal: AbortSignal) => {
    const params = new URLSearchParams();
    if (region) params.set("department",region);
    if (mode) params.set("mode",mode);
    if (skill) params.set("skill",skill);
    if (weekly) params.set("weekly","true");
    if (cursor) params.set("cursor",cursor);
    return loadRecommendations(params,signal).then((page) => {
      if (!signal.aborted) setHide(false);
      return page;
    });
  },[region,mode,skill,weekly,cursor]);
  const resource = useInstitutionResource(loader);
  const data = resource.data;
  const hasProfile = Boolean(data && data.state!=="closed" && data.hasProfile);
  const profile = useInstitutionResource(useCallback((signal) => hasProfile ? loadVolunteer(signal) : Promise.resolve(null),[hasProfile]));
  const refresh = () => { setHide(true); resource.refresh(); };
  useRevalidateMatching(refresh,data?.state==="ready");
  function change(set: () => void) {
    setHide(true); setCursor(""); set();
  }
  function pause(action: "pause" | "resume") {
    const revision = data?.pauseVersion ?? 0;
    if (attempt.current?.action!==action || attempt.current.revision!==revision) {
      attempt.current={ action,revision,id:crypto.randomUUID() };
    }
    const requestId=attempt.current.id;
    void mutation.run(async () => {
      await changeMatchingPause(JSON.stringify({ action,expectedVersion:revision,requestId }));
      attempt.current=null; setChanged(true); refresh();
    });
  }
  function dismiss(row: VolunteerRecommendation) {
    void mutation.run(async () => {
      await dismissRecommendation(row.projectId,row.opportunityId,row.requirementVersion);
      setChanged(true); refresh();
    });
  }
  function withdraw() {
    void mutation.run(async () => {
      const current = await loadVolunteer(new AbortController().signal);
      if (current.profile?.consent.matching) await saveVolunteer(JSON.stringify({
        action:"withdraw",consentKey:"matching",expectedVersion:current.profile.version,requestId:crypto.randomUUID(),
      }));
      setChanged(true); refresh(); profile.refresh();
    });
  }
  return <MemberShell><div className={institutionCard + " grid gap-4"}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-2"><h1 className="text-3xl font-bold">{t("title")}</h1><p>{t("intro")}</p></div>
      <Link className={button} href={profilePath}>{v("title")}</Link>
    </header>
    {!data && resource.error===null && <ProjectLoading />}
    {resource.error!==null && <ApiErrorNotice error={resource.error} retry={() => { setCursor(""); refresh(); }} signIn />}
    {data?.state==="closed" && <p>{t("closed")}</p>}
    {data?.state==="unavailable" && <p>{data.paused ? v("paused") : t("unavailable")}</p>}
    {data?.state==="ready" && <>
      <fieldset className="grid gap-3 rounded-lg border border-[var(--theme-border)] p-3 sm:grid-cols-2 xl:grid-cols-4">
        <legend className="px-1 font-medium">{t("filters")}</legend>
        <label>{v("departments")}<select className={institutionField} value={region} onChange={(event) => change(() => setRegion(event.target.value))}>
          <option value="">{v("blank")}</option>
          {volunteerDepartments.map((code,index) => <option key={code} value={code}>{departmentNames[index]}</option>)}
        </select></label>
        <label>{v("mode")}<select className={institutionField} value={mode} onChange={(event) => change(() => setMode(event.target.value))}>
          <option value="">{v("blank")}</option>
          {volunteerModes.map((item) => <option key={item} value={item}>{v(item)}</option>)}
        </select></label>
        <label>{v("skills")}<select className={institutionField} value={skill} onChange={(event) => change(() => setSkill(event.target.value))}>
          <option value="">{v("blank")}</option>
          {profile.data?.catalog.filter((item) => item.status==="active").map((item) => <option key={item.code} value={item.code}>{item.names[locale]}</option>)}
        </select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={weekly}
          onChange={(event) => change(() => setWeekly(event.target.checked))} />{t("weekly")}</label>
      </fieldset>
      {hide && resource.error===null && <ProjectLoading />}
      {!hide && <>
        {data.items.length===0 && <p role="status">{t("empty")}</p>}
        <ul className="grid gap-3 sm:grid-cols-2">{data.items.map((row) => <li key={row.opportunityId}
          className="grid min-w-0 content-start gap-2 rounded-lg border border-[var(--theme-border)] p-4">
          <h2 className="break-words font-semibold">{row.title}</h2>
          <p>{departmentNames[volunteerDepartments.indexOf(row.department)]} · {v(row.mode)}</p>
          <p className="font-medium">{t(row.classification)}</p>
          <ul className="grid list-disc gap-1 pl-5 text-sm">{row.reasons.map((reason) => <li key={reason}>{t(reason)}</li>)}</ul>
          <div className="flex flex-wrap gap-3">
            <Link className={button} href={"/projects/"+row.projectId+"/work?section=volunteers#opportunity-"+row.opportunityId}>{t("open")}</Link>
            <button type="button" className={button} disabled={mutation.busy} aria-label={t("dismiss")+" "+row.title} onClick={() => dismiss(row)}>{t("dismiss")}</button>
          </div>
        </li>)}</ul>
        <div className="flex flex-wrap gap-3">
          {cursor && <button className={button} type="button" onClick={() => { setCursor(""); setHide(true); }}>{t("first")}</button>}
          {data.nextCursor && <button className={institutionAction} type="button" onClick={() => { setCursor(data.nextCursor ?? ""); setHide(true); }}>{t("next")}</button>}
        </div>
      </>}
    </>}
    {data?.hasProfile && <div className="flex flex-wrap gap-3">
      {(data.state==="ready" || data.paused) && <button type="button" className={button} disabled={mutation.busy}
        onClick={() => pause(data.paused ? "resume" : "pause")}>{t(data.paused ? "resume" : "pause")}</button>}
      {profile.data?.profile?.consent.matching && <button type="button" className={button} disabled={mutation.busy} onClick={withdraw}>{t("withdraw")}</button>}
    </div>}
    {changed && <p role="status">{v("saved")}</p>}
    {mutation.error!==null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
  </div></MemberShell>;
}
