"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { InvitationComposer, InvitationList } from "@/features/volunteering/recruitment";
import { recruitmentCopy } from "@/lib/recruitment-i18n";
import { useRevalidateMatching } from "@/features/volunteering/recommendations";
import { useLocale } from "@/lib/locale-store";
import { loadCandidates } from "@/lib/matching-api";
import { matchingCopy } from "@/lib/matching-i18n";

function CandidateList({ project,opportunity,onSent }: { project: string; opportunity: string; onSent: () => void }) {
  const [locale] = useLocale();
  const t = matchingCopy(locale);
  const [cursor,setCursor] = useState("");
  const [selection,setSelection] = useState<string>();
  const recruit = recruitmentCopy(locale);
  const [loading,setLoading] = useState(false);
  const load = useCallback((signal:AbortSignal) => loadCandidates(project,opportunity,cursor,signal).then((page) => {
    if (!signal.aborted) setLoading(false);
    return page;
  }),[project,opportunity,cursor]);
  const resource = useInstitutionResource(load);
  const reload = () => { setSelection(undefined); setLoading(true); resource.refresh(); };
  useRevalidateMatching(reload,resource.data?.state==="ready");
  return <div className="grid gap-2">
    <p className="text-sm">{t("discoveryHelp")}</p>
    {resource.error!==null && <ApiErrorNotice error={resource.error} retry={() => { setCursor(""); reload(); }} signIn />}
    {(!resource.data || loading) && resource.error===null && <ProjectLoading />}
    {!loading && resource.data && <>
      {resource.data.state==="closed" ? <p>{t("closed")}</p> : resource.data.items.length===0 && <p>{t("emptyCandidates")}</p>}
      <ul className="grid gap-2">{resource.data.items.map((item) => <li className="flex flex-wrap items-baseline gap-2" key={item.handle}>
        <Link href={"/members/"+encodeURIComponent(item.handle)} className={institutionLink}>{item.name}</Link>
        <span className="break-all">@{item.handle} · {t(item.classification)}</span>
        {item.selection && <button type="button" className={institutionLink} onClick={() => setSelection(item.selection)}>{recruit("invite")}</button>}
      </li>)}</ul>
      {resource.data.nextCursor && <button type="button" className={institutionLink + " w-fit"}
        onClick={() => { setCursor(resource.data?.nextCursor ?? ""); setSelection(undefined); setLoading(true); }}>{t("next")}</button>}
    </>}
    {selection && <InvitationComposer key={selection} project={project} opportunity={opportunity} selection={selection}
      close={() => setSelection(undefined)} onSent={() => { setSelection(undefined); onSent(); }} />}
  </div>;
}

export function OpportunityCandidates({ project,opportunity,discover }: { project:string; opportunity:string; discover:boolean }) {
  const [locale] = useLocale();
  const [open,setOpen] = useState(false);
  const [sent,setSent] = useState(0);
  const [showSent,setShowSent] = useState(false);
  const t = recruitmentCopy(locale);
  const group = "grid gap-2 rounded-lg border border-[var(--theme-border)] p-3";
  return <div className="grid gap-2">
    {discover && <details className={group} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">{matchingCopy(locale)("discovery")}</summary>
      {open && <CandidateList project={project} opportunity={opportunity}
        onSent={() => { setSent(previous => previous + 1); setShowSent(true); }} />}
    </details>}
    {sent > 0 && <p role="status">{t("sentNotice")}</p>}
    <details className={group} open={showSent} onToggle={event => setShowSent(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">{t("sent")}</summary>
      {showSent && <InvitationList key={sent} project={project} opportunity={opportunity} />}
    </details>
  </div>;
}
