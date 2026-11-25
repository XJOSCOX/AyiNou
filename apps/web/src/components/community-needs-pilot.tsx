"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { pilotMetrics, pilotRequirements, pilotStages, type PilotDecision, type PilotWorkspace } from "@ayinou/shared";
import { adminEntryPath } from "@/lib/admin-navigation";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { localizedApiError } from "@/lib/error-i18n";
import { useLocale } from "@/lib/locale-store";
import { pilotLabel, type PilotLabel } from "@/lib/community-needs-pilot-i18n";
import { adminCompactCard, adminSecondaryAction } from "./admin-controls";
import { institutionAction, institutionErrorBox, institutionField, useInstitutionResource } from "./institution-ui";

const path = "/api/v1/admin/community-needs-pilot";
type PendingDecision = { action: PilotDecision; target?: string; handle?: string };

function PilotPanel({ title, children }: { title: string; children: ReactNode }) {
  return <section className={adminCompactCard + " grid min-w-0 gap-3"}>
    <h2 className="text-lg font-semibold">{title}</h2>{children}
  </section>;
}

export function CommunityNeedsPilot({ workspace }: { workspace: string }) {
  const [locale] = useLocale();
  const t = (key: PilotLabel) => pilotLabel(locale, key);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [before, setBefore] = useState<number>();
  const [decision, setDecision] = useState<PendingDecision>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(false);
  const [error, setError] = useState<unknown>();
  const lastReceipt = useRef<{ digest: string; id: string } | null>(null);
  const headers = { "X-Ayinou-Workspace": workspace };
  const load = useCallback((signal: AbortSignal): Promise<PilotWorkspace> => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (before !== undefined) params.set("before", String(before));
    return authorizedRequest(path + (params.size ? "?" + params : ""), {
      signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspace },
    });
  }, [workspace, search, before]);
  const resource = useInstitutionResource(load);
  const pilot = resource.data;
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const feedback = (cause: unknown) => apiErrorCode(cause) === "COMMUNITY_NEEDS_PILOT_CLOSED" ? t("blocked")
    : apiErrorCode(cause) === "COMMUNITY_NEEDS_PILOT_CAPACITY" ? t("intakeCapacity") : localizedApiError(locale, cause);

  async function submit(event: FormEvent<HTMLFormElement>, action: PilotDecision, fields: Record<string, unknown> = {}) {
    event.preventDefault();
    if (!pilot || busy) return;
    const form = new FormData(event.currentTarget);
    if (form.get("confirmed") !== "on") return;
    const command = { action, expectedRevision: pilot.revision, confirmed: true, reason: String(form.get("reason") ?? ""), ...fields };
    const digest = JSON.stringify(command);
    if (lastReceipt.current?.digest !== digest) lastReceipt.current = { digest, id: crypto.randomUUID() };
    setBusy(true);
    setError(undefined);
    setMessage(false);
    try {
      await authorizedRequest(path, {
        method: "PATCH", cache: "no-store", headers, body: JSON.stringify({ ...command, requestId: lastReceipt.current.id }),
      });
      lastReceipt.current = null;
      setDecision(undefined);
      setBefore(undefined);
      setMessage(true);
      resource.refresh();
    } catch (cause) {
      setError(cause);
      resource.refresh();
    } finally {
      setBusy(false);
    }
  }
  function select(action: PilotDecision, target?: string, handle?: string) {
    setDecision({ action, target, handle });
    setMessage(false);
    setError(undefined);
  }
  const confirmation = (action: PilotDecision, disabled = false) => <>
    <label className="grid gap-1 text-sm">
      {t("reason")}
      <textarea name="reason" minLength={10} maxLength={500} rows={2} required className={institutionField} />
    </label>
    <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="confirmed" required />{t("confirm")}</label>
    <button type="submit" disabled={busy || disabled} className={action === "pause" || action === "remove" ? adminSecondaryAction : institutionAction}>
      {t(action)}
    </button>
  </>;

  if (resource.error) return <p role="alert" className={institutionErrorBox}>{feedback(resource.error)}</p>;
  if (!pilot) return <p role="status">{authMessages[locale].working}</p>;
  const state = pilot.status;
  const active = state === "active" || state === "blocked";
  const hasStarted = !!pilot.endsAt;
  const eligibleState = pilot.revision > 0 && state !== "expired";
  const action = active ? "pause" : state === "paused" ? "resume" : "activate";

  return <div className="grid min-w-0 gap-4">
    <PilotPanel title={t("title")}>
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[[t("status"), t(state)], [t("scope"), pilot.scopeAvailable ? "Ouest" : t("unavailable")],
          [t("revision"), number.format(pilot.revision)], [t("expires"), pilot.endsAt ? date.format(new Date(pilot.endsAt)) : t("unavailable")]]
          .map(([label, value]) => <div key={label} className="rounded-md bg-[var(--theme-control)] p-3"><dt className="text-sm">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
      </dl>
      {message && <p role="status" className="text-sm font-semibold">{t("saved")}</p>}
      {error != null && <p role="alert" className={institutionErrorBox}>{feedback(error)}</p>}
    </PilotPanel>
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
      <PilotPanel title={t("readiness")}>
        <p className="text-sm text-[var(--theme-body)]">{t("readinessHelp")}</p>
        <dl className="grid gap-2">
          <div className="flex flex-wrap justify-between gap-x-3 border-b border-[var(--theme-border)] py-2">
            <dt>{t("configuredRelease")}</dt><dd className="font-semibold">{t(pilot.releaseConfigured ? "verified" : "unavailable")}</dd>
          </div>
          {pilotRequirements.map((item) => <div key={item} className="flex flex-wrap justify-between gap-x-3 border-b border-[var(--theme-border)] py-2">
            <dt>{t(item)}</dt><dd className="font-semibold">{t(pilot.requirements[item])}</dd>
          </div>)}
        </dl>
        <div className="grid gap-2">
          {(state !== "expired" && state !== "unconfigured") && <button type="button" className={adminSecondaryAction}
            disabled={busy || (!active && !pilot.ready)} onClick={() => select(action)}>{t(action)}</button>}
          {decision && ["activate", "resume", "pause"].includes(decision.action) &&
            <form key={decision.action} className="grid gap-2" onSubmit={(event) => void submit(event, decision.action)}>
              {confirmation(decision.action)}
            </form>}
        </div>
      </PilotPanel>
      <PilotPanel title={t("configuration")}>
        <form key={pilot.revision} className="grid gap-3" onSubmit={(event) => {
          const form = new FormData(event.currentTarget);
          const stages = Object.fromEntries(pilotStages.map((key) => [key, active ? pilot.stages[key] : form.has(key)]));
          void submit(event, "configure", { stages, durationDays: hasStarted ? pilot.durationDays : Number(form.get("durationDays")), capacity: Number(form.get("capacity")) });
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">{t("capacity")}
              <input name="capacity" type="number" className={institutionField} min={1} max={active ? Math.max(1, pilot.capacity - 1) : 10}
                defaultValue={active ? Math.max(1, pilot.capacity - 1) : pilot.capacity} required /></label>
            <label className="grid gap-1 text-sm">{t("durationDays")}
              <input name="durationDays" type="number" className={institutionField} min={1} max={30}
                defaultValue={pilot.durationDays} disabled={hasStarted} required /></label>
          </div>
          <fieldset className="grid gap-2" disabled={active}>
            <legend className="sr-only">{t("controls")}</legend>
            {pilotStages.map((key) => <label key={key} className="flex items-center gap-2">
              <input name={key} type="checkbox" defaultChecked={pilot.stages[key]} />{t(key)}
            </label>)}
          </fieldset>
          {confirmation("configure", active && pilot.capacity <= 1)}
        </form>
      </PilotPanel>
    </div>
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
      <PilotPanel title={t("cohort")}>
        <p className="text-sm">{t("members")} <strong>{number.format(pilot.activeParticipants)} / 20</strong></p>
        {eligibleState && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          setSearch(query.trim().replace(/^@/, ""));
          setDecision(undefined);
        }}>
          <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm">{t("search")}
            <input type="search" className={institutionField} value={query} autoComplete="off" maxLength={25}
              required pattern="@?[a-zA-Z0-9_]{2,24}" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className={adminSecondaryAction}>{t("searchButton")}</button>
        </form>}
        {!!search && !pilot.candidates.length && <p role="status" className="text-sm">{t("noMatches")}</p>}
        {pilot.candidates.length > 0 && <ul className="grid gap-2">{pilot.candidates.map((candidate) =>
          <li className="flex flex-wrap items-center justify-between gap-2" key={candidate.id}>
            <span dir="auto">@{candidate.handle}</span>
            <button type="button" className={adminSecondaryAction} onClick={() => select("enroll", candidate.id, candidate.handle)}>{t("enroll")}</button>
          </li>)}</ul>}
        <ul className="grid gap-2">{pilot.enrollments.map((item) =>
          <li className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--theme-border)] pb-2" key={item.id}>
            <div className="grid text-sm"><strong dir="auto">{item.handle ? "@" + item.handle : t("unavailable")}</strong>
              <span>{t(item.status)} · <time dateTime={item.expiresAt}>{date.format(new Date(item.expiresAt))}</time></span></div>
            {item.status !== "removed" && <button type="button" className={adminSecondaryAction} onClick={() => select("remove", item.id, item.handle ?? undefined)}>{t("remove")}</button>}
          </li>)}</ul>
        {decision && (decision.action === "enroll" || decision.action === "remove") &&
          <form key={decision.action + decision.target} className="grid gap-2" onSubmit={(event) => {
            const form = new FormData(event.currentTarget);
            void submit(event, decision.action, { target: decision.target, ...(decision.action === "enroll" ? { days: Number(form.get("days")) } : {}) });
          }}>
            {decision.handle && <strong dir="auto">@{decision.handle}</strong>}
            {decision.action === "enroll" && <label className="grid gap-1 text-sm">{t("enrollmentDays")}
              <input className={institutionField} name="days" type="number" min={1} max={pilot.durationDays} defaultValue={pilot.durationDays} required />
            </label>}
            {confirmation(decision.action)}
          </form>}
      </PilotPanel>
      <PilotPanel title={t("staff")}>
        <p className="text-sm text-[var(--theme-body)]">{t("staffHelp")}</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div><dt>{t("triagers")}</dt><dd className="font-semibold">{number.format(pilot.triagers)}</dd></div>
          <div><dt>{t("reviewers")}</dt><dd className="font-semibold">{number.format(pilot.reviewers)}</dd></div>
        </dl>
        {(pilot.triagers < 1 || pilot.reviewers < 4) && <p role="status" className="font-semibold">{t("coverageGap")}</p>}
        <ul className="grid gap-2">{pilot.staff.map((member) => <li key={member.id + member.lane}
          className="grid gap-1 rounded-md bg-[var(--theme-control)] p-3 text-sm">
          <strong dir="auto">{member.handle ? "@" + member.handle : t("unavailable")}</strong>
          <span>{t(member.lane)} · {t(member.revoked ? "removed" : member.eligible ? "eligible" : "recertify")}</span>
          <span>{t("expires")} <time dateTime={member.expiresAt}>{date.format(new Date(member.expiresAt))}</time></span>
          <span>{t("assigned")} {number.format(member.assigned)} · {t("challenges")} {number.format(member.challenges)}</span>
        </li>)}</ul>
        {pilot.releaseConfigured && pilot.revision > 0 &&
          <Link href={adminEntryPath("communityNeeds")} className={adminSecondaryAction}>{t("operations")}</Link>}
      </PilotPanel>
    </div>
    <PilotPanel title={t("monitoring")}>
      {pilot.metrics ? <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {pilotMetrics.map((key) => <div key={key} className="rounded-md bg-[var(--theme-control)] p-3">
          <dt className="text-sm">{t(key === "pending" ? "pendingCases" : key)}</dt>
          <dd className="font-semibold">{number.format(pilot.metrics![key])}</dd>
        </div>)}
      </dl> : <p>{t("unavailable")}</p>}
    </PilotPanel>
    <PilotPanel title={t("history")}>
      {!pilot.history.length && <p>{t("noHistory")}</p>}
      <ol className="grid gap-2">{pilot.history.map((entry) => <li key={entry.revision}
        className="grid gap-1 rounded-md border border-[var(--theme-border)] p-3">
        <strong>{number.format(entry.revision)} · {t(entry.action)}</strong>
        <span className="text-sm" dir="auto">{[entry.actor, entry.subject].filter(Boolean).join(" · ")} · <time dateTime={entry.occurredAt}>{date.format(new Date(entry.occurredAt))}</time></span>
        <p className="break-words text-sm" dir="auto">{entry.reason}</p>
      </li>)}</ol>
      {(pilot.hasMore || before !== undefined) && <div className="flex flex-wrap gap-2">
        {before !== undefined && <button type="button" className={adminSecondaryAction} onClick={() => setBefore(undefined)}>{t("latest")}</button>}
        {pilot.hasMore && <button type="button" className={adminSecondaryAction} onClick={() => setBefore(pilot.history.at(-1)?.revision)}>{t("earlier")}</button>}
      </div>}
    </PilotPanel>
  </div>;
}
