"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { founderIdentityBases } from "@ayinou/shared";
import type {
  FounderControlChallenge, FounderIdentityCase, FounderIdentityQueue, FounderIdentityReceipt, FounderMemberAction, FounderReviewAction, FounderReviewCase,
} from "@ayinou/shared";
import Link from "next/link";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionMessages } from "@/lib/institution-i18n";
import { useMemberIdentity } from "@/lib/member-display-name";
import { useAdminRenewalPath } from "./admin-section-context";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

type Review = { action: FounderReviewAction; reason: NonNullable<FounderIdentityCase["decision"]> };
type Send = (path: string, body: Record<string, unknown>) => Promise<void>;
const activeStates: ReadonlySet<FounderIdentityCase["state"]> = new Set([
  "consent_pending", "proof_pending", "ready_for_review", "held",
]);

export function FounderIdentityPanel({ admin = false, onSuperseded, workspaceId }: { admin?: boolean; onSuperseded?: () => void; workspaceId?: string }) {
  const { memberId } = useMemberIdentity();
  return memberId ? <FounderCases key={memberId} actor={memberId} admin={admin} onSuperseded={onSuperseded} workspaceId={workspaceId} /> : null;
}

function FounderCases({ actor, admin, onSuperseded, workspaceId }: { actor: string; admin: boolean; onSuperseded?: () => void; workspaceId?: string }) {
  const [locale] = useLocale();
  const t = founderMessages[locale];
  const base = admin ? "/api/v1/admin/founder-identity" : "/api/v1/me/founder-identity";
  const load = useCallback((signal: AbortSignal): Promise<FounderIdentityQueue<FounderReviewCase>> =>
    authorizedRequest(base, { signal, headers: workspaceId ? { "X-Ayinou-Workspace": workspaceId } : undefined }, actor), [actor, base, workspaceId]);
  const resource = useInstitutionResource(load);
  const inFlight = useRef<AbortController | null>(null);
  const retryKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const [receipt, setReceipt] = useState<FounderIdentityReceipt | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  useEffect(() => () => inFlight.current?.abort(), []);

  const send: Send = async (path, body) => {
    if (inFlight.current) return;
    const fingerprint = JSON.stringify([path, body]);
    if (retryKey.current?.fingerprint !== fingerprint) retryKey.current = { fingerprint, key: crypto.randomUUID() };
    const controller = new AbortController();
    inFlight.current = controller;
    setError(null);
    setReceipt(null);
    setBusy(true);
    const confirmsControl = body.action === "account_control" || body.action === "accept_and_confirm";
    const request = (payload: Record<string, unknown>) => authorizedRequest(base + path, {
      method: "POST", signal: controller.signal,
      headers: workspaceId ? { "X-Ayinou-Workspace": workspaceId } : undefined, body: JSON.stringify(payload),
    }, actor);
    try {
      const requestId = retryKey.current.key;
      let confirmation = {};
      if (confirmsControl) {
        const issued: FounderControlChallenge = await request({ action: "account_control_challenge",
          requestId: crypto.randomUUID(), expectedVersion: body.expectedVersion, policyVersion: body.policyVersion });
        if (controller.signal.aborted) return;
        confirmation = { challenge: issued.challenge, confirmed: true };
      }
      const result: FounderIdentityReceipt = await request({ ...body, ...confirmation, requestId });
      if (controller.signal.aborted) return;
      retryKey.current = null;
      setReceipt(result);
      if (!path) setUsername("");
      if (body.action === "supersede") onSuperseded?.();
      resource.refresh();
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause);
      if (confirmsControl || apiErrorCode(cause) === "STALE_VERSION") resource.refresh();
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      inFlight.current = null;
    }
  };

  const renewalPath = useAdminRenewalPath();
  const fault = error ?? resource.error;
  const notDeployed = apiErrorCode(fault) === "FOUNDER_IDENTITY_NOT_DEPLOYED";
  const reviewAccessRequired = admin && !resource.data && apiErrorCode(resource.error) === "FORBIDDEN";
  if (!admin && !resource.data?.cases.length && (!fault || notDeployed)) return null;

  const title = admin ? t.adminTitle : t.title;
  const activeCases = resource.data?.cases.filter((item) => activeStates.has(item.state)) ?? [];
  const caseHistory = resource.data?.cases.filter((item) => !activeStates.has(item.state)) ?? [];
  const renderCase = (item: FounderReviewCase) => <FounderCase key={item.id + ":" + item.version} item={item}
    admin={admin} busy={busy} enabled={resource.data?.issuanceEnabled === true && (!admin || resource.data.canIssue !== false)}
    liveProof={resource.data?.liveProofEnabled === true && (!admin || resource.data.canIssue !== false)} send={send} />;
  return <section className={`${institutionCard} grid gap-4`} aria-label={title}>
    <h2 className="text-xl font-semibold">{title}</h2>
    {reviewAccessRequired ? <p role="status" className="max-w-prose text-sm">{t.reviewAccessRequired}</p>
      : notDeployed ? <p role="status">{t.notDeployed}</p>
      : fault != null && <ApiErrorNotice error={fault} retry={resource.refresh} signIn />}
    {admin && apiErrorCode(fault) === "MFA_REQUIRED" && <Link className={institutionLink} href={renewalPath}>{t.verifySession}</Link>}
    {!resource.data && !fault && <p role="status">{authMessages[locale].working}</p>}
    {resource.data && <>
      {!resource.data.issuanceEnabled && <p role="status" className="max-w-prose text-sm">{t.disabled}</p>}
      {admin && <p className="max-w-prose text-sm">{t.openHelp}</p>}
      {admin && resource.data.canIssue === false && <p className="max-w-prose text-sm">{t.founderIssuanceOnly}</p>}
      {admin && <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        void send("", { username: username.trim().toLowerCase(), reason: "member_request" });
      }}>
        <label className="min-w-0 text-sm font-semibold">{t.username}
          <input className={institutionField} value={username} onChange={(event) => setUsername(event.target.value)}
            required pattern="[A-Za-z0-9][A-Za-z0-9_]{2,23}" maxLength={24} />
        </label>
        <button className={institutionAction} disabled={busy}>{t.open}</button>
      </form>}
      {receipt && <p role="status" className="break-words text-sm">{t.receipt} <code>{receipt.auditId}</code></p>}
      {admin && !resource.data.cases.length && <p>{t.noAssigned}</p>}
      {activeCases.length > 0 && <section aria-label={t.activeCases} className="grid gap-3">
        <h3 className="font-semibold">{t.activeCases}</h3>
        {activeCases.map(renderCase)}
      </section>}
      {caseHistory.length > 0 && <details className="rounded-md border border-[var(--theme-border)] p-3 sm:p-4">
        <summary className="cursor-pointer font-semibold">{t.caseHistory}</summary>
        <div className="mt-3 grid gap-3">{caseHistory.map(renderCase)}</div>
      </details>}
    </>}
  </section>;
}

function reviewActions(item: FounderReviewCase, enabled: boolean): Review[] {
  if (item.state === "granted") return [
    { action: "hold", reason: "account_risk" }, { action: "revoke", reason: "account_risk" }, { action: "conflict", reason: "conflict" },
  ];
  if (item.state === "held") return [
    { action: "revoke", reason: "account_risk" },
    ...(enabled && item.proofReady && !item.conflicted ? [{ action: "release", reason: "confirmed" } as const] : []),
  ];
  if (!["consent_pending", "proof_pending", "ready_for_review"].includes(item.state)) return [];
  return [
    { action: "deny", reason: "insufficient_proof" }, { action: "conflict", reason: "conflict" },
    ...(item.state !== "consent_pending" ? [{ action: "hold", reason: "account_risk" } as const] : []),
    ...(enabled && item.state === "ready_for_review" && item.proofReady && !item.conflicted
      ? [{ action: "grant", reason: "confirmed" } as const] : []),
  ];
}

function FounderCase({ item, admin, enabled, busy, liveProof, send }: {
  item: FounderReviewCase; admin: boolean; enabled: boolean; busy: boolean; liveProof: boolean; send: Send;
}) {
  const [locale] = useLocale();
  const t = founderMessages[locale];
  const [basis, setBasis] = useState<typeof founderIdentityBases[number]>(founderIdentityBases[0]);
  const [attested, setAttested] = useState(false);
  const [publish, setPublish] = useState(item.disclose);
  const application = item.regularApplication;
  const accepting = item.state === "consent_pending";
  const combineAcceptance = accepting && liveProof && item.liveEligible !== false;
  const canSupersede = item.supersessionOutcome === "superseded_by_founder_verification";
  const canSupersedeAfterGrant = enabled && item.state === "granted" && application?.status === "pending" && !canSupersede;
  const [review, setReview] = useState<Review | null>(null);
  const [conflictFree, setConflictFree] = useState(false);
  const [confirm, setConfirm] = useState<Exclude<FounderMemberAction, "visibility" | "consent"> | null>(null);
  const controls = reviewActions(item, enabled && item.liveEligible !== false && item.appealStatus !== "pending");
  const grant = review?.action === "grant" || review?.action === "release";
  const act = (fields: object) => send(`/${item.id}/actions`, {
    ...fields, expectedVersion: item.version, policyVersion: item.policyVersion,
  });
  const canWithdraw = ["consent_pending", "proof_pending", "ready_for_review", "granted", "held"].includes(item.state);
  const needsProof = item.consented && !item.conflicted &&
    ["proof_pending", "ready_for_review", "held"].includes(item.state) && !item.proofReady;
  const pendingProof = liveProof && item.liveEligible !== false && needsProof;
  const canCorrect = ["granted", "held", "revoked", "denied", "withdrawn"].includes(item.state);

  function submitReview(event: FormEvent) {
    event.preventDefault();
    if (review && (!grant || conflictFree)) void act({ ...review, ...(grant ? { noConflict: true } : {}) });
  }

  return <article className="grid min-w-0 gap-3 rounded-md border border-[var(--theme-border)] p-3 sm:p-4">
    <h3 className="break-words font-semibold">{admin && item.username ? `@${item.username} · ` : ""}{t.states[item.state]}</h3>
    {item.decision && <p className="text-sm">{t.reasons[item.decision]}</p>}
    {!activeStates.has(item.state) && <p className="text-sm text-[var(--theme-body)]">
      {t.lastUpdated} · <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString(locale)}</time>
    </p>}
    {item.appealStatus ? <p role="status" className="max-w-prose text-sm">{item.appealStatus === "pending" ? t.correctionPending : t.appeal.outcomes[item.appealStatus]}
      {item.appealRef && <> <code className="break-all">{item.appealRef}</code></>}</p>
      : item.correctionPending && <p className="max-w-prose text-sm">{t.correctionPending}</p>}
    {liveProof && (accepting || needsProof) && item.liveEligible === false && <p role="status">{t.liveProof.outsidePolicy}</p>}
    {admin ? <>
      {application && <p className="text-sm">{t.regularApplication} · {institutionMessages[locale][application.status]}</p>}
      {application?.status === "pending" && activeStates.has(item.state) && <p className="text-sm">{t.supersessionExplanation}</p>}
      {item.supersessionOutcome && <p className="text-sm">
        {canSupersede && application?.status === "pending" ? t.supersessionReady : t.supersessionResults[item.supersessionOutcome]}
      </p>}
      <p className="text-sm">{item.consented ? t.consentRecorded : t.consentMissing} · {item.proofReady ? t.proofReady : t.proofMissing}</p>
      {pendingProof && !item.controlReady && <p role="status">{t.liveProof.waitForMember}</p>}
      {pendingProof && item.controlReady && <form className="grid max-w-md gap-3" onSubmit={(event) => {
        event.preventDefault();
        if (attested) void act({ action: "attest", basis, noConflict: true });
      }}>
        <p role="status">{t.liveProof.controlReady}</p>
        <label className="text-sm font-semibold">{t.liveProof.basis}
          <select className={institutionField} value={basis} onChange={(event) => {
            const next = founderIdentityBases.find((value) => value === event.target.value);
            if (next) setBasis(next);
          }}>{founderIdentityBases.map((value) => <option key={value} value={value}>{t.liveProof.methods[value]}</option>)}</select>
        </label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={attested} required
          onChange={(event) => setAttested(event.target.checked)} />{t.liveProof.attestation}</label>
        <button className={institutionAction} disabled={busy || !attested}>{t.actions.attest}</button>
      </form>}
      {controls.length > 0 && <form onSubmit={submitReview} className="grid max-w-md gap-3">
        <label className="text-sm font-semibold">{t.reviewAction}
          <select className={institutionField} value={review?.action ?? ""} onChange={(event) => {
            setReview(controls.find(({ action }) => action === event.target.value) ?? null);
            setConflictFree(false);
          }}>
            <option value="">{t.choose}</option>
            {controls.map(({ action }) => <option key={action} value={action}>{t.actions[action]}</option>)}
          </select>
        </label>
        {review && <p className="text-sm">{t.reasons[review.reason]}</p>}
        {grant && <label className="flex items-start gap-2 text-sm">
          <input className="mt-1" type="checkbox" checked={conflictFree} onChange={(event) => setConflictFree(event.target.checked)} required />{t.noConflict}
        </label>}
        <button className={`${institutionAction} justify-self-start`} disabled={busy || !review || (grant && !conflictFree)}>{t.confirm}</button>
      </form>}
      <details>
        <summary className="cursor-pointer font-semibold">{t.history}</summary>
        <ul className="mt-2 grid gap-2 text-sm">
          {item.history.map((entry) => <li key={entry.id} className="break-words">
            {t.actions[entry.action]} · <time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString(locale)}</time>
            {" · "}<code>{entry.id}</code>
            {entry.reason && entry.action !== "open" && <p className="mt-1 text-[var(--theme-body)]">{t.reasons[entry.reason]}</p>}
          </li>)}
        </ul>
      </details>
    </> : <>
      {accepting && <>
        <p className="max-w-prose text-sm">{t.consentExplanation.replace("{version}", String(item.policyVersion))}</p>
        {combineAcceptance && <p className="max-w-prose text-sm">{t.liveProof.sessionHelp}</p>}
        <p className="max-w-prose text-sm">{t.supersessionExplanation}</p>
      </>}
      {canWithdraw && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={busy} checked={publish} onChange={(event) => setPublish(event.target.checked)} />{t.publicChoice}
        </label>
        {accepting ? <button type="button" className={institutionAction} disabled={busy}
          onClick={() => { void act({ action: combineAcceptance ? "accept_and_confirm" : "consent", disclose: publish,
          }); }}>{combineAcceptance ? t.liveProof.acceptAndConfirm : t.actions.consent}</button>
          : <button type="button" className={institutionAction} disabled={busy || publish === item.disclose}
            onClick={() => { void act({ action: "visibility", disclose: publish }); }}>{t.actions.visibility}</button>}
        <button type="button" className={institutionLink} disabled={busy} onClick={() => setConfirm("withdraw")}>{item.state === "consent_pending" ? t.appeal.decline : t.actions.withdraw}</button>
      </div>}
      {pendingProof && (item.controlReady ? <p role="status">{t.liveProof.controlReady}</p> : <div className="grid gap-2">
        <p className="max-w-prose text-sm">{t.liveProof.sessionHelp}</p>
        <button type="button" className={`${institutionAction} justify-self-start`} disabled={busy}
          onClick={() => { void act({ action: "account_control" }); }}>{t.actions.account_control}</button>
      </div>)}
      {canSupersedeAfterGrant && <button type="button" className={institutionLink} disabled={busy}
        onClick={() => setConfirm("supersede")}>{t.actions.supersede}</button>}
      {canCorrect && !item.correctionPending && <button type="button" className={`${institutionLink} justify-self-start`} disabled={busy}
        onClick={() => setConfirm("correction")}>{t.appeal.request}</button>}
      {confirm && <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-sm">{t.prompts[confirm]}</p>
        <button type="button" className={institutionAction} disabled={busy}
          onClick={() => { void act({ action: confirm, ...(confirm === "supersede" && canSupersedeAfterGrant ? {
            applicationId: application.id, revision: application.revision,
          } : {}) }); }}>{t.confirm}</button>
        <button type="button" className={institutionLink} onClick={() => setConfirm(null)}>{t.cancel}</button>
      </div>}
      {!!item.memberHistory?.length && <details>
        <summary className="cursor-pointer font-semibold">{t.history}</summary>
        <ul className="mt-2 grid gap-2 text-sm">{item.memberHistory.map((event, index) =>
          <li key={event.occurredAt + event.action + index}>{t.actions[event.action]} · <time dateTime={event.occurredAt}>
            {new Date(event.occurredAt).toLocaleString(locale)}</time></li>)}</ul>
      </details>}
    </>}
  </article>;
}
