"use client";

import { FounderPreparationLink } from "./preparation";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ImpactOverview } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { MfaChallenge } from "@/components/mfa-challenge";
import { ProjectLoading, ProjectSection, ProjectsHeader } from "@/components/project-ui";
import { fetchDepartments } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { useFeedMutation } from "@/lib/feed-state";
import { changeImpactMapping, changeImpactOversight, impactReviewPath, loadImpact, loadImpactMapping,
  loadImpactMappings, loadImpactOversight } from "@/lib/impact-api";
import { impactCopy } from "@/lib/impact-i18n";
import { useLocale } from "@/lib/locale-store";
import { openPublicationWorkspace, outcomePublicationPath } from "@/lib/project-outcome-publication-api";
import { Disclosure } from "../projects/outcome-publication/disclosure";
import { ReviewCommand, useReviewCopy } from "../projects/outcome-review/review-controls";
import { ImpactReportView } from "./dashboard";
import { impactReceipt } from "./member-controls";

function MappingCase({ id, workspace, done }: { id: string; workspace: string; done: () => void }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const resource = useInstitutionResource(useCallback((signal: AbortSignal) => loadImpactMapping(id, signal, workspace), [id, workspace]));
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  if (!resource.data) return <ProjectLoading cards={1} className="grid" />;
  const mapping = resource.data;
  const definition = mapping.catalog.find((item) => item.code === mapping.code);
  const common = { ...impactReceipt, version: mapping.version, send: (body: string) => changeImpactMapping(id, body, workspace), after: done };
  return <div className="grid gap-3">
    <Disclosure result={mapping.disclosure} preview />
    <dl className="grid gap-2 break-words rounded-md border border-[var(--theme-border)] p-3">
      <div><dt className="font-medium">{t("delivery")}</dt><dd>{mapping.reviewReference}</dd></div>
      <div><dt className="font-medium">{t("methodCode")}</dt><dd>{mapping.method}</dd></div>
      {definition && <div><dt className="font-medium">{definition.names[locale]} · v{definition.version}</dt><dd>{definition.methods[locale]}</dd></div>}
    </dl>
    {definition && <ReviewCommand {...common} action="approve_mapping" label={t("approveMapping")} confirmation={t("attest")}
      input={() => ({ methodReviewed: true })} />}
    <ReviewCommand {...common} action="reject_mapping" label={t("reject")} />
  </div>;
}

function MappingQueue({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const { t: review } = useReviewCopy();
  const [department, setDepartment] = useState("");
  const [after, setAfter] = useState("");
  const [selected, select] = useState("");
  const departments = useInstitutionResource(fetchDepartments);
  const queue = useInstitutionResource(useCallback((signal: AbortSignal) => department ?
    loadImpactMappings(workspace, department, after, signal) : Promise.resolve(null), [department, after, workspace]));
  return <ProjectSection title={t("mapping")}>
    <label>{t("department")}<select className={institutionField} value={department} onChange={(event) => {
      setDepartment(event.target.value); setAfter(""); select("");
    }}>
      <option value="">—</option>
      {departments.data?.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
    </select></label>
    {queue.error !== null && <ApiErrorNotice error={queue.error} retry={queue.refresh} signIn />}
    {queue.data && !queue.data.items.length && <p>{review.empty}</p>}
    {queue.data?.items.map((item) => <article key={item.id} className="grid gap-2 rounded-lg border border-[var(--theme-border)] p-3">
      <p className="break-words font-semibold">{item.title} · {item.year}</p>
      <p>{item.code}</p>
      <button type="button" aria-pressed={selected === item.id} className={institutionLink + " justify-self-start"}
        onClick={() => select(item.id)}>{review.view}</button>
    </article>)}
    {selected && <MappingCase key={selected} id={selected} workspace={workspace} done={() => { select(""); queue.refresh(); }} />}
    <div className="flex flex-wrap gap-3">
      {after && <button className={institutionLink} type="button" onClick={() => { setAfter(""); select(""); }}>{review.first}</button>}
      {queue.data?.nextCursor && <button className={institutionLink} type="button"
        onClick={() => { setAfter(queue.data?.nextCursor ?? ""); select(""); }}>{review.next}</button>}
    </div>
  </ProjectSection>;
}

function ReviewRelease({ release, send, after }: { release: ImpactOverview["releases"][number];
  send: (body: string) => Promise<unknown>; after: () => void }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const [department, pick] = useState("");
  const cell = release.preview?.[department];
  const control = { ...impactReceipt, version: release.version, send, after };
  return <article className="grid gap-3 rounded-md border border-[var(--theme-border)] p-4">
    <h3 className="font-semibold">{release.year} · {t(release.sector)} · {t(release.state)}</h3>
    {release.state === "proposed" && release.preview && <>
      <label>{t("department")}<select className={institutionField} value={department} onChange={(event) => pick(event.target.value)}>
        <option value="">—</option>
        {Object.keys(release.preview).sort().map((code) => <option key={code} value={code}>{code === "national" ? t("national") : code}</option>)}
      </select></label>
      {cell && <ImpactReportView report={cell} />}
      {cell && <ReviewCommand {...control} action="seal_report" label={t("seal")} confirmation={t("attest")}
        input={() => ({ year: release.year, scope: release.sector, fingerprint: release.fingerprint, methodReviewed: true })} />}
      <ReviewCommand {...control} action="reject_report" label={t("reject")} input={() => ({ year: release.year, scope: release.sector })} />
    </>}
  </article>;
}

function Oversight({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const state = useInstitutionResource(useCallback((signal: AbortSignal) => loadImpactOversight(workspace, signal), [workspace]));
  if (state.error !== null) return <ApiErrorNotice error={state.error} retry={state.refresh} signIn />;
  if (!state.data) return <ProjectLoading cards={1} className="grid" />;
  const send = (body: string) => changeImpactOversight(workspace, body);
  return <>
    <MappingQueue workspace={workspace} />
    {state.data.globalReviewer && <>
      <ProjectSection title={t("definitions")}>
        {state.data.catalog.filter((definition) => definition.status === "draft").map((item) =>
          <article key={item.code + item.version} className="grid gap-2 break-words rounded-md border border-[var(--theme-border)] p-3">
            <h3 className="font-semibold">{item.names[locale]} · v{item.version}</h3>
            <p>{item.descriptions[locale]}</p><p>{item.methods[locale]}</p>
            <p>{item.methodologyCode} · {item.units[locale]} · {t(item.privacy === "restricted" ? "private" : "publicSafe")}</p>
            <ReviewCommand {...impactReceipt} action="approve_definition" label={t("approveDefinition")} confirmation={t("attest")}
              version={item.version} send={send} after={state.refresh} input={() => ({ code: item.code, methodReviewed: true })} />
          </article>)}
      </ProjectSection>
      <ProjectSection title={t("reviews")}>
        {state.data.releases.map((release) => <ReviewRelease key={release.year + release.sector + release.version} release={release}
          send={send} after={state.refresh} />)}
      </ProjectSection>
    </>}
  </>;
}

const check = (signal: AbortSignal) => loadImpact({}, signal);

export function ImpactReviewer({ challenge }: { challenge?: { subject: string; sessionId: string; factorIds: string[] } }) {
  const [locale] = useLocale();
  const t = impactCopy(locale);
  const { t: review } = useReviewCopy();
  const router = useRouter();
  const availability = useInstitutionResource(check);
  const mutation = useFeedMutation();
  const [showMfa, setShowMfa] = useState(!!challenge);
  const [workspace, setWorkspace] = useState<{ id: string; expiresAt: string } | null>(null);
  const open = () => void mutation.run(async () => { setWorkspace(await openPublicationWorkspace("review")); });
  useEffect(() => {
    if (!workspace) return;
    const timer = setTimeout(() => setWorkspace(null), Math.max(0, Date.parse(workspace.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [workspace]);
  const available = availability.data && (availability.data.state !== "disabled" || availability.data.operations === true);
  return <MemberShell><div className="grid min-w-0 gap-4">
    <ProjectsHeader title={t("reviews")} description={t("dedupHelp")} backHref={outcomePublicationPath} />
    {availability.error !== null && <ApiErrorNotice error={availability.error} retry={availability.refresh} />}
    {!availability.data && availability.error === null && <ProjectLoading cards={1} className="grid" />}
    {availability.data && !available && <ProjectSection title={t("reviews")}><p role="status">{t("closed")}</p><FounderPreparationLink focus="governance" /></ProjectSection>}
    {available && (workspace ? <Oversight workspace={workspace.id} /> : showMfa && challenge ?
      <MfaChallenge {...challenge} workspace={{
        help: t("reviews"), onVerified: () => { setShowMfa(false); open(); },
        onCancel: () => setShowMfa(false), onSessionEnded: () => router.replace("/login"),
      }} /> : <ProjectSection title={review.open}>
        {apiErrorCode(mutation.error) === "MFA_REQUIRED" ?
          <Link className={institutionLink} href={impactReviewPath + "?verify=1"} replace>{review.open}</Link> :
          mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
        <button className={institutionAction + " justify-self-start"} type="button" disabled={mutation.busy} onClick={open}>
          {mutation.busy ? review.opening : review.open}</button>
      </ProjectSection>)}
  </div></MemberShell>;
}
