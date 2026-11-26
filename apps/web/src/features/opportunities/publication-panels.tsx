"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { professionalOpportunityTypes, opportunityReviewChecks, opportunityReportReasons, volunteerDepartments } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { MemberShell } from "@/components/member-shell";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource, VerifiedCheck } from "@/components/institution-ui";
import { accountMessages } from "@/lib/account-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { publicationCopy } from "@/lib/opportunity-publication-i18n";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { departmentNames } from "@/lib/volunteer-i18n";
import { TypeDetails } from "./detail-fields";
import { OpportunityPageHeader, OpportunityState, opportunitySecondary, opportunityTag } from "./presentation";
import { listedOpportunities, workspaceCommand, workspaceRead, type Interest, type InterestPreview, type PublicationCase,
  type PublicationSettingsView, type PublishedOpportunity, type Queue, type ReviewCase } from "./publication-api";

function field(form:FormData,name:string) { return String(form.get(name) ?? "").trim(); }

function Command({label,parameters,workspace,children,extract,after,confirmation=true,disclosure}:{
  label:string;parameters:object;workspace?:string;children?:ReactNode;extract?:(form:FormData)=>object;
  after?:(result:unknown)=>void;confirmation?:boolean;disclosure?:string;
}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  const mutation=useFeedMutation();
  const receipt=useRef<{body:string;id:string}|null>(null);
  const [saved,setSaved]=useState(false);
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.busy) return;
    const actual={...parameters,...(confirmation?{confirmed:true}:{}),...extract?.(new FormData(event.currentTarget))};
    const key=JSON.stringify(actual);
    if (receipt.current?.body!==key) receipt.current={body:key,id:crypto.randomUUID()};
    const id=receipt.current.id;
    void mutation.run(async()=>{
      const value=await workspaceCommand({...actual,requestId:id},workspace);
      setSaved(true);
      after?.(value);
    });
  }
  return <details className="group/command min-w-0 overflow-hidden rounded-md border border-[var(--theme-border)]">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0 break-words">{label}</span>
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--theme-control)]">
        <span className="mb-0.5 size-2 rotate-45 border-e-[1.5px] border-b-[1.5px] group-open/command:mt-1 group-open/command:rotate-[225deg]" />
      </span>
    </summary>
    <form onSubmit={submit} className="grid min-w-0 gap-3 border-t border-[var(--theme-border)] p-3 sm:p-4">
      {disclosure && <p>{disclosure}</p>}
      {children}
      {confirmation && <label className="flex gap-2"><input required type="checkbox" />{t("confirmed")}</label>}
      <button className={institutionAction+" w-fit"} disabled={mutation.busy}>{label}</button>
      {saved && <p role="status">{t("saved")}</p>}
      {mutation.error!==null && <ApiErrorNotice error={mutation.error} signIn />}
    </form>
  </details>;
}

function Reason({label}:{label:string}) {
  return <label>{label}<textarea className={institutionField} required minLength={10} maxLength={500} name="reason" rows={3} /></label>;
}

export function OrganizationPublication({organization,opportunity,updated}:{organization:string;opportunity:string;updated:()=>void}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  const common=opportunityCopy(locale);
  const load=useCallback((signal:AbortSignal)=>workspaceRead<PublicationCase>("organization_case",{organization,opportunity},signal),[organization,opportunity]);
  const resource=useInstitutionResource(load);
  const data=resource.data;
  if (resource.error!==null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  if (!data) return <p role="status">{t("loading")}</p>;
  if (!data.enabled) return <p role="status">{t("disabled")}</p>;
  const target={organization,opportunity,version:data.version};
  function refresh(){resource.refresh();updated();}
  return <section className="grid gap-3">
    <h3 className="font-semibold">{t("publication")} · {common(data.status)}</h3>
    {data.review?.explanation && <p className="break-words" dir="auto">{data.review.explanation}</p>}
    {data.canSubmit && data.status==="draft" && <Command label={t("submit")} parameters={{action:"submit",...target}}
      extract={form=>({ownership:field(form,"ownership")||undefined})} after={refresh} disclosure={t("reviewNotice")}>
      <label>{t("ownership")}<textarea className={institutionField} name="ownership" maxLength={500} /></label>
    </Command>}
    {data.canSubmit && data.review && ["rejected","changes_requested"].includes(data.review.state) && !data.review.challenged &&
      <Command label={t("challenge")} parameters={{action:"challenge",...target}} extract={form=>({reason:field(form,"reason")})} after={refresh}>
        <Reason label={t("reason")} />
      </Command>}
    {data.canPublish && data.status==="approved" && <Command label={t("publish")} parameters={{action:"publish",...target}} after={refresh} />}
    {data.canPublish && data.status==="published" && <Command label={t("close")} parameters={{action:"close",...target}} after={refresh} />}
    {data.canPublish && ["closed","withdrawn","rejected","restricted","expired"].includes(data.status) &&
      <Command label={t("archive")} parameters={{action:"archive",...target}} after={refresh} />}
    {data.canSubmit && ["submitted","approved","published","changes_requested","rejected"].includes(data.status) &&
      <Command label={t("withdraw")} parameters={{action:"withdraw",...target}} after={refresh} />}
    {data.canReadInterest && data.status==="published" && <details className={institutionCard}>
      <summary className="cursor-pointer">{t("receivedInterest")}</summary><InterestList recipient={{organization,opportunity}} />
    </details>}
  </section>;
}

function InterestList({recipient}:{recipient?:{organization:string;opportunity:string}}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  const common=opportunityCopy(locale);
  const [after,setAfter]=useState("");
  const organization=recipient?.organization,opportunity=recipient?.opportunity;
  const load=useCallback((signal:AbortSignal)=>workspaceRead<Queue<Interest>>(organization&&opportunity?"organization_interest":"my_interest",
    {...(organization&&opportunity?{organization,opportunity}:{}),...(after?{after}:{})},signal),[organization,opportunity,after]);
  const resource=useInstitutionResource(load);
  if (resource.error!==null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  if (!resource.data) return <OpportunityState>{t("loading")}</OpportunityState>;
  if (!resource.data.enabled) return <OpportunityState>{t("disabled")}</OpportunityState>;
  if (!resource.data.items.length) return <OpportunityState>{t(recipient ? "empty" : "noInterest")}</OpportunityState>;
  return <div className="grid gap-2">
    {resource.data.items.map(record=><article className="grid min-w-0 gap-3 rounded-lg border border-[var(--theme-border)] p-4" key={record.id}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 break-words font-semibold" dir="auto">{record.title ?? record.shared_identity?.displayName}</h2>
        <span className={opportunityTag}>{t(record.state)===record.state?common(record.state as "withdrawn"):t(record.state)}</span>
      </header>
      {record.shared_identity && <p className="break-words text-sm text-[var(--theme-body)]">@{record.shared_identity.username}</p>}
      {record.statement && <p className="break-words" dir="auto">{record.statement}</p>}
      {!recipient && record.state!=="withdrawn" && <Command label={t("withdraw")}
        parameters={{action:"interest_withdraw",interest:record.id,version:record.version}} after={resource.refresh} disclosure={t("withdrawalNote")} />}
      {recipient && (["submitted","acknowledged","follow_up"].includes(record.state)) &&
        (record.state==="submitted"?["acknowledged","closed"]:record.state==="acknowledged"?["follow_up","closed"]:["closed"])
          .map(state=><Command key={state} label={state==="closed"?common("closed"):t(state)} parameters={{
            action:"interest_state",...recipient,interest:record.id,version:record.version,state}} after={resource.refresh} />)}
    </article>)}
    {resource.data.items.length===20 && <button className={institutionLink} onClick={()=>setAfter(resource.data!.items[19].id)}>{t("next")}</button>}
  </div>;
}
export function MyOpportunityInterest() {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  return <MemberShell><div className="grid min-w-0 gap-4">
    <OpportunityPageHeader title={t("myInterest")} description={t("myInterestHelp")}
      back={{ href: "/settings", label: accountMessages[locale].settings }} />
    <section className={institutionCard} aria-label={t("myInterest")}><InterestList /></section>
  </div></MemberShell>;
}

function InterestForm({organization,item}:{organization:string;item:PublishedOpportunity}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  const [open,setOpen]=useState(false);
  const load=useCallback((signal:AbortSignal)=>open?
    workspaceRead<InterestPreview>("interest_preview",{organization,opportunity:item.id},signal):Promise.resolve(null),[open,organization,item.id]);
  const resource=useInstitutionResource(load);
  return <div className="grid gap-2">
    <button type="button" className={institutionAction+" w-fit"} onClick={()=>setOpen(true)}>{t("interest")}</button>
    {resource.error!==null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {open && !resource.data && resource.error===null && <p role="status">{t("loading")}</p>}
    {open && resource.data && <Command label={t("interest")} disclosure={t("interestHelp")} confirmation={false}
      parameters={{action:"express",organization,opportunity:item.id,version:resource.data.revision,identity:resource.data.identity}}
      extract={form=>({statement:field(form,"statement"),consent:form.has("consent"),adult:form.has("adult")})}>
      <p>{resource.data.identity.displayName} · @{resource.data.identity.username}</p>
      <label>{t("interestStatement")}<textarea className={institutionField} required rows={3} maxLength={500} name="statement" /></label>
      <label className="flex gap-2"><input type="checkbox" required name="consent" />{t("consent")}</label>
      <label className="flex gap-2"><input type="checkbox" required name="adult" />{t("adult")}</label>
    </Command>}
  </div>;
}

function ExternalDestination({organization,item}:{organization:string;item:PublishedOpportunity}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  const [url,setUrl]=useState<string|null>(null);
  const mutation=useFeedMutation();
  function load() {
    setUrl(null);
    void mutation.run(async()=>{
      const destination=await workspaceCommand<{url:string}>({action:"destination",organization,opportunity:item.id,version:item.version,confirmed:true});
      const parsed=new URL(destination.url);
      if (parsed.protocol==="https:" && !parsed.username && !parsed.password) setUrl(parsed.href);
    });
  }
  return <details className="grid gap-2"><summary className="cursor-pointer font-semibold">{t("openExternal")}</summary>
    <p>{t("externalWarning")}</p>
    <button type="button" disabled={mutation.busy} className={institutionAction} onClick={load}>{t("openExternal")}</button>
    {url && <a className={institutionLink+" block break-all"} href={url} target="_blank" rel="noopener noreferrer">
      {t("externalLink")} · {new URL(url).hostname}</a>}
    {mutation.error!==null && <ApiErrorNotice error={mutation.error} signIn />}
  </details>;
}
export function PublicOpportunityList({organization,signedIn}:{organization:string;signedIn:boolean}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  const common=opportunityCopy(locale);
  const [cursor,setCursor]=useState<string|null>(null);
  const load=useCallback((signal:AbortSignal)=>listedOpportunities(organization,cursor,signal,signedIn),[organization,cursor,signedIn]);
  const resource=useInstitutionResource(load);
  return <section className={institutionCard+" grid gap-3"}>
    <h2 className="text-xl font-semibold">{t("published")}</h2>
    {resource.error!==null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!resource.data && resource.error===null && <p role="status">{t("loading")}</p>}
    {resource.data?.enabled===false && <OpportunityState>{t("disabled")}</OpportunityState>}
    {resource.data?.enabled && (resource.data.items.length ? resource.data.items.map(item=><article key={item.id+":"+item.version} className="grid min-w-0 gap-3 rounded-lg border border-[var(--theme-border)] p-4 sm:p-5">
      <h3 className="text-lg font-semibold break-words" dir="auto">{item.snapshot.title}</h3>
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--theme-body)]">
        <span className={opportunityTag}>{common(item.snapshot.type)}</span>
        <span className={opportunityTag}>{common(item.snapshot.mode)}</span>
        <span className="inline-flex min-w-0 items-center gap-1.5"><span className="break-words">{item.organization}</span>
          {item.verified && <VerifiedCheck label={t("verified")} />}
        </span>
      </div>
      <p className="text-sm text-[var(--theme-body)]">
        {new Intl.DisplayNames([locale],{type:"region"}).of(item.snapshot.country)}
        {item.snapshot.department?" · "+departmentNames[volunteerDepartments.indexOf(item.snapshot.department as typeof volunteerDepartments[number])]:""}
        {item.snapshot.closesOn && <> · {common("closes")} <time dateTime={item.snapshot.closesOn}>{item.snapshot.closesOn}</time></>}
      </p>
      <p className="whitespace-pre-wrap break-words" dir="auto">{item.snapshot.description}</p>
      <TypeDetails value={item.snapshot.details} />
      <p>{t("reviewNotice")}</p><p>{t("moneyNotice")}</p>
      {item.methods.event && <Link className={opportunitySecondary+" w-fit"} href={"/events/"+item.methods.event}>{t("nativeEvent")}</Link>}
      {signedIn && <>
        {item.methods.external && <ExternalDestination organization={organization} item={item} />}
        {item.methods.interest && <InterestForm organization={organization} item={item} />}
        <Command label={t("report")} confirmation={false} parameters={{action:"report",organization,opportunity:item.id,version:item.version}}
          extract={form=>({reason:field(form,"reason"),category:field(form,"category")})}>
          <label>{t("report")}<select className={institutionField} name="category">{opportunityReportReasons.map(c=><option key={c} value={c}>{t(c)}</option>)}</select></label>
          <Reason label={t("reason")} />
        </Command>
      </>}
    </article>) : <p>{t("empty")}</p>)}
    {resource.data?.next && <button className={institutionLink} onClick={()=>setCursor(resource.data!.next!)}>{t("next")}</button>}
  </section>;
}

export function PublicationStaff({workspace, founder}:{workspace:string;founder:boolean}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  const common=opportunityCopy(locale);
  const [cursor,setCursor]=useState("");
  const load=useCallback((signal:AbortSignal)=>workspaceRead<Queue<ReviewCase>>(founder?"admin_queue":"review_queue",
    cursor?{after:cursor}:{},signal,workspace),[founder,cursor,workspace]);
  const resource=useInstitutionResource(load);
  const read=useCallback((signal:AbortSignal)=>founder?workspaceRead<PublicationSettingsView>("settings",{},signal,workspace):Promise.resolve(null),[founder,workspace]);
  const configuration=useInstitutionResource(read);
  const data=configuration.data;
  function after(){resource.refresh();configuration.refresh();}
  return <section className={institutionCard+" grid min-w-0 gap-3"}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{t(founder?"settings":"reviewQueue")}</h2>
      {data && <span className={opportunityTag}>{common("version")} {data.version}</span>}
    </header>
    {configuration.error!==null && <ApiErrorNotice error={configuration.error} retry={configuration.refresh} signIn />}
    {resource.error!==null && <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />}
    {data && <>
      <p className="text-sm leading-relaxed text-[var(--theme-body)]">{t("readiness")}</p>
      <Command key={data.version} label={common("configuration")} parameters={{action:"configure",version:data.version}} workspace={workspace}
        after={after} extract={form=>({reason:field(form,"reason"),settings:{
          types:form.getAll("type"),methods:form.getAll("method"),submissionsPerDay:Number(field(form,"submissionsPerDay")),
          interestPerDay:Number(field(form,"interestPerDay")),reportsPerDay:Number(field(form,"reportsPerDay")),
          staffingPlan:field(form,"staffingPlan"),readinessNotes:field(form,"readinessNotes"),
        }})}>
        <fieldset className="flex flex-wrap gap-3"><legend>{common("type")}</legend>
          {professionalOpportunityTypes.map(type=><label className="flex gap-1" key={type}><input name="type" value={type} type="checkbox"
            defaultChecked={data.settings.types.includes(type)} />{common(type)}</label>)}
        </fieldset>
        <fieldset className="flex flex-wrap gap-3"><legend>{common("method")}</legend>
          {(["external","expression_of_interest","event_registration"] as const).map(method=><label className="flex gap-1" key={method}>
            <input name="method" value={method} type="checkbox" defaultChecked={data.settings.methods.includes(method)} />{common(method)}</label>)}
        </fieldset>
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        {([["submissionsPerDay","submissionLimit",20],["interestPerDay","interestLimit",10],["reportsPerDay","reportLimit",8]] as const)
          .map(([name,label,max])=><label key={name}>{t(label)}
            <input className={institutionField} required name={name} type="number" min={1} max={max} defaultValue={data.settings[name]} />
          </label>)}
        </div>
        <label>{t("staffingPlan")}<input className={institutionField} maxLength={500} name="staffingPlan" defaultValue={data.settings.staffingPlan} /></label>
        <label>{t("readinessNotes")}<input className={institutionField} maxLength={500} name="readinessNotes" defaultValue={data.settings.readinessNotes} /></label>
        <Reason label={t("reason")} />
      </Command>
      {data.history.length>0 && <ul>{data.history.map(item=><li key={item.id}>
        {common("version")} {item.result.version} · <time dateTime={item.recorded_at}>{new Date(item.recorded_at).toLocaleString(locale)}</time> · {item.explanation}
      </li>)}</ul>}
    </>}
    {!resource.data && resource.error===null && <p role="status">{t("loading")}</p>}
    {resource.data?.enabled===false && <OpportunityState>{t("disabled")}</OpportunityState>}
    {resource.data?.enabled && <>
      {founder && <>
        <Command label={t("appoint")} parameters={{action:"appoint"}} workspace={workspace} after={after}
          extract={form=>({reviewer:field(form,"reviewer"),country:field(form,"country"),department:field(form,"department")||null,
            expiresAt:new Date(field(form,"expiresAt")).toISOString(),reason:field(form,"reason")})}>
          <label>{t("reviewer")}<input className={institutionField} name="reviewer" maxLength={36} required /></label>
          <label>{common("country")}<input className={institutionField} name="country" pattern="[A-Z]{2}" defaultValue="HT" required /></label>
          <label>{common("department")}<select className={institutionField} name="department">
            <option value="">{common("none")}</option>
            {volunteerDepartments.map((code,i)=><option key={code} value={code}>{departmentNames[i]}</option>)}
          </select></label>
          <label>{t("expires")}<input required className={institutionField} name="expiresAt" type="datetime-local" /></label>
          <Reason label={t("reason")} />
        </Command>
        {resource.data.grants?.map(grant=><Command key={grant.id} label={t("revoke")+" · "+(grant.username ?? grant.id)}
          parameters={{action:"revoke",grant:grant.id}} workspace={workspace} after={after} extract={form=>({reason:field(form,"reason")})}>
          <p>{grant.country} {grant.department} · {new Date(grant.expires_at).toLocaleString(locale)}</p>
          <Reason label={t("reason")} />
        </Command>)}
      </>}
      {resource.data.items.length===0 && <p>{t("empty")}</p>}
      {resource.data.items.map(item=><article className={institutionCard+" grid gap-3"} key={item.opportunity+":"+item.revision}>
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="break-words font-semibold" dir="auto">{item.title}</h3>
            <p className="mt-1 text-sm text-[var(--theme-body)]">{item.country} {item.department} · {common("version")} {item.revision}</p>
          </div>
          <span className={opportunityTag}>{t(item.state)===item.state?common(item.state as "submitted"):t(item.state)}</span>
        </header>
        {founder && item.state==="assigned" && <Command label={t("release")} workspace={workspace} after={after}
          parameters={{action:"release",opportunity:item.opportunity,version:item.revision}} extract={form=>({reason:field(form,"reason")})}>
          <Reason label={t("reason")} />
        </Command>}
        {founder ? <Command label={t("assign")} parameters={{action:"assign",opportunity:item.opportunity,version:item.revision}}
          workspace={workspace} after={after} extract={form=>({grant:field(form,"grant"),reason:field(form,"reason")})}>
          <label>{t("grant")}<select required className={institutionField} name="grant">
            <option value="">{common("none")}</option>
            {resource.data?.grants?.filter(g=>g.country===item.country && (g.department??null)===(item.department??null))
              .map(grant=><option key={grant.id} value={grant.id}>{grant.username ?? grant.reviewer}</option>)}
          </select></label>
          <Reason label={t("reason")} />
        </Command> : <>
          <p className="whitespace-pre-wrap break-words" dir="auto">{item.snapshot?.description}</p>
          <TypeDetails value={item.snapshot?.details} />
          {item.snapshot?.references?.map(url=><p className="break-all" key={url}>{url}</p>)}
          {item.ownership && <p className="break-words">{t("ownership")} · {item.ownership}</p>}
          {item.challenge_reason && <p className="break-words">{t("challenge")} · {item.challenge_reason}</p>}
          {([["approved","approve"],["changes_requested","changes"],["rejected","reject"]] as const).map(([decision,label])=>
            <Command key={decision} label={t(label)} workspace={workspace} after={after}
              parameters={{action:"decide",opportunity:item.opportunity,version:item.revision,decision}}
              extract={form=>({reason:field(form,"reason"),checks:form.getAll("checks")})}>
              {decision==="approved" && <fieldset className="grid gap-1"><legend>{t("reviewNotice")}</legend>
                {opportunityReviewChecks.map(check=><label key={check} className="flex gap-2">
                  <input required type="checkbox" name="checks" value={check} />{t(check)}
                </label>)}</fieldset>}
              <Reason label={t("reason")} />
            </Command>)}
          <Command label={t("recuse")} confirmation={false} workspace={workspace} after={after}
            parameters={{action:"recuse",opportunity:item.opportunity,version:item.revision}}
            extract={form=>({reason:field(form,"reason")})}><Reason label={t("reason")} /></Command>
        </>}
      </article>)}
      {resource.data.next && <button className={institutionLink} onClick={()=>setCursor(resource.data!.next!)}>{t("next")}</button>}
      <OpportunityReports workspace={workspace} founder={founder} />
    </>}
  </section>;
}


function OpportunityReports({workspace,founder}:{workspace:string;founder:boolean}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  const [before,setBefore]=useState("");
  const load=useCallback((signal:AbortSignal)=>workspaceRead<{items:{id:number;opportunity:string;revision:number;
    explanation:string;category:string;grant_id?:string}[]}>(founder?"reports":"review_reports",
    before?{before}:{},signal,workspace),[workspace,founder,before]);
  const result=useInstitutionResource(load);
  return <section className="grid gap-2">
    <h3 className="font-semibold">{t("reports")}</h3>
    {result.error!==null && <ApiErrorNotice error={result.error} retry={result.refresh} signIn />}
    {result.data?.items.length===0 && <p>{t("empty")}</p>}
    {result.data?.items.map(report=><div key={report.id} className={institutionCard+" grid gap-2"}>
      <p><strong>{t(report.category)}</strong> · {report.opportunity}</p><p className="break-words" dir="auto">{report.explanation}</p>
      {report.grant_id && <Command label={t("restrict")} workspace={workspace} after={result.refresh}
        parameters={{action:"restrict",opportunity:report.opportunity,version:report.revision,grant:report.grant_id}}
        extract={form=>({reason:field(form,"reason")})}><Reason label={t("reason")} /></Command>}
    </div>)}
    {result.data?.items.length===20 && <button className={institutionLink} onClick={()=>setBefore(String(result.data!.items[19].id))}>{t("next")}</button>}
  </section>;
}
