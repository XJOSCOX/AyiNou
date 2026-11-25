"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { outcomeReviewerPurposes, outcomeReviewStatuses, type OutcomeReviewerPurpose, type OutcomeReviewStatus,
  type OutcomeStaffLane } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { MfaChallenge } from "@/components/mfa-challenge";
import { ProjectLoading, ProjectSection, ProjectsHeader } from "@/components/project-ui";
import { fetchDepartments } from "@/lib/api";
import { outcomePublicationPath } from "@/lib/project-outcome-publication-api";
import { usePublicationCopy } from "../outcome-publication/disclosure";
import { apiErrorCode } from "@/lib/api-errors";
import { useFeedMutation } from "@/lib/feed-state";
import { changeOutcomeRoster, loadOutcomeReviewNotices, loadOutcomeReviewQueue, loadOutcomeRoster,
  openOutcomeReview, outcomeReviewPath } from "@/lib/project-outcome-review-api";
import { HistoryLabel, ReviewCommand, useReviewCopy } from "./review-controls";
import { StaffOutcomeCase } from "./staff-case";

function Appointments({ workspace, department, search, setSearch, roster }: {
  workspace: string; department: string; search: string; setSearch: (term: string) => void;
  roster: ReturnType<typeof useOutcomeRoster>;
}) {
  const { t, locale } = useReviewCopy();
  const [actor, setActor] = useState("");
  const [purpose, setPurpose] = useState<OutcomeReviewerPurpose>("initial");
  const data = roster.data;
  if (roster.error !== null) return <ApiErrorNotice error={roster.error} retry={roster.refresh} signIn />;
  if (!data) return <ProjectLoading cards={1} className="grid" />;
  const current = data.grants.find((grant) => grant.actor === actor && grant.purpose === purpose);
  const common = { version: current?.version ?? 0, send: (body: string) => changeOutcomeRoster(workspace, body), after: roster.refresh };
  return <div className="grid min-w-0 gap-3">
    {data.canAppoint && <>
      <form onSubmit={(event) => {
        event.preventDefault();
        setSearch(String(new FormData(event.currentTarget).get("search") ?? "").trim());
      }} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">{t.search}<input name="search" className={institutionField}
          type="search" minLength={2} maxLength={60} defaultValue={search} required /></label>
        <button className={institutionAction}>{t.searchButton}</button>
      </form>
      {data.candidates.length > 0 && <label>{t.target}<select className={institutionField} value={actor}
        onChange={(event) => setActor(event.target.value)}>
        <option value="">{t.noOption}</option>
        {data.candidates.map((candidate) => <option key={candidate.actor} value={candidate.actor}>{candidate.label}</option>)}
      </select></label>}
      {actor && <>
        <label>{t.purpose}<select className={institutionField} value={purpose}
          onChange={(event) => setPurpose(event.target.value as OutcomeReviewerPurpose)}>
          {outcomeReviewerPurposes.map((item) => <option key={item} value={item}>{t[item]}</option>)}
        </select></label>
        <ReviewCommand {...common} key={actor + purpose + common.version} action="grant" input={(form) => ({
          target: actor, purpose, department, expiresAt: new Date(String(form.get("expiry"))).toISOString(),
        })}>
          <label>{t.expiry}<input type="datetime-local" name="expiry" className={institutionField} required /></label>
        </ReviewCommand>
      </>}
    </>}
    <ul className="grid gap-2">{data.grants.map((grant) => {
      const input = () => ({ target: grant.actor, purpose: grant.purpose, department });
      return <li key={grant.actor + grant.purpose} className="grid min-w-0 gap-2 rounded-md border border-[var(--theme-border)] p-3">
        <p className="break-words">{grant.label ?? grant.actor} · {t[grant.purpose]} ·
          {" "}{grant.state === "active" && !grant.eligible ? t.ineligible : t[grant.state]}</p>
        <p className="text-sm">{t.expiry} <time dateTime={grant.expiresAt}>{new Date(grant.expiresAt).toLocaleString(locale)}</time></p>
        {data.canAppoint && <div className="grid gap-2">
          {grant.state === "active" && <ReviewCommand {...common} version={grant.version}
            key={"s-" + grant.version} action="suspend" input={input} />}
          {grant.state !== "revoked" && <ReviewCommand {...common} version={grant.version}
            key={"r-" + grant.version} action="revoke" input={input} />}
        </div>}
      </li>;
    })}</ul>
    {data.history.length > 0 && <details><summary className="cursor-pointer font-medium">{t.history}</summary>
      <ul className="grid gap-2 pt-3">{data.history.map((entry, index) => <li className="break-words" key={index}>
        <HistoryLabel action={entry.action} />{entry.purpose && " · " + t[entry.purpose]} ·{" "}
        <time dateTime={entry.at}>{new Date(entry.at).toLocaleString(locale)}</time>
        {entry.note && <p dir="auto">{entry.note}</p>}
      </li>)}</ul>
    </details>}
  </div>;
}

function useOutcomeRoster(workspace: string, department: string, search: string, lane: OutcomeStaffLane) {
  const loader = useCallback((signal: AbortSignal) => lane === "admin" && department ?
    loadOutcomeRoster(workspace, department, search, signal) : Promise.resolve(null), [workspace, department, search, lane]);
  return useInstitutionResource(loader);
}

function DepartmentReview({ workspace, department, lane }: { workspace: string; department: string; lane: OutcomeStaffLane }) {
  const { t } = useReviewCopy();
  const [status, setStatus] = useState<OutcomeReviewStatus | "">("");
  const [after, setAfter] = useState<string | null>(null);
  const [selected, select] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const loader = useCallback((signal: AbortSignal) => loadOutcomeReviewQueue(workspace, lane, department, status, after, signal),
    [workspace, lane, department, status, after]);
  const queue = useInstitutionResource(loader);
  const roster = useOutcomeRoster(workspace, department, search, lane);

  return <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(15rem,1fr)_minmax(20rem,2fr)]">
    <ProjectSection title={t.title}>
      <label>{t.status}<select className={institutionField} value={status} onChange={(event) => {
        setStatus(event.target.value as OutcomeReviewStatus | ""); setAfter(null); select(null);
      }}>
        <option value="">{t.all}</option>
        {outcomeReviewStatuses.map((value) => <option key={value} value={value}>{t.states[value]}</option>)}
      </select></label>
      {queue.error !== null && <ApiErrorNotice error={queue.error} retry={queue.refresh} signIn />}
      {!queue.data && queue.error === null && <ProjectLoading cards={1} className="grid" />}
      {queue.data && (queue.data.items.length === 0 ? <p>{t.empty}</p> : <ul className="grid gap-2">
        {queue.data.items.map((item) => <li className="grid gap-1 rounded-md border border-[var(--theme-border)] p-3" key={item.id}>
          <p className="font-medium">{t.states[item.status]}</p>
          <p className="break-all text-sm">{t.caseLabel} {item.id}</p>
          <button type="button" className={institutionLink + " justify-self-start"} aria-pressed={selected === item.id}
            onClick={() => select(item.id)}>{t.view}</button>
        </li>)}
      </ul>)}
      <div className="flex flex-wrap gap-3">
        {after && <button className={institutionLink} type="button" onClick={() => { setAfter(null); select(null); }}>{t.first}</button>}
        {queue.data?.nextCursor && <button className={institutionLink} type="button" onClick={() => {
          setAfter(queue.data?.nextCursor ?? null); select(null);
        }}>{t.next}</button>}
      </div>
    </ProjectSection>
    <div className="grid min-w-0 gap-4">
      {selected && <ProjectSection title={t.caseLabel}>
        <StaffOutcomeCase key={selected} id={selected} workspace={workspace} lane={lane} roster={roster.data} onChanged={queue.refresh} />
      </ProjectSection>}
      {lane === "admin" && <ProjectSection title={t.roster}>
        <Appointments workspace={workspace} department={department} search={search} setSearch={setSearch} roster={roster} />
      </ProjectSection>}
    </div>
  </div>;
}

function ActiveReviewWorkspace({ workspace, lane, onClose }: {
  workspace: { id: string; expiresAt: string }; lane: OutcomeStaffLane; onClose: () => void;
}) {
  const { t } = useReviewCopy();
  const [department, setDepartment] = useState("");
  const [expired, setExpired] = useState(false);
  const departments = useInstitutionResource(fetchDepartments);
  useEffect(() => {
    const timeout = setTimeout(() => setExpired(true), Math.max(0, new Date(workspace.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timeout);
  }, [workspace.expiresAt]);
  if (expired) return <ProjectSection title={t.expired}><div>
    <button className={institutionAction} type="button" onClick={onClose}>{t.close}</button>
  </div></ProjectSection>;
  return <>
    <ProjectSection title={lane === "admin" ? t.coordinator : t.reviewer}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-full max-w-xs">{t.department}<select className={institutionField} value={department}
          onChange={(event) => setDepartment(event.target.value)}>
          <option value="">—</option>
          {departments.data?.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}
        </select></label>
        <button className={institutionLink} type="button" onClick={onClose}>{t.close}</button>
      </div>
      {departments.error !== null && <ApiErrorNotice error={departments.error} retry={departments.refresh} />}
    </ProjectSection>
    {department && <DepartmentReview key={department} workspace={workspace.id} lane={lane} department={department} />}
  </>;
}

export function OutcomeReviewWorkspace({ requestedLane, challenge }: { requestedLane: OutcomeStaffLane;
  challenge?: { subject: string; sessionId: string; factorIds: string[] } }) {
  const { t } = useReviewCopy();
  const { t: publication } = usePublicationCopy();
  const router = useRouter();
  const availability = useInstitutionResource(loadOutcomeReviewNotices);
  const [lane, setLane] = useState(requestedLane);
  const [workspace, setWorkspace] = useState<{ id: string; expiresAt: string } | null>(null);
  const [showMfa, setShowMfa] = useState(!!challenge);
  const mutation = useFeedMutation();
  const target = outcomeReviewPath + (lane === "admin" ? "?lane=admin" : "");
  const verifyLink = outcomeReviewPath + "?verify=1" + (lane === "admin" ? "&lane=admin" : "");
  const open = () => void mutation.run(async () => { setWorkspace(await openOutcomeReview(lane)); });
  const disabled = apiErrorCode(availability.error) === "PROJECT_OUTCOME_REVIEW_DISABLED";
  return <MemberShell><div className="grid min-w-0 gap-4">
    <ProjectsHeader title={t.title} description={t.intro} backHref="/projects/review" actions={
      <Link className={institutionAction} href={outcomePublicationPath + (lane === "admin" ? "?lane=admin" : "")}>{publication.title}</Link>
    } />
    {disabled ? <ProjectSection title={t.title}><p role="status">{t.closed}</p></ProjectSection> :
      availability.error !== null ? <ApiErrorNotice error={availability.error} retry={availability.refresh} signIn /> :
      !availability.data ? <ProjectLoading cards={1} className="grid" /> :
      workspace ? <ActiveReviewWorkspace key={workspace.id} workspace={workspace} lane={lane} onClose={() => setWorkspace(null)} /> :
      showMfa && challenge ? <MfaChallenge {...challenge} workspace={{
        help: t.intro, onVerified: () => { setShowMfa(false); open(); },
        onCancel: () => setShowMfa(false), onSessionEnded: () => router.replace("/login"),
      }} /> : <ProjectSection title={t.open}>
        <label className="max-w-sm">{t.purpose}<select className={institutionField} value={lane}
          onChange={(event) => setLane(event.target.value as OutcomeStaffLane)}>
          <option value="review">{t.reviewer}</option><option value="admin">{t.coordinator}</option>
        </select></label>
        {apiErrorCode(mutation.error) === "MFA_REQUIRED" ?
          <Link className={institutionLink} href={verifyLink} replace>{t.open}</Link> :
          mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
        <div><button type="button" className={institutionAction} disabled={mutation.busy}
          onClick={open}>{mutation.busy ? t.opening : t.open}</button></div>
        {challenge && <Link href={target} className={institutionLink}>{t.close}</Link>}
      </ProjectSection>}
  </div></MemberShell>;
}
