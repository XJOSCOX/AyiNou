"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { outcomePublicationStatuses, type OutcomePublicationReceipt, type OutcomePublicationRoster,
  type OutcomePublicationStatus, type OutcomeStaffLane } from "@ayinou/shared";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { MfaChallenge } from "@/components/mfa-challenge";
import { ProjectLoading, ProjectSection, ProjectsHeader } from "@/components/project-ui";
import { fetchDepartments } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { useFeedMutation } from "@/lib/feed-state";
import { impactReviewPath } from "@/lib/impact-api";
import { impactCopy } from "@/lib/impact-i18n";
import { outcomeReviewPath } from "@/lib/project-outcome-review-api";
import { changePublicationRoster, changeStaffPublication, loadPublicationAvailability, loadPublicationQueue,
  loadPublicationRoster, loadStaffPublication, openPublicationWorkspace, outcomePublicationPath } from "@/lib/project-outcome-publication-api";
import { ReviewCommand, useReviewCopy } from "../outcome-review/review-controls";
import { Disclosure, usePublicationCopy } from "./disclosure";
import { PublicationHistory } from "./member-publication";

const expiry = (form: FormData) => new Date(String(form.get("expiry"))).toISOString();

function Appointments({ workspace, department, search, setSearch, roster }: {
  workspace: string; department: string; search: string; setSearch: (value: string) => void; roster: OutcomePublicationRoster;
}) {
  const { t, locale } = useReviewCopy();
  const [target, select] = useState("");
  const selected = roster.grants.find((grant) => grant.actor === target);
  const send = (body: string) => changePublicationRoster(workspace, body);
  const after = () => setSearch(search);
  return <>
    {roster.canAppoint && <>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
        event.preventDefault();
        select("");
        setSearch(String(new FormData(event.currentTarget).get("search") ?? "").trim());
      }}>
        <label className="min-w-0 flex-1">{t.search}<input name="search" type="search" minLength={2} maxLength={60}
          className={institutionField} defaultValue={search} required /></label>
        <button className={institutionAction}>{t.searchButton}</button>
      </form>
      {!!roster.candidates.length && <label>{t.target}<select className={institutionField} value={target} onChange={(event) => select(event.target.value)}>
        <option value="">{t.noOption}</option>
        {roster.candidates.map((candidate) => <option key={candidate.actor} value={candidate.actor}>{candidate.label}</option>)}
      </select></label>}
      {target && <ReviewCommand key={target + (selected?.version ?? 0)} action="grant" version={selected?.version ?? 0} send={send} after={after}
        input={(form) => ({ target, department, expiresAt: expiry(form) })}>
        <label>{t.expiry}<input type="datetime-local" name="expiry" className={institutionField} required /></label>
      </ReviewCommand>}
    </>}
    <ul className="grid gap-2">{roster.grants.map((grant) => <li key={grant.actor} className="grid gap-2 rounded-md border border-[var(--theme-border)] p-3">
      <p className="break-words">{grant.label ?? grant.actor} · {grant.state === "active" && !grant.eligible ? t.ineligible : t[grant.state]}</p>
      <p className="text-sm">{t.expiry} <time dateTime={grant.expiresAt}>{new Date(grant.expiresAt).toLocaleString(locale)}</time></p>
      {roster.canAppoint && grant.state === "active" && <ReviewCommand key={grant.version} action="revoke" version={grant.version}
        send={send} after={after} input={() => ({ target: grant.actor, department })} />}
    </li>)}</ul>
    <PublicationHistory history={roster.history} />
  </>;
}

function StaffPublication({ workspace, lane, id, roster, onChanged }: {
  workspace: string; lane: OutcomeStaffLane; id: string; roster: OutcomePublicationRoster | null; onChanged: (close: boolean) => void;
}) {
  const { t, locale } = usePublicationCopy();
  const { t: review } = useReviewCopy();
  const [receipt, setReceipt] = useState<OutcomePublicationReceipt | null>(null);
  const loader = useCallback((signal: AbortSignal) => loadStaffPublication(workspace, lane, id, signal), [workspace, lane, id]);
  const resource = useInstitutionResource(loader);
  if (resource.error !== null) return <ApiErrorNotice error={resource.error} retry={resource.refresh} signIn />;
  const item = resource.data;
  if (!item?.status) return <ProjectLoading cards={1} className="grid" />;
  const send = (body: string) => changeStaffPublication(workspace, lane, id, body);
  const after = () => { setReceipt(null); resource.refresh(); onChanged(false); };
  const common = { version: item.version, send, after };
  const pending = item.status === "submitted" || item.status === "appeal";
  const packet = receipt?.version === item.version ? receipt.snapshot : null;
  const candidates = roster?.grants.filter((grant) => grant.eligible) ?? [];
  return <div className="grid min-w-0 gap-3">
    <h3 className="break-words font-semibold">{item.projectTitle}</h3>
    <p role="status">{t[`state_${item.status}`]} · {review.revision} {item.revision}</p>
    {item.deadline && <p>{review.expiry} <time dateTime={item.deadline}>{new Date(item.deadline).toLocaleString(locale)}</time></p>}
    {lane === "admin" ? <>
      {pending && !item.assignmentLive && candidates.length > 0 && <ReviewCommand {...common} key={"assign" + item.version}
        action="assign" input={(form) => ({ target: String(form.get("target")), expiresAt: expiry(form) })}>
        <label>{review.target}<select name="target" className={institutionField} required>
          <option value="">{review.noOption}</option>
          {candidates.map((grant) => <option key={grant.actor} value={grant.actor}>{grant.label ?? grant.actor}</option>)}
        </select></label>
        <label>{review.expiry}<input type="datetime-local" name="expiry" className={institutionField} required /></label>
      </ReviewCommand>}
      {pending && item.assigned && <ReviewCommand {...common} key={"release" + item.version} action="release"
        label={review.actions.release_assignment} />}
      {item.status === "approved" && <ReviewCommand {...common} key={item.version} action="invalidate" label={t.invalidate} />}
    </> : pending && <>
      {!item.accepted && <ReviewCommand {...common} key={"accept" + item.version} action="accept"
        input={(form) => ({ conflictFree: form.has("conflictFree") })}>
        <label className="flex items-start gap-2"><input type="checkbox" name="conflictFree" required />{review.conflictFree}</label>
      </ReviewCommand>}
      {item.accepted && !packet && <ReviewCommand {...common} key={"inspect" + item.version} action="inspect" label={t.inspect}
        send={async (body) => setReceipt(await send(body))} after={resource.refresh} />}
      {!!packet && <>
        <Disclosure result={packet.disclosure} preview />
        <dl className="grid gap-2 break-words rounded-md border border-[var(--theme-border)] p-3">
          <div><dt className="font-medium">{t.independent}</dt><dd dir="auto">{packet.findingExplanation}</dd></div>
          <div><dt className="font-medium">{review.limitations}</dt><dd dir="auto">{packet.findingLimitations}</dd></div>
          {item.status === "appeal" && <>
            <div><dt className="font-medium">{t.state_rejected}</dt><dd dir="auto">{packet.rejectionReason}</dd></div>
            <div><dt className="font-medium">{t.state_appeal}</dt><dd dir="auto">{packet.appealReason}</dd></div>
          </>}
        </dl>
        <ReviewCommand {...common} action="approve" label={t.approve} confirmation={t.faithful} input={() => ({ faithful: true })}
          after={() => onChanged(true)} />
        {item.status === "submitted" && <ReviewCommand {...common} action="changes" label={t.changes} after={() => onChanged(true)} />}
        <ReviewCommand {...common} action="reject" label={t.reject} after={() => onChanged(true)} />
      </>}
      <ReviewCommand {...common} key={"recuse" + item.version} action="recuse" after={() => onChanged(true)} />
    </>}
    <PublicationHistory history={item.history} />
  </div>;
}

function DepartmentPublication({ workspace, department, lane }: { workspace: string; department: string; lane: OutcomeStaffLane }) {
  const { t } = usePublicationCopy();
  const { t: review } = useReviewCopy();
  const [status, setStatus] = useState<OutcomePublicationStatus | "">("");
  const [after, setAfter] = useState<string | null>(null);
  const [selected, select] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const queue = useInstitutionResource(useCallback((signal: AbortSignal) =>
    loadPublicationQueue(workspace, lane, department, status, after, signal), [workspace, lane, department, status, after]));
  const roster = useInstitutionResource(useCallback((signal: AbortSignal) => lane === "admin"
    ? loadPublicationRoster(workspace, department, search, signal) : Promise.resolve(null), [workspace, department, search, lane]));
  return <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(15rem,1fr)_minmax(20rem,2fr)]">
    <ProjectSection title={t.title}>
      <label>{review.status}<select value={status} className={institutionField} onChange={(event) => {
        setStatus(event.target.value as OutcomePublicationStatus | ""); setAfter(null); select(null);
      }}>
        <option value="">{review.all}</option>
        {outcomePublicationStatuses.filter((state) => state !== "draft").map((state) =>
          <option key={state} value={state}>{t[`state_${state}`]}</option>)}
      </select></label>
      {queue.error !== null && <ApiErrorNotice error={queue.error} retry={queue.refresh} signIn />}
      {queue.data && (queue.data.items.length ? <ul className="grid gap-2">{queue.data.items.map((item) => <li key={item.id}
        className="grid gap-1 rounded-md border border-[var(--theme-border)] p-3">
        <p className="break-words font-semibold">{item.title}</p>
        <p className="break-words text-sm">{item.projectTitle} · {t[`state_${item.status}`]}</p>
        <button type="button" className={institutionLink + " justify-self-start"} onClick={() => select(item.id)}
          aria-pressed={selected === item.id}>{review.view}</button>
      </li>)}</ul> : <p>{review.empty}</p>)}
      {!queue.data && queue.error === null && <ProjectLoading cards={1} className="grid" />}
      <div className="flex flex-wrap gap-3">
        {after && <button type="button" className={institutionLink} onClick={() => { setAfter(null); select(null); }}>{review.first}</button>}
        {queue.data?.nextCursor && <button type="button" className={institutionLink}
          onClick={() => { setAfter(queue.data?.nextCursor ?? null); select(null); }}>{review.next}</button>}
      </div>
    </ProjectSection>
    <div className="grid min-w-0 gap-4">
      {selected && <ProjectSection title={review.caseLabel}><StaffPublication key={selected} workspace={workspace} lane={lane}
        id={selected} roster={roster.data} onChanged={(close) => { if (close) select(null); queue.refresh(); }} /></ProjectSection>}
      {lane === "admin" && <ProjectSection title={review.roster}>
        {roster.error !== null && <ApiErrorNotice error={roster.error} retry={roster.refresh} signIn />}
        {roster.data && <Appointments workspace={workspace} department={department} search={search}
          setSearch={(value) => { if (value === search) roster.refresh(); else setSearch(value); }} roster={roster.data} />}
      </ProjectSection>}
    </div>
  </div>;
}

function ActivePublicationWorkspace({ workspace, lane, onClose }: {
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
    {department && <DepartmentPublication key={department} workspace={workspace.id} lane={lane} department={department} />}
  </>;
}

export function OutcomePublicationWorkspace({ requestedLane, challenge }: { requestedLane: OutcomeStaffLane;
  challenge?: { subject: string; sessionId: string; factorIds: string[] } }) {
  const { t } = useReviewCopy();
  const { t: publication, locale } = usePublicationCopy();
  const router = useRouter();
  const availability = useInstitutionResource(loadPublicationAvailability);
  const [lane, setLane] = useState(requestedLane);
  const [workspace, setWorkspace] = useState<{ id: string; expiresAt: string } | null>(null);
  const [showMfa, setShowMfa] = useState(!!challenge);
  const mutation = useFeedMutation();
  const target = outcomePublicationPath + (lane === "admin" ? "?lane=admin" : "");
  const verifyLink = outcomePublicationPath + "?verify=1" + (lane === "admin" ? "&lane=admin" : "");
  const open = () => void mutation.run(async () => { setWorkspace(await openPublicationWorkspace(lane)); });
  const disabled = apiErrorCode(availability.error) === "PROJECT_OUTCOME_PUBLICATION_DISABLED";
  return <MemberShell><div className="grid min-w-0 gap-4">
    <ProjectsHeader title={publication.title} description={publication.intro} backHref={outcomeReviewPath} actions={
      <Link className={institutionAction} href={impactReviewPath}>{impactCopy(locale)("reviews")}</Link>
    } />
    {disabled ? <ProjectSection title={publication.title}><p role="status">{publication.closed}</p></ProjectSection> :
      availability.error !== null ? <ApiErrorNotice error={availability.error} retry={availability.refresh} signIn /> :
      !availability.data ? <ProjectLoading cards={1} className="grid" /> :
      workspace ? <ActivePublicationWorkspace key={workspace.id} workspace={workspace} lane={lane} onClose={() => setWorkspace(null)} /> :
      showMfa && challenge ? <MfaChallenge {...challenge} workspace={{
        help: publication.intro, onVerified: () => { setShowMfa(false); open(); },
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
