"use client";

import Link from "next/link";
import { NeedImpactConsent } from "@/features/impact/member-controls";
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { LinkNeedOption, LinkProjectPreview, NeedProjectLink, NeedProjectLinkLane, NeedProjectLinkPage } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { ApiRequestError } from "@/lib/api-errors";
import { useLocale } from "@/lib/locale-store";
import { needsMessages } from "@/lib/community-needs-i18n";
import { needReviewLabel } from "@/lib/community-needs-review-i18n";
import { needProjectLabel } from "@/lib/need-project-links-i18n";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";

const root="/api/v1/private/need-project-links";
export const needLinkWorkspace="/communities/intake/links";

function useLinkPage<T>(path: string, workspace?: string) {
  const [cursor,setCursor]=useState("");
  const load=useCallback((signal: AbortSignal):Promise<NeedProjectLinkPage<T>> =>
    authorizedRequest(path+(cursor ? (path.includes("?") ? "&" : "?")+"after="+cursor : ""),{
      signal,cache:"no-store",headers:workspace ? {"X-Ayinou-Workspace":workspace} : undefined,
    }),[cursor,path,workspace]);
  const result=useInstitutionResource(load);
  return {...result,cursor,setCursor};
}

function LinkError({ error }: { error: unknown }) {
  const [locale]=useLocale();
  const copy=needsMessages[locale];
  if(error==null)return null;
  const status=error instanceof ApiRequestError ? error.status : 0;
  return <p role="alert" className={institutionErrorBox}>{status===409 ? copy.stale : status===403 ? copy.forbidden
    : status===400 ? copy.badInput : status===404 ? needProjectLabel(locale,"unavailable") : copy.failure}</p>;
}

function PageControls({ cursor, next, change }: { cursor:string; next?:string|null; change:(cursor:string)=>void }) {
  const [locale]=useLocale();
  const copy=needsMessages[locale];
  return <div className="flex flex-wrap gap-3">
    {cursor && <button type="button" className={institutionLink} onClick={()=>change("")}>← {copy.back}</button>}
    {next && <button type="button" className={institutionLink} onClick={()=>change(next)}>{copy.more}</button>}
  </div>;
}

export function NeedLinkPicker({ selected, select, draft = false }: { selected:string; select:(id:string)=>void; draft?:boolean }) {
  const [locale]=useLocale();
  const [search,setSearch]=useState("");
  const t=(key:string)=>needProjectLabel(locale,key);
  const page=useLinkPage<LinkNeedOption>(root+"/options");
  if(!page.data)return page.error instanceof ApiRequestError && page.error.status===404 ? null : <LinkError error={page.error} />;
  const filtered=page.data.items.filter(item=>item.id===selected||item.title.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
  return <div className="grid min-w-0 gap-2">
    <label>{t("search")}<input type="search" className={institutionField} value={search} onChange={event=>setSearch(event.target.value)} /></label>
    <label>{t(draft?"draft":"need")}<select className={institutionField} value={selected} onChange={event=>select(event.target.value)}>
      <option value="">{t("select")}</option>
      {selected&&!filtered.some(item=>item.id===selected)&&<option value={selected}>{t("need")}</option>}
      {filtered.map(item=><option key={item.id} value={item.id}>{item.title} · {item.community ?? item.slug}</option>)}
    </select></label>
    {draft&&<p className="text-sm">{t("draftHelp")}</p>}
    <PageControls cursor={page.cursor} next={page.data.nextCursor} change={page.setCursor} />
  </div>;
}

function LinkCommand({ action, fields, submit, children }: {
  action:string; fields:(form:FormData)=>object; submit:(payload:object)=>Promise<void>; children?:ReactNode;
}) {
  const [locale]=useLocale();
  const t=(key:string)=>needProjectLabel(locale,key);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);
  const receipt=useRef<{body:string;id:string}|null>(null);
  async function send(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy)return;
    const form=new FormData(event.currentTarget);
    if(!form.has("confirm"))return;
    const payload=fields(form);
    const body=JSON.stringify(payload);
    if(receipt.current?.body!==body)receipt.current={body,id:crypto.randomUUID()};
    setBusy(true);setError(null);
    try {
      await submit({...payload,confirmed:true,requestId:receipt.current.id});
      receipt.current=null;
    } catch(cause){setError(cause);} finally{setBusy(false);}
  }
  return <form className="mt-3 grid min-w-0 gap-3" onSubmit={send}>
    <fieldset className="grid min-w-0 gap-3" disabled={busy}>
      {children}
      <label className="flex items-start gap-2"><input type="checkbox" name="confirm" className="mt-1" required />{needReviewLabel(locale,"confirm")}</label>
      <button type="submit" className={institutionAction+" justify-self-start"}>{t(action)}</button>
    </fieldset>
    <LinkError error={error} />
  </form>;
}

function actions(item:NeedProjectLink,lane:NeedProjectLinkLane) {
  if(lane==="admin")return ["assign"];
  if(lane==="review")return ["approve","reject"];
  const options=[];
  if(item.asAuthor&&item.state==="awaiting_consent")options.push("consent","decline");
  if((item.asAuthor||item.asOrganizer)&&["awaiting_consent","awaiting_review","approved"].includes(item.state))options.push("withdraw");
  return options;
}

function LinkRecord({ item,lane,workspace,refresh }: {
  item:NeedProjectLink; lane:NeedProjectLinkLane; workspace?:string; refresh:()=>void;
}) {
  const [locale]=useLocale();
  const t=(key:string)=>needProjectLabel(locale,key);
  const date=new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"});
  const [command,setCommand]=useState("");
  const options=actions(item,lane);
  const selected=options.includes(command) ? command : "";
  async function submit(payload:object) {
    await authorizedRequest(root+"/"+item.id+"?lane="+lane,{
      method:"PATCH",headers:workspace?{"X-Ayinou-Workspace":workspace}:undefined,
      body:JSON.stringify({...payload,action:selected,expectedRevision:item.revision}),
    });
    setCommand("");refresh();
  }
  return <article className={institutionCard+" grid min-w-0 gap-3"}>
    <h3 className="font-semibold">{t(item.state)}</h3>
    {item.project && <Link className={institutionLink+" break-words"} href={"/projects/"+item.project.id}>{item.project.title}</Link>}
    {item.need && <Link className={institutionLink+" break-words"} href={"/communities/"+item.need.slug+"?need="+item.need.id}>{item.need.title}</Link>}
    {!item.project&&!item.need&&<p className="text-sm">{t("unavailable")}</p>}
    {item.purpose&&<p dir="auto" className="whitespace-pre-wrap break-words">{item.purpose}</p>}
    {lane==="review"&&<dl className="grid gap-2 text-sm">
      <dt className="font-semibold">{t("objective")}</dt><dd dir="auto" className="whitespace-pre-wrap break-words">{item.objective||t("unavailable")}</dd>
      <dt className="font-semibold">{t("summary")}</dt><dd dir="auto" className="whitespace-pre-wrap break-words">{item.needSummary}</dd>
    </dl>}
    {!!item.history?.length&&<details>
      <summary className="cursor-pointer font-semibold">{t("history")}</summary>
      <ul className="mt-2 grid gap-2">{item.history.map((entry,i)=><li key={entry.at+i}>
        {t(entry.action)} · <time dateTime={entry.at}>{date.format(new Date(entry.at))}</time>
        {entry.reason&&<p dir="auto" className="break-words">{entry.reason}</p>}
      </li>)}</ul>
    </details>}
    {lane==="member"&&item.asAuthor&&item.state==="approved"&&<NeedImpactConsent id={item.id} />}
    {!!options.length&&<details open={selected!==""} onToggle={(event)=>{if(!event.currentTarget.open)setCommand("");}}>
      <summary className="cursor-pointer font-semibold">{needReviewLabel(locale,"action")}</summary>
      <label>{needReviewLabel(locale,"action")}<select className={institutionField} value={selected} onChange={event=>setCommand(event.target.value)}>
        <option value="">{t("selectAction")}</option>{options.map(action=><option key={action} value={action}>{t(action)}</option>)}
      </select></label>
      {selected&&<LinkCommand key={selected+item.revision} action={selected} submit={submit} fields={form=>({
        target:form.get("target")||undefined,reason:form.get("reason")||undefined,relationshipConfirmed:form.has("relationship")||undefined,
      })}>
        {selected==="assign"&&<label>{needReviewLabel(locale,"target")}<input name="target" className={institutionField} required /></label>}
        {["assign","approve","reject"].includes(selected)&&<label>{needReviewLabel(locale,"note")}<textarea name="reason" className={institutionField} required minLength={5} maxLength={1500} /></label>}
        {selected==="approve"&&<label className="flex items-start gap-2"><input type="checkbox" name="relationship" required className="mt-1" />{t("relationship")}</label>}
      </LinkCommand>}
    </details>}
  </article>;
}

export function NeedLinkQueue({ lane="member",workspace }: {lane?:NeedProjectLinkLane;workspace?:string}) {
  const [locale]=useLocale();
  const t=(key:string)=>needProjectLabel(locale,key);
  const page=useLinkPage<NeedProjectLink>(root+"?lane="+lane,workspace);
  if(!page.data) {
    if(lane==="member"&&page.error instanceof ApiRequestError&&page.error.status===404)return <p className={institutionCard}>{t("unavailable")}</p>;
    return page.error&&!(page.error instanceof ApiRequestError&&page.error.status===404)?<LinkError error={page.error}/>:null;
  }
  return <section className={institutionCard+" grid min-w-0 gap-4"}>
    <h2 className="text-xl font-semibold">{t("title")}</h2>
    <p>{t("meaning")}</p>
    {!page.data.items.length&&<p>{t("empty")}</p>}
    {page.data.items.map(item=><LinkRecord key={item.id} item={item} lane={lane} workspace={workspace} refresh={page.refresh}/>)}
    <PageControls cursor={page.cursor} next={page.data.nextCursor} change={page.setCursor}/>
  </section>;
}

export function NeedLinkEntry() {
  const [locale]=useLocale();
  const page=useLinkPage<NeedProjectLink>(root);
  return page.data ? <Link href={needLinkWorkspace} className={institutionLink}>{needProjectLabel(locale,"title")}</Link> : null;
}

export function NeedLinkWorkspace() {
  const [locale]=useLocale();
  return <MemberShell><div className="grid gap-4">
    <header className={institutionCard+" flex flex-wrap items-center justify-between gap-4"}>
      <h1 className="text-2xl font-semibold">{needProjectLabel(locale,"title")}</h1>
      <Link href="/communities/intake/needs" className={institutionLink}>← {needsMessages[locale].title}</Link>
    </header>
    <NeedLinkQueue />
  </div></MemberShell>;
}

export function ProjectNeedLinks({ project,version,initial }: {project:string;version:number|null;initial?:string}) {
  const [locale]=useLocale();
  const t=(key:string)=>needProjectLabel(locale,key);
  const page=useLinkPage<NeedProjectLink>(root+"/project/"+project);
  const [selected,select]=useState(initial??"");
  const [formVersion,setFormVersion]=useState(0);
  if(!page.data||(!page.data.items.length&&!page.data.canRequest))return null;
  return <section className={institutionCard+" grid min-w-0 gap-4"}>
    <h2 className="text-xl font-semibold">{t("title")}</h2>
    {page.data.canRequest&&version!==null&&<details key={formVersion} open={formVersion===0&&Boolean(initial)}>
      <summary className="cursor-pointer font-semibold">{t("request")}</summary>
      <LinkCommand action="request" fields={form=>({project,projectVersion:version,publication:selected,reason:form.get("reason")})}
        submit={async payload=>{await authorizedRequest(root,{method:"POST",body:JSON.stringify(payload)});select("");setFormVersion(v=>v+1);page.refresh();}}>
        <NeedLinkPicker selected={selected} select={select}/>
        <label>{t("purpose")}<textarea name="reason" className={institutionField} required minLength={5} maxLength={600} /></label>
        <p className="text-sm">{t("purposeHelp")}</p>
      </LinkCommand>
    </details>}
    {page.data.items.map(item=><LinkRecord key={item.id} item={item} lane="member" refresh={page.refresh}/>)}
    <PageControls cursor={page.cursor} next={page.data.nextCursor} change={page.setCursor}/>
  </section>;
}

export function NeedAssociatedProjects({ publication }: { publication:string }) {
  const [locale]=useLocale();
  const page=useLinkPage<LinkProjectPreview>(root+"/publication/"+publication);
  if(!page.data?.items.length)return null;
  return <section className="grid gap-2"><h3 className="font-semibold">{needProjectLabel(locale,"projects")}</h3>
    <ul className="grid gap-2">{page.data.items.map(project=><li key={project.id}><Link href={"/projects/"+project.id}
      className={institutionLink+" break-words"}>{project.title}</Link></li>)}</ul>
    <PageControls cursor={page.cursor} next={page.data.nextCursor} change={page.setCursor}/>
  </section>;
}
