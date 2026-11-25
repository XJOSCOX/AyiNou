"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { impactIndicators, type ImpactReport, type ImpactValue } from "@ayinou/shared";
import { MemberShell } from "@/components/member-shell";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { ProjectLoading } from "@/components/project-ui";
import { fetchDepartments } from "@/lib/api";
import { loadImpact } from "@/lib/impact-api";
import { impactCopy } from "@/lib/impact-i18n";
import { useLocale } from "@/lib/locale-store";

function Value({ item }: { item: ImpactValue }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  return item.state === "available" ? <>{new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.value)}</> : <>{t(item.state)}</>;
}

export function ImpactReportView({ report }: { report: ImpactReport }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  return <div className="grid min-w-0 gap-4">
    <dl className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
      {impactIndicators.map((key) => <div key={key} className={institutionCard + " grid content-start gap-2"}>
        <dt className="text-sm font-semibold">{t(key)}</dt>
        <dd className="text-2xl font-semibold tabular-nums"><Value item={report[key]} /></dd>
        <dd className="text-sm">{t(`${key}Help`)}</dd>
      </div>)}
    </dl>
    <section className={institutionCard + " grid gap-3"}>
      <h2 className="text-xl font-semibold">{t("measurements")}</h2>
      {!report.measurements.length && <p>{t("unavailable")}</p>}
      {!!report.measurements.length && <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {report.measurements.map(({ definition, result }) => <article key={definition.code} className="grid min-w-0 content-start gap-2 rounded-lg border border-[var(--theme-border)] p-4">
          <h3 className="break-words font-semibold">{definition.names[locale]}</h3>
          <p className="text-xl font-semibold"><Value item={result} /> {result.state === "available" && definition.units[locale]}</p>
          <p className="break-words">{definition.descriptions[locale]}</p>
          <details><summary className="cursor-pointer font-semibold">{t("method")}</summary>
            <p className="mt-2 break-words text-sm">{definition.methods[locale]}</p>
            <p className="mt-1 text-sm">{t("calendar")} · {t("unit")} {definition.units[locale]} · v{definition.version}</p>
          </details>
        </article>)}
      </div>}
      <p className="text-sm">{t("measurementHelp")}</p>
      <details><summary className="cursor-pointer font-semibold">{t("dedup")}</summary><p className="mt-2 text-sm">{t("dedupHelp")}</p></details>
    </section>
    {!!report.projects.length && <section className={institutionCard + " grid gap-3"}>
      <h2 className="text-xl font-semibold">{t("projects")}</h2>
      <ul className="grid gap-2 sm:grid-cols-2">{report.projects.map((project) =>
        <li key={project.id} className="break-words"><Link className={institutionLink} href={"/projects/" + project.id}>{project.title}</Link></li>)}</ul>
    </section>}
  </div>;
}

export function ImpactDashboard({ signedIn, selection }: { signedIn: boolean; selection: Record<string, string> }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const resource = useInstitutionResource(useCallback((signal: AbortSignal) => loadImpact(selection, signal), [selection]));
  const state = resource.data;
  const report = state?.state === "available" ? state.report : null;
  const filters = state && state.state !== "disabled" ? state.filters : null;
  const departments = useInstitutionResource(useCallback((signal: AbortSignal) => filters ?
    fetchDepartments(signal) : Promise.resolve([]), [filters]));
  const [expiredReport, setExpiredReport] = useState<ImpactReport | null>(null);
  useEffect(() => {
    if (!report) return;
    const expire = () => setExpiredReport(report);
    const clock = window.setTimeout(expire, 60_000);
    window.addEventListener("pagehide", expire);
    const hidden = () => { if (document.visibilityState !== "visible") expire(); };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.clearTimeout(clock);
      window.removeEventListener("pagehide", expire);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [report]);
  return <MemberShell signedIn={signedIn}><div className="grid min-w-0 gap-4">
    <header className={institutionCard}>
      <div className="border-s-2 border-[var(--theme-primary)] ps-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-3xl text-[var(--theme-body)]">{t("intro")}</p>
      </div>
    </header>
    {filters && <form action="/impact" className={institutionCard + " grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]"}>
      <label>{t("department")}<select className={institutionField} name="department" defaultValue={selection.department ?? "national"}>
        <option value="national">{t("national")}</option>
        {filters.departments.map((code) => <option key={code} value={code}>
          {departments.data?.find((item) => item.code === code)?.name ?? code}</option>)}
      </select></label>
      <label>{t("year")}<select className={institutionField} name="year" required defaultValue={selection.year ?? ""}>
        <option value="">—</option>
        {filters.years.map((year) => <option key={year}>{year}</option>)}
      </select></label>
      <label>{t("sector")}<select className={institutionField} name="sector" required defaultValue={selection.sector ?? ""}>
        <option value="">—</option>
        {filters.sectors.map((sector) => <option key={sector} value={sector}>{t(sector)}</option>)}
      </select></label>
      <button className={institutionAction + " self-end"}>{t("apply")}</button>
    </form>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!state && resource.error === null && <ProjectLoading cards={1} className="grid" />}
    {state?.state === "disabled" && <p role="status" className={institutionCard}>{t("closed")}</p>}
    {state?.state === "unavailable" && <p role="status" className={institutionCard}>{t("empty")}</p>}
    {state?.state === "suppressed" && <p role="status" className={institutionCard}>{t("withheld")}</p>}
    {report && (expiredReport === report ? <div className={institutionCard + " flex flex-wrap items-center justify-between gap-3"}>
      <p role="status">{t("expired")}</p><button type="button" className={institutionAction} onClick={resource.refresh}>{t("renew")}</button>
    </div> : <ImpactReportView report={report} />)}
    <p className="max-w-4xl text-sm text-[var(--theme-body)]">{t("limits")}</p>
  </div></MemberShell>;
}
