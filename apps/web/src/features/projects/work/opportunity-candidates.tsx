"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { useRevalidateMatching } from "@/features/volunteering/recommendations";
import { useLocale } from "@/lib/locale-store";
import { loadCandidates } from "@/lib/matching-api";
import { matchingCopy } from "@/lib/matching-i18n";

function CandidateList({ project,opportunity }: { project: string; opportunity: string }) {
  const [locale] = useLocale();
  const t = matchingCopy(locale);
  const [cursor,setCursor] = useState("");
  const [loading,setLoading] = useState(false);
  const load = useCallback((signal:AbortSignal) => loadCandidates(project,opportunity,cursor,signal).then((page) => {
    if (!signal.aborted) setLoading(false);
    return page;
  }),[project,opportunity,cursor]);
  const resource = useInstitutionResource(load);
  const reload = () => { setLoading(true); resource.refresh(); };
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
      </li>)}</ul>
      {resource.data.nextCursor && <button type="button" className={institutionLink + " w-fit"}
        onClick={() => { setCursor(resource.data?.nextCursor ?? ""); setLoading(true); }}>{t("next")}</button>}
    </>}
  </div>;
}

export function OpportunityCandidates({ project,opportunity }: { project:string; opportunity:string }) {
  const [locale] = useLocale();
  const [open,setOpen] = useState(false);
  return <details className="grid gap-2 rounded-lg border border-[var(--theme-border)] p-3"
    onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-medium">{matchingCopy(locale)("discovery")}</summary>
    {open && <CandidateList project={project} opportunity={opportunity} />}
  </details>;
}
