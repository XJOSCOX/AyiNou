"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { governmentKinds, organizationKinds, organizationRegistrationStatuses, type OrganizationOnboardingIntent, type OrganizationSetupDraft,
  type OrganizationSetupMatch, type OrganizationSetupReceipt, type OrganizationSetupView } from "@ayinou/shared";
import { authorizedRequest, fetchDepartments } from "@/lib/api";
import { ApiRequestError, apiErrorCode } from "@/lib/api-errors";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { organizationOnboardingMessages } from "@/lib/organization-onboarding-i18n";
import { organizationSetupMessages, organizationSetupPath as base } from "@/lib/organization-setup";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

const kinds = organizationKinds.filter((kind) => !governmentKinds.includes(kind));
type Command = { operation: "details" | "complete"; body: object };

export function OrganizationSetupPanel({ subject, intent, claim, onReceipt }: {
  subject: string; intent: OrganizationOnboardingIntent | null; claim: string;
  onReceipt: (receipt: OrganizationSetupReceipt) => void;
}) {
  const [locale] = useLocale();
  const t = organizationSetupMessages[locale];
  const onboarding = organizationOnboardingMessages[locale];
  const [view, setView] = useState<OrganizationSetupView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Command | null>(null);
  const active = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const draftHeading = useRef<HTMLParagraphElement>(null);
  const intentId = intent?.id ?? null;
  const intentVersion = intent?.version ?? null;

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    const load: Promise<OrganizationSetupView> = authorizedRequest(base + "/setup", { signal: controller.signal }, subject);
    void load.then((data) => {
      if (!controller.signal.aborted) setView(data);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause); });
    return () => controller.abort();
  }, [subject, intentId, intentVersion, revision]);

  function reload() {
    setError(null);
    setPending(null);
    setRevision((value) => value + 1);
  }

  async function send(command: Command) {
    const controller = active.current;
    if (!controller || !intentId || controller.signal.aborted || writing.current) return;
    writing.current = true;
    setBusy(true);
    setError(null);
    try {
      const receipt: OrganizationSetupReceipt = await authorizedRequest(`${base}/${intentId}/${command.operation}`, {
        method: command.operation === "details" ? "PUT" : "POST",
        body: JSON.stringify(command.body), signal: controller.signal,
      }, subject);
      if (controller.signal.aborted) return;
      setPending(null);
      setEditing(false);
      if (receipt.result) {
        setView((current) => current && { ...current, result: receipt.result, intentId: null, version: null, draft: null });
        requestAnimationFrame(() => resultHeading.current?.focus());
      }
      if (receipt.draft) {
        setView((current) => current && { ...current, draft: receipt.draft, version: receipt.version });
        requestAnimationFrame(() => draftHeading.current?.focus());
      }
      onReceipt(receipt);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause);
      if (cause instanceof ApiRequestError && (cause.status === 0 || cause.status >= 500)) setPending(command);
    } finally {
      writing.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const code = apiErrorCode(error);
  const setupError = code === "ORG_SETUP_IDENTITY_REQUIRED" ? t.identity
    : code === "ORG_SETUP_HANDLE_UNAVAILABLE" ? t.duplicate
    : code === "ORG_SETUP_PROTECTED" ? t.protected
    : code === "ORG_SETUP_AUTHORITY_REQUIRED" ? t.authority
    : code === "ORG_SETUP_PROFILE_REQUIRED" ? onboarding.personalFirst
    : code === "INSTITUTION_EVIDENCE_REQUIRED" ? t.references
    : code === "STALE_VERSION" || code === "IDEMPOTENCY_CONFLICT" ? onboarding.stale : null;
  const current = view?.intentId === intentId && view?.version === intentVersion ? view : null;
  const result = !intentId ? view?.result : null;
  if (!intentId && !result) return null;
  const blocked = busy || !!pending || code === "STALE_VERSION" || code === "IDEMPOTENCY_CONFLICT";

  return <section className={`${institutionCard} grid gap-4`} aria-busy={busy}>
    <h2 ref={resultHeading} tabIndex={-1} className="text-xl font-semibold">{result ? t.resultTitle : t.detailsTitle}</h2>
    {error !== null && (setupError ? <p role="alert">{setupError}</p> : <ApiErrorNotice error={error} />)}
    {pending && <div className="flex flex-wrap gap-3">
      <button className={institutionAction} disabled={busy} type="button" onClick={() => void send(pending)}>{onboarding.retry}</button>
      <button className={institutionLink} disabled={busy} type="button" onClick={() => window.location.reload()}>{onboarding.refresh}</button>
    </div>}
    {!pending && (code === "STALE_VERSION" || code === "IDEMPOTENCY_CONFLICT") &&
      <button className={`${institutionLink} justify-self-start`} type="button" onClick={() => window.location.reload()}>{onboarding.refresh}</button>}
    {error !== null && !view && <button type="button" className={`${institutionLink} justify-self-start`} onClick={reload}>{onboarding.retry}</button>}
    {result ? <>
      <p role="status">{result.kind === "created" ? t.created : t.claimResult[result.reviewStatus]}</p>
      <Link className={institutionLink} href={result.kind === "created" ? `/institutions/${result.organizationId}` : "/verification"}>{result.kind === "created" ? t.manage : t.openVerification}</Link>
    </> : !current ? !error && <p role="status">{onboarding.loading}</p>
      : current.draft && !editing ? <>
        <p ref={draftHeading} tabIndex={-1} role="status" className="text-sm">{t.draftSaved}</p>
        <ReviewSetup key={current.version} draft={current.draft} eligible={current.eligible && current.profileComplete}
          disabled={blocked} onComplete={(declaration) => void send({ operation: "complete",
            body: { expectedVersion: current.version, requestId: crypto.randomUUID(), declaration },
          })} />
        <button className={`${institutionLink} justify-self-start`} type="button" disabled={blocked} onClick={() => setEditing(true)}>{t.edit}</button>
      </> : <SetupDraftForm key={current.version} initial={current.draft} claim={claim} subject={subject} disabled={blocked}
        onSave={(draft) => void send({ operation: "details", body: {
          expectedVersion: current.version, requestId: crypto.randomUUID(), draft,
        } })} />}
  </section>;
}

function SetupDraftForm({ initial, claim, subject, disabled, onSave }: {
  initial: OrganizationSetupDraft | null; claim: string; subject: string; disabled: boolean; onSave: (draft: OrganizationSetupDraft) => void;
}) {
  const [locale] = useLocale();
  const t = organizationSetupMessages[locale];
  const institution = institutionMessages[locale];
  const [mode, setMode] = useState(initial?.mode ?? (claim ? "existing" : "new"));
  const [target, setTarget] = useState(initial?.mode === "existing" ? initial.targetHandle : claim);
  const initialNew = initial?.mode === "new" ? initial : null;
  const [country, setCountry] = useState(initialNew?.countryCode ?? "HT");
  const departments = useInstitutionResource(fetchDepartments);
  const searchId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "existing") return onSave({ mode, targetHandle: target.trim().toLowerCase() });
    const fields = new FormData(event.currentTarget);
    const text = (name: string) => String(fields.get(name) ?? "").trim();
    const kind = kinds.find((item) => item === text("kind"));
    const registrationStatus = organizationRegistrationStatuses.find((item) => item === text("registration"));
    const name = text("name");
    const handle = text("handle").toLowerCase();
    const countryCode = text("country").toUpperCase();
    onSave({
      mode, ...(name && { name }), ...(handle && { handle }), ...(kind && { kind }),
      ...(countryCode && { countryCode }), ...(registrationStatus && { registrationStatus }),
      description: text("description") || null, website: text("website") || null,
      departmentCode: countryCode === "HT" ? text("department") || null : null,
    });
  }

  return <>
    <MatchSearch subject={subject} searchId={searchId} initialQuery={target}
      select={(match) => { setMode("existing"); setTarget(match.handle); }} />
    <form className="grid gap-4" onSubmit={submit}>
      <fieldset disabled={disabled} className="grid gap-3">
        <legend className="mb-2 font-semibold">{t.path}</legend>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} />{t.new}</label>
          <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "existing"} onChange={() => setMode("existing")} />{t.existing}</label>
        </div>
        {mode === "new" ? <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">{institution.name}
            <input className={institutionField} name="name" minLength={2} maxLength={120} defaultValue={initialNew?.name} />
          </label>
          <label className="text-sm font-semibold">{institution.handle}
            <input className={institutionField} name="handle" pattern="[A-Za-z0-9][A-Za-z0-9\\-]{2,39}" maxLength={40} defaultValue={initialNew?.handle} />
          </label>
          <label className="text-sm font-semibold">{institution.kind}
            <select className={institutionField} name="kind" defaultValue={initialNew?.kind ?? ""}>
              <option value="">{t.choose}</option>
              {kinds.map((kind) => <option key={kind} value={kind}>{institution[kind]}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">{institution.country}
            <input className={institutionField} name="country" maxLength={2} pattern="[A-Za-z]{2}" value={country}
              onChange={(event) => setCountry(event.target.value.toUpperCase())} />
          </label>
          {country === "HT" && <label className="text-sm font-semibold">{institution.department}
            <select className={institutionField} name="department" defaultValue={initialNew?.departmentCode ?? ""}>
              <option value="">—</option>
              {initialNew?.departmentCode && !departments.data?.some(({ code }) => code === initialNew.departmentCode) &&
                <option value={initialNew.departmentCode}>{initialNew.departmentCode}</option>}
              {departments.data?.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>}
          {country === "HT" && departments.error !== null && <ApiErrorNotice error={departments.error} retry={departments.refresh} />}
          <label className="text-sm font-semibold">{t.registration}
            <select className={institutionField} name="registration" defaultValue={initialNew?.registrationStatus ?? "unknown"}>
              {organizationRegistrationStatuses.map((status) => <option key={status} value={status}>{t.status[status]}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">{institution.website}
            <input className={institutionField} type="url" name="website" maxLength={300} defaultValue={initialNew?.website ?? ""} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">{institution.description}
            <textarea className={institutionField} name="description" maxLength={600} rows={3} defaultValue={initialNew?.description ?? ""} />
          </label>
          <p className="text-sm text-[var(--theme-body)] sm:col-span-2">{t.registrationHelp} {t.protected}</p>
        </div> : <>
          <label className="text-sm font-semibold">{t.existingHandle}
            <input className={institutionField} required pattern="[A-Za-z0-9][A-Za-z0-9\\-]{2,39}" maxLength={40}
              value={target} onChange={(event) => setTarget(event.target.value)} />
          </label>
          <p className="text-sm">{t.existingHelp} <Link href="/institutions" className={institutionLink}>{t.invitations}</Link></p>
        </>}
      </fieldset>
      <button type="submit" className={`${institutionAction} justify-self-start`} disabled={disabled}>{t.saveDraft}</button>
    </form>
  </>;
}

function MatchSearch({ subject, searchId, initialQuery, select }: {
  subject: string; searchId: string; initialQuery: string; select: (match: OrganizationSetupMatch) => void;
}) {
  const [locale] = useLocale();
  const t = organizationSetupMessages[locale];
  const institution = institutionMessages[locale];
  const [matches, setMatches] = useState<OrganizationSetupMatch[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => request.current?.abort(), []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const query = String(new FormData(event.currentTarget).get("query") ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      const result = await authorizedRequest(base + "/matches?q=" + encodeURIComponent(query), { signal: controller.signal }, subject);
      if (!controller.signal.aborted) setMatches(result);
    } catch (cause) {
      if (!controller.signal.aborted) { setMatches(null); setError(cause); }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <div className="grid gap-2 border-b border-[var(--theme-border)] pb-4">
    <form className="flex flex-wrap items-end gap-3" onSubmit={search}>
      <label className="min-w-0 text-sm font-semibold" htmlFor={searchId}>{t.searchLabel}
        <input id={searchId} className={institutionField} name="query" type="search" required minLength={2} maxLength={80} defaultValue={initialQuery} />
      </label>
      <button className={institutionAction} type="submit" disabled={busy}>{t.search}</button>
    </form>
    <p className="text-sm">{t.matchHelp}</p>
    {error !== null && <ApiErrorNotice error={error} />}
    {matches?.length === 0 && <p role="status" className="text-sm">{t.noMatches}</p>}
    {!!matches?.length && <ul className="grid gap-2">
      {matches.map((match) => <li key={match.handle} className="flex flex-wrap items-center gap-x-3 break-words text-sm">
        <Link href={`/organization/${match.handle}`} className={institutionLink}>{match.name}</Link>
        <span>@{match.handle} · {institution[match.kind]} · {institution[match.verificationStatus]}</span>
        {!governmentKinds.includes(match.kind) && match.verificationStatus !== "verified" &&
          <button type="button" className={institutionLink} onClick={() => select(match)}>{t.select}</button>}
      </li>)}
    </ul>}
  </div>;
}

function ReviewSetup({ draft, eligible, disabled, onComplete }: {
  draft: OrganizationSetupDraft; eligible: boolean; disabled: boolean;
  onComplete: (declaration: { authorityConfirmed: true; declarationVersion: 1; evidence?: string[] }) => void;
}) {
  const [locale] = useLocale();
  const t = organizationSetupMessages[locale];
  const institution = institutionMessages[locale];
  const [confirmed, setConfirmed] = useState(false);
  const complete = draft.mode === "existing" || !!(draft.name && draft.handle && draft.countryCode && draft.kind && draft.registrationStatus);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || !complete || !eligible) return;
    const fields = new FormData(event.currentTarget);
    const evidence = fields.getAll("reference").map(String).map((value) => value.trim()).filter(Boolean);
    onComplete({ authorityConfirmed: true, declarationVersion: 1, ...(draft.mode === "existing" && { evidence }) });
  }

  return <div className="grid gap-3">
    {draft.mode === "new" ? <dl className="grid gap-3 sm:grid-cols-2">
      {([[institution.name, draft.name], [institution.handle, draft.handle], [institution.kind, draft.kind && institution[draft.kind]],
        [institution.country, draft.countryCode], [institution.department, draft.departmentCode], [t.registration, draft.registrationStatus && t.status[draft.registrationStatus]],
        [institution.website, draft.website], [institution.description, draft.description]] as const)
        .filter(([, value]) => value).map(([label, value]) => <div key={label} className="break-words">
          <dt className="text-sm font-semibold">{label}</dt><dd>{value}</dd>
        </div>)}
    </dl> : <p>{t.existingHandle} · <Link className={institutionLink} href={`/organization/${draft.targetHandle}`}>@{draft.targetHandle}</Link></p>}
    {!complete && <p>{t.incomplete}</p>}
    {!eligible ? <p>{t.identity} <Link href="/verification?kind=identity" className={institutionLink}>{t.openVerification}</Link></p>
      : complete && <form onSubmit={submit} className="grid max-w-[55rem] gap-3">
        {draft.mode === "existing" && <>
          <p>{t.references}</p>
          {[1, 2, 3].map((index) => <label key={index} className="text-sm font-semibold">
            {t.reference.replace("{number}", String(index))}
            <input name="reference" type="url" className={institutionField} maxLength={300} required={index < 3} disabled={disabled} />
          </label>)}
        </>}
        <label className="flex items-start gap-2">
          <input className="mt-1" type="checkbox" checked={confirmed} required disabled={disabled}
            onChange={(event) => setConfirmed(event.target.checked)} />{t.authority}
        </label>
        <button className={`${institutionAction} justify-self-start`} disabled={disabled || !confirmed}>
          {draft.mode === "new" ? t.complete : t.submitClaim}
        </button>
      </form>}
  </div>;
}
