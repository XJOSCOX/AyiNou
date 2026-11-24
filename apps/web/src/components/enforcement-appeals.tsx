"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import {
  enforcementAppealStatuses,
  type AppealableDecision, type EnforcementAppeal, type EnforcementAppealStaffAction, type MemberEnforcementAppeals,
  type StaffEnforcementAppeal, type StaffEnforcementAppeals,
} from "@ayinou/shared";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { adminMessages } from "@/lib/admin-i18n";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { appealHistoryLabels, enforcementAppealMessages } from "@/lib/enforcement-appeal-i18n";
import { moderationCenterMessages } from "@/lib/moderation-center-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { featureMessages } from "@/lib/feature-enforcement-i18n";
import { useLocale } from "@/lib/locale-store";
import { localizedApiError } from "@/lib/error-i18n";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

const memberPath = "/api/v1/me/enforcement-appeals";
const staffPath = "/api/v1/moderation/enforcement-appeals";

function useAppealLabels() {
  const [locale] = useLocale();
  const t = enforcementAppealMessages[locale];
  const fields: Record<string, string> = { ...feedMessages[locale], ...moderationCenterMessages[locale], ...accountEnforcementMessages[locale], ...featureMessages[locale], ...t };
  const actions: Record<string, string> = { ...fields, ...appealHistoryLabels(locale) };
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return { locale, t, fields, actions, dates };
}

function DecisionDetails({ item }: { item: AppealableDecision }) {
  const { t, fields, dates } = useAppealLabels();
  return <dl className="grid gap-2 text-sm sm:grid-cols-2">
    <div><dt className="font-semibold">{t.decision}</dt><dd>{fields[item.kind] ?? t[item.domain]} · {fields[item.category]}</dd></div>
    <div><dt className="font-semibold">{t.decisionState}</dt><dd>{fields[item.state]}</dd></div>
    <div><dt className="font-semibold">{t.deadline}</dt><dd><time dateTime={item.deadline}>{dates.format(new Date(item.deadline))}</time></dd></div>
    <div className="min-w-0"><dt className="font-semibold">{t.reference}</dt><dd className="break-all">{item.id}</dd></div>
    {item.scopeId && <div className="min-w-0"><dt className="font-semibold">{fields[item.scope]}</dt><dd className="break-all">{item.scopeId}</dd></div>}
  </dl>;
}

function AppealNotices({ notices }: { notices: MemberEnforcementAppeals["notices"] }) {
  const { t, fields, dates } = useAppealLabels();
  if (!notices.length) return null;
  return <details className={institutionCard}>
    <summary className="cursor-pointer font-semibold">{t.notices}</summary>
    <ul className="mt-3 grid max-h-72 gap-2 overflow-auto">
      {notices.map((notice) => <li key={notice.id} className="min-w-0 break-words text-sm">
        <p>{fields[notice.action]} · <time dateTime={notice.occurredAt}>{dates.format(new Date(notice.occurredAt))}</time></p>
        {notice.caseId && <p className="break-all text-[var(--theme-body)]">{notice.caseId}</p>}
        {notice.eventId && <Link href={"/events/" + notice.eventId} className={institutionLink}>{t.event}</Link>}
      </li>)}
    </ul>
  </details>;
}

export function MemberAppeals({ eventId, noticesOnly = false }: { eventId?: string; noticesOnly?: boolean }) {
  const { locale, t, fields } = useAppealLabels();
  const load = useCallback((signal: AbortSignal): Promise<MemberEnforcementAppeals> => authorizedRequest(
    memberPath + (eventId ? "?event=" + encodeURIComponent(eventId) : ""), { signal, cache: "no-store" }), [eventId]);
  const member = useInstitutionResource(load);
  if (noticesOnly) return <AppealNotices notices={member.data?.notices ?? []} />;
  if (eventId && member.data && !member.data.decisions.length && !member.data.appeals.length && !member.data.notices.length) return null;
  return <section className="grid min-w-0 gap-3" aria-label={t.title}>
    <div className={institutionCard}>
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <p className="mt-2 text-sm">{t.intro}</p>
      {member.error !== null ? <>
        <p role="alert" className="my-2 text-sm">{localizedApiError(locale, member.error)}</p>
        <button type="button" className={institutionLink} onClick={member.refresh}>{authMessages[locale].retry}</button>
      </> : !member.data ? <p role="status" className="mt-2 text-sm">{authMessages[locale].working}</p>
        : !member.data.decisions.length && !member.data.appeals.length && <p className="mt-2 text-sm">{t.none}</p>}
    </div>
    {member.data?.decisions.map((item) => <div className={institutionCard} key={item.domain + item.id}>
      <DecisionDetails item={item} />
      {item.canAppeal ? <MemberAppealAction label={t.submit} action="submit" decision={item} onSaved={member.refresh} />
        : !item.appeal && <p className="mt-3 text-sm">{t.notEligible}</p>}
    </div>)}
    {!!member.data?.appeals.length && <section className={institutionCard}>
      <h3 className="font-semibold">{t.history}</h3>
      <ul className="mt-2 divide-y divide-[var(--theme-border)]">
        {member.data.appeals.map((item) => <li className="grid gap-1 py-3 text-sm" key={item.id}>
          <p className="font-semibold">{fields[item.kind] ?? t[item.domain]} · {t[item.status]}</p>
          <p className="break-all">{t.reference} · {item.id}</p>
          {item.status === "correction" && <>
            <p>{t.memberReply}</p>
            <MemberAppealAction label={t.correct} action="correct" appeal={item} onSaved={member.refresh} />
          </>}
          {["submitted", "assigned", "correction"].includes(item.status) &&
            <MemberAppealAction label={t.withdraw} action="withdraw" appeal={item} onSaved={member.refresh} />}
        </li>)}
      </ul>
    </section>}
    <AppealNotices notices={member.data?.notices ?? []} />
  </section>;
}

function MemberAppealAction({ label, action, decision, appeal, onSaved }: {
  label: string;
  action: "submit" | "correct" | "withdraw";
  decision?: AppealableDecision;
  appeal?: EnforcementAppeal;
  onSaved: () => void;
}) {
  const { t } = useAppealLabels();
  return <details className="mt-2">
    <summary className={`${institutionLink} cursor-pointer`}>{label}</summary>
    <AppealForm label={label} description={action === "submit" ? t.intro : undefined}
      reasonLabel={action === "withdraw" ? undefined : t.reason} max={2000} onSaved={onSaved}
      submit={(reason, requestId) => authorizedRequest(memberPath, { method: "POST", body: JSON.stringify(action === "submit"
        ? { action, reference: decision?.id, domain: decision?.domain, reason, requestId }
        : { action, reference: appeal?.id, revision: appeal?.revision, ...(action === "correct" ? { reason } : {}), requestId }) })} />
  </details>;
}

function AppealForm({ label, description, reasonLabel, max, onSaved, submit }: {
  label: string;
  description?: string;
  reasonLabel?: string;
  max: number;
  submit: (reason: string, requestId: string) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [locale] = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<{ reason: string; key: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (pending.current?.reason !== reason) pending.current = { reason, key: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    try { await submit(reason, pending.current.key); onSaved(); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  return <form onSubmit={save} className="mt-3 grid gap-3 text-sm" aria-busy={busy}>
    {description && <p>{description}</p>}
    {reasonLabel && <label className="font-semibold">{reasonLabel}
      <textarea name="reason" minLength={10} maxLength={max} rows={3} required className={institutionField} />
    </label>}
    {error !== null && <p className={institutionErrorBox} role="alert">{localizedApiError(locale, error)}</p>}
    <button type="submit" disabled={busy} className={`${institutionAction} justify-self-start`}>{label}</button>
  </form>;
}

export function StaffAppeals({ workspace, lane }: { workspace: string; lane: "admin" | "review" }) {
  const { locale, t } = useAppealLabels();
  const admin = adminMessages[locale];
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string>();
  const load = useCallback((signal: AbortSignal): Promise<StaffEnforcementAppeals> => {
    const query = new URLSearchParams({ lane });
    if (search) query.set("search", search);
    if (status) query.set("status", status);
    if (cursor) query.set("cursor", cursor);
    return authorizedRequest(staffPath + "?" + query, { signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace } });
  }, [lane, search, status, cursor, workspace]);
  const resource = useInstitutionResource(load);
  const items = resource.data?.cases ?? [];
  return <section className="grid min-w-0 gap-3" aria-label={t.title}>
    <div className={institutionCard}>
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <label className="text-sm font-semibold">{t.status}
          <select className={institutionField} value={status} onChange={(event) => { setStatus(event.target.value); setCursor(undefined); }}>
            <option value="">{admin.select}</option>
            {enforcementAppealStatuses.map((item) => <option key={item} value={item}>{t[item]}</option>)}
          </select>
        </label>
        {lane === "admin" && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          setSearch(String(new FormData(event.currentTarget).get("search") ?? "").trim());
          setCursor(undefined);
        }}>
          <label className="min-w-0 flex-1 text-sm font-semibold">{t.reviewers}
            <input name="search" type="search" minLength={2} maxLength={64} className={institutionField} />
          </label>
          <button className={institutionAction} type="submit">{admin.search}</button>
        </form>}
      </div>
      {resource.error !== null && <AdminFeedback error={resource.error} retry={resource.refresh}
        next={lane === "review" ? "/verification/review" : "/admin"} />}
      {!resource.data && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
      {resource.data && !items.length && <p className="mt-3 text-sm">{t.none}</p>}
    </div>
    {items.map((item) => <StaffAppealCard key={item.id + item.revision} item={item} reviewers={resource.data?.reviewers ?? []}
      workspace={workspace} lane={lane} onSaved={resource.refresh} />)}
    {(cursor || resource.data?.nextCursor) && <div className="flex gap-3">
      {cursor && <button type="button" className={institutionLink} onClick={() => setCursor(undefined)}>{featureMessages[locale].newer}</button>}
      {resource.data?.nextCursor && <button type="button" className={institutionLink}
        onClick={() => setCursor(resource.data?.nextCursor ?? undefined)}>{featureMessages[locale].older}</button>}
    </div>}
  </section>;
}

function StaffAppealCard({ item, reviewers, workspace, lane, onSaved }: {
  item: StaffEnforcementAppeal;
  reviewers: StaffEnforcementAppeals["reviewers"];
  workspace: string;
  lane: "admin" | "review";
  onSaved: () => void;
}) {
  const { locale, t, actions, dates } = useAppealLabels();
  const [reviewer, setReviewer] = useState("");
  const available: EnforcementAppealStaffAction[] = item.canReview ? ["uphold", "overturn", "return"] :
    item.canRelease ? ["release", "decline_release"] : [];
  if (lane === "admin" && ["submitted", "assigned", "correction"].includes(item.status)) {
    if (reviewers.length) available.push("assign");
    if (!item.decisionInfo || item.decisionInfo.state === "revoked") available.push("close");
  }
  return <article className={institutionCard}>
    <h3 className="font-semibold">{t[item.domain]} · {t[item.status]}</h3>
    <p className="my-2 break-all text-sm">{t.reference} · {item.id}</p>
    {item.reviewer && <p className="my-2 break-all text-sm">{t.assignedTo} · {item.reviewer}</p>}
    {item.decisionInfo && <DecisionDetails item={item.decisionInfo} />}
    <details className="mt-3">
      <summary className="cursor-pointer font-semibold">{t.history}</summary>
      <ul className="mt-2 grid gap-3 text-sm">
        {item.history.map((entry) => <li key={entry.id} className="min-w-0 break-words">
          <p>{actions["appeal_" + entry.action] ?? t.recorded} · {dates.format(new Date(entry.occurredAt))}</p>
          {entry.narrative && <p className="whitespace-pre-wrap">{entry.narrative}</p>}
        </li>)}
      </ul>
    </details>
    {available.map((action) => <details className="mt-3" key={action}>
      <summary className={`${institutionLink} cursor-pointer`}>{t[action]}</summary>
      {action === "assign" && <label className="mt-2 block text-sm font-semibold">{t.assignedTo}
        <select className={institutionField} value={reviewer} onChange={(event) => setReviewer(event.target.value)}>
          <option value="">{adminMessages[locale].select}</option>
          {reviewers.map((person) => <option value={person.id} key={person.id}>@{person.username}</option>)}
        </select>
      </label>}
      {(action !== "assign" || reviewer) && <AppealForm key={action + reviewer} label={t[action]} reasonLabel={t.finding}
        description={action === "overturn" ? t.restrictedStill : undefined} max={500} onSaved={onSaved}
        submit={(reason, requestId) => authorizedRequest(staffPath + "?lane=" + lane, {
          method: "POST", headers: { "X-Ayinou-Workspace": workspace },
          body: JSON.stringify({ id: item.id, revision: item.revision, requestId, action, reason, ...(action === "assign" ? { reviewer } : {}) }),
        })} />}
    </details>)}
  </article>;
}
