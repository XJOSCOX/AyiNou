
"use client";

import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { mentorshipGeographies, mentorshipRoles, mentorshipTopics, volunteerLanguages, volunteerModes,
  type MentorshipCandidate, type MentorshipPage, type MentorshipRequest } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionField, PersonalClaimChecks, useInstitutionResource } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { MemberSafetyControls } from "@/components/member-safety";
import { SettingsHistory } from "@/components/settings-disclosures";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { coordinationCopy } from "@/lib/mentorship-coordination-i18n";
import { mentorshipCopy } from "@/lib/mentorship-i18n";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { volunteerCopy } from "@/lib/volunteer-i18n";
import { mentorshipReportCategories } from "@ayinou/shared";
import { OpportunityPageHeader, OpportunityState, opportunitySecondary, opportunitySettingsCard, opportunityTag } from "./presentation";

export const coordinationApi = "/api/v1/me/mentorship/coordination";
export const coordinationPage = "/settings/opportunities/mentorship/coordination";
export const mentorshipProfilePage = "/settings/opportunities/mentorship";
export const coordinationField = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
export const coordinationGrid = "grid min-w-0 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3";
const tabs = ["recommendations", "discovery", "requests"] as const;
type Tab = typeof tabs[number];

export function useCoordinationCommand(after: () => void) {
  const mutation = useFeedMutation();
  const receipt = useRef<{ text: string; id: string } | null>(null);
  function send(command: object) {
    const text = JSON.stringify(command);
    if (receipt.current?.text !== text) receipt.current = { text, id: crypto.randomUUID() };
    const requestId = receipt.current.id;
    return mutation.run(async () => {
      await authorizedSocialRequest(coordinationApi, { method:"POST", body:JSON.stringify({ ...command, requestId }) });
      receipt.current = null;
      after();
    });
  }
  return { ...mutation, send };
}

export function CoordinationHeader({ children }: { children: ReactNode }) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  return <MemberShell><div className="grid min-w-0 gap-4 [overflow-wrap:anywhere]">
    <OpportunityPageHeader title={t("title")} description={t("intro")}
      back={{ href: mentorshipProfilePage, label: t("profile") }} />
    {children}
  </div></MemberShell>;
}

export function MentorshipCoordination() {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  const [tab, setTab] = useState<Tab>("recommendations");
  const read = useCallback((signal: AbortSignal): Promise<MentorshipPage<MentorshipRequest>> =>
    authorizedSocialRequest(coordinationApi, { signal, cache:"no-store" }), []);
  const result = useInstitutionResource(read);
  return <CoordinationHeader>
    {result.error !== null && <ApiErrorNotice error={result.error} retry={result.refresh} signIn />}
    {!result.data && result.error === null && <OpportunityState>{mentorshipCopy(locale)("loading")}</OpportunityState>}
    {result.data?.state === "closed" && <OpportunityState>{t("closed")}</OpportunityState>}
    {result.data?.state === "available" && <>
      <nav className={opportunitySettingsCard + " flex flex-wrap gap-2"} aria-label={t("title")}>
        {tabs.map(choice => <button type="button" key={choice} aria-pressed={choice === tab}
          onClick={() => setTab(choice)} className={opportunitySecondary + " aria-pressed:bg-[var(--theme-selected)]"}>{t(choice)}</button>)}
      </nav>
      {tab === "requests" ? <RequestsPage /> : <CandidatesPage key={tab} lane={tab} />}
    </>}
  </CoordinationHeader>;
}

function CandidatesPage({ lane }: { lane: "recommendations" | "discovery" }) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale), m = mentorshipCopy(locale), v = volunteerCopy(locale), o = opportunityCopy(locale);
  const languageNames = new Intl.DisplayNames([locale], { type:"language" });
  const [query, setQuery] = useState("role=mentee");
  const [cursor, setCursor] = useState<string>();
  const load = useCallback((signal: AbortSignal): Promise<MentorshipPage<MentorshipCandidate>> => {
    const params = new URLSearchParams(query);
    params.set("lane", lane);
    if (cursor) params.set("cursor",cursor);
    return authorizedSocialRequest(coordinationApi + "/matches?" + params, { signal, cache:"no-store" });
  }, [query,cursor,lane]);
  const resource = useInstitutionResource(load);
  const filters = [
    ["topic",m("topics"),mentorshipTopics,m],
    ["mode",m("mode"),volunteerModes,o],
    ["geography",m("geography"),mentorshipGeographies,m],
    ["language",m("languages"),volunteerLanguages,v],
  ] as const;
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["role","topic","mode","geography","language","skill"])
      if (coordinationField(form,key)) params.set(key,coordinationField(form,key));
    setCursor(undefined);
    setQuery(params.toString());
  }
  return <section className={opportunitySettingsCard}>
    <h2 className="text-lg font-semibold">{t(lane)}</h2>
    <form className={coordinationGrid} onSubmit={apply}>
      <label>{m("roles")}<select className={institutionField} name="role" defaultValue="mentee">
        {mentorshipRoles.map(role => <option key={role} value={role}>{m(role)}</option>)}
      </select></label>
      {filters.map(([key,label,values]) => <label key={key} className="min-w-0">{label}
        <select name={key} className={institutionField}><option value="">{t("any")}</option>
          {values.map(value => <option key={value} value={value}>
            {key === "mode" ? o(value as typeof volunteerModes[number]) :
              key === "language" ? (value === "asl" ? v("asl") : languageNames.of(value)) :
              m(value as typeof mentorshipTopics[number] | typeof mentorshipGeographies[number])}
          </option>)}
        </select>
      </label>)}
      <label>{t("skill")}<input name="skill" className={institutionField} pattern="[a-z][a-z0-9_]{2,39}" maxLength={40} /></label>
      <div><button className={institutionAction}>{t("apply")}</button></div>
    </form>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {resource.data?.state === "unavailable" && <OpportunityState>{t("unavailable")}</OpportunityState>}
    {resource.data?.state === "available" && resource.data.items.length === 0 && <p>{t("none")}</p>}
    <div className="grid min-w-0 gap-3 xl:grid-cols-2">
      {resource.data?.items.map(item => <Candidate key={item.username} item={item} refresh={resource.refresh} />)}
    </div>
    {resource.data?.next && <button type="button" className={opportunitySecondary + " w-fit"} onClick={() => setCursor(resource.data?.next ?? undefined)}>{t("more")}</button>}
  </section>;
}

function Candidate({ item, refresh }: { item: MentorshipCandidate; refresh: () => void }) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  const [sent, setSent] = useState(false);
  const command = useCoordinationCommand(refresh);
  return <article className="grid min-w-0 content-start gap-2 rounded-lg border border-[var(--theme-border)] p-3">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex flex-wrap items-center gap-2 font-semibold"><Link href={"/members/" + encodeURIComponent(item.username)}>{item.name}</Link>
        {item.identityVerified && <PersonalClaimChecks claims={["identity"]} />}</h3>
      <span className={opportunityTag}>{t(item.classification)}</span>
    </header>
    <SettingsHistory title={t(item.classification)}>
      <ul className="list-disc space-y-1 ps-5">{item.reasons.map(reason => <li key={reason}>{t(reason)}</li>)}</ul>
    </SettingsHistory>
    <div className="flex flex-wrap items-start gap-2">
      <button type="button" className={opportunitySecondary} disabled={command.busy}
        onClick={() => void command.send({ action:"dismiss", selection:item.selection })}>{t("dismiss")}</button>
      {item.canRequest && !sent && <SettingsHistory title={t("send")}>
        <form className="grid min-w-0 gap-2" onSubmit={event => {
          event.preventDefault();
          const introduction = coordinationField(new FormData(event.currentTarget),"introduction");
          void command.send({ action:"send", selection:item.selection, introduction }).then(ok => { if (ok) setSent(true); });
        }}>
          <label>{t("introduction")}<textarea className={institutionField} rows={2} maxLength={400} name="introduction" /></label>
          <button className={institutionAction} disabled={command.busy}>{t("send")}</button>
        </form>
      </SettingsHistory>}
      {sent && <span role="status" className={opportunityTag}>{t("sent")}</span>}
    </div>
    {command.error !== null && <ApiErrorNotice error={command.error} signIn />}
  </article>;
}

function RequestsPage() {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  const [before, setBefore] = useState<string>();
  const load = useCallback((signal: AbortSignal): Promise<MentorshipPage<MentorshipRequest>> =>
    authorizedSocialRequest(coordinationApi + (before ? "?before=" + before : ""), { signal, cache:"no-store" }), [before]);
  const resource = useInstitutionResource(load);
  return <section className={opportunitySettingsCard}>
    <h2 className="text-lg font-semibold">{t("requests")}</h2>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {resource.data?.items.length === 0 && <p>{t("none")}</p>}
    <ul className="grid gap-2">{resource.data?.items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--theme-border)] py-2">
      <span className="font-semibold">{item.peer?.name ?? t(item.direction)}</span>
      <span className={opportunityTag}>{t(item.state)}</span>
      <Link className={opportunitySecondary + " ms-auto"} href={coordinationPage + "/requests/" + item.id}>{t("openRequest")}</Link>
      {item.relationship && <Link className={opportunitySecondary} href={coordinationPage + "/relationships/" + item.relationship}>{t("openWorkspace")}</Link>}
    </li>)}</ul>
    {resource.data?.next && <button type="button" className={opportunitySecondary + " w-fit"}
      onClick={() => setBefore(resource.data?.next ?? undefined)}>{t("more")}</button>}
  </section>;
}

export function CoordinationSafety({ request, reported, username, refresh }: {
  request: string; reported: boolean; username?: string; refresh: () => void;
}) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  const command = useCoordinationCommand(refresh);
  return <div className="grid min-w-0 gap-2">
    <p className="text-sm text-[var(--theme-body)]">{t("safety")}</p>
    {reported ? <OpportunityState>{t("reported")}</OpportunityState> :
      <SettingsHistory title={t("report")}>
        <form className="grid min-w-0 gap-2" onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void command.send({action:"report",id:request,category:coordinationField(form,"category"),explanation:coordinationField(form,"explanation")});
        }}>
          <label>{t("reason")}<select className={institutionField} name="category">
            {mentorshipReportCategories.map(category => <option key={category} value={category}>{t(category)}</option>)}
          </select></label>
          <label>{t("report")}<textarea className={institutionField} required minLength={10} maxLength={1000} name="explanation" rows={3} /></label>
          <button className={institutionAction} disabled={command.busy}>{t("report")}</button>
        </form>
      </SettingsHistory>}
    {command.error !== null && <ApiErrorNotice error={command.error} signIn />}
    {username && <MemberSafetyControls username={username} collapsible />}
  </div>;
}

export function MentorshipRequestDetail({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = coordinationCopy(locale);
  const load = useCallback((signal: AbortSignal): Promise<MentorshipRequest> =>
    authorizedSocialRequest(coordinationApi + "/requests/" + id, { signal, cache:"no-store" }), [id]);
  const resource = useInstitutionResource(load);
  const command = useCoordinationCommand(resource.refresh);
  const request = resource.data;
  return <CoordinationHeader>
    <Link className={opportunitySecondary + " w-fit justify-self-end"} href={coordinationPage}>{t("requests")}</Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {request && <section className={opportunitySettingsCard}>
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">{request.peer?.name ?? t("openRequest")}
        {request.peer?.identityVerified && <PersonalClaimChecks claims={["identity"]} />}</h2>
      <span className={opportunityTag}>{t(request.state)}</span>
      {request.introduction && <p>{request.introduction}</p>}
      {request.state === "pending" && <>
        <p className="text-sm">{t("expires")} <time dateTime={request.expiresAt}>{new Date(request.expiresAt).toLocaleString(locale)}</time></p>
        <div className="flex flex-wrap gap-2">
          {(request.direction === "received" ? ["accept","decline"] as const : ["withdraw"] as const).map(action =>
            <button type="button" className={action === "accept" ? institutionAction : opportunitySecondary} key={action}
              disabled={command.busy} onClick={() => void command.send({ action, id, expectedVersion:request.version })}>{t(action)}</button>)}
        </div>
      </>}
      {request.relationship && <Link className={opportunitySecondary + " w-fit"} href={coordinationPage + "/relationships/" + request.relationship}>{t("openWorkspace")}</Link>}
      {command.error !== null && <ApiErrorNotice error={command.error} signIn />}
      <CoordinationSafety request={id} reported={request.reported} username={request.peer?.username} refresh={resource.refresh} />
    </section>}
  </CoordinationHeader>;
}
