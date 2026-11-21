"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { organizationRegistrationStatuses, type CorrectionPreview, type CorrectionQueue, type OnboardingCorrection,
  type OrganizationOnboardingIntent, type OrganizationSetupView } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { governanceLabel, governanceMessages } from "@/lib/governance-i18n";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { organizationOnboardingMessages } from "@/lib/organization-onboarding-i18n";
import { organizationSetupMessages, organizationSetupPath } from "@/lib/organization-setup";
import { GovernanceConfirmation, GovernanceFeedback, useGovernanceCommand } from "./governance-controls";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

const memberPath = "/api/v1/me/onboarding-corrections";
const adminPath = "/api/v1/admin/organization-onboarding";

export function MemberOnboardingCorrections({ subject, intent, refreshSetup }: {
  subject: string; intent: OrganizationOnboardingIntent | null; refreshSetup: () => void;
}) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  const load = useCallback((signal: AbortSignal): Promise<CorrectionQueue> => authorizedRequest(memberPath, { signal }, subject), [subject]);
  const queue = useInstitutionResource(load);
  const command = useGovernanceCommand(subject);
  const hasActive = queue.data?.cases.some((item) => ["requested", "assigned"].includes(item.state) && item.intentId === (intent?.id ?? queue.data?.claimIntent?.id));
  return <section className={`${institutionCard} grid gap-3`} aria-label={t.corrections}>
    <h2 className="text-xl font-semibold">{t.corrections}</h2>
    <p>{t.memberHelp}</p>
    <GovernanceFeedback error={command.error ?? queue.error} receipt={command.receipt} next="/settings" />
    {queue.data?.holdUntil && <p role="status">{t.holdNotice.replace("{date}", new Date(queue.data.holdUntil).toLocaleString(locale))}</p>}
    {queue.data && !hasActive && (intent || queue.data.claimIntent) &&
      <CorrectionRequestForm key={intent?.id + ":" + intent?.version} subject={subject} intent={intent}
        claim={queue.data.claimIntent} command={command} refresh={queue.refresh} />}
    {queue.data?.cases.map((item) => <article key={item.id} className="grid gap-2 border-t border-[var(--theme-border)] pt-3">
      <CorrectionSummary item={item} />
      {["requested", "assigned"].includes(item.state) && <form className="grid gap-2" onSubmit={(event) => {
        event.preventDefault();
        void command.send(memberPath + "/" + item.id + "/withdraw", { expectedVersion: item.version }, queue.refresh);
      }}>
        <GovernanceConfirmation disabled={command.busy} />
        <button className={`${institutionLink} justify-self-start`} disabled={command.busy}>{t.withdraw}</button>
      </form>}
      {item.state === "applied" && item.intentId === intent?.id && item.intentVersion >= intent.version &&
        <button type="button" className={`${institutionLink} justify-self-start`} onClick={refreshSetup}>{organizationOnboardingMessages[locale].refresh}</button>}
    </article>)}
    {queue.data?.cases.length === 0 && !intent && !queue.data.claimIntent && <p>{t.none}</p>}
  </section>;
}

function CorrectionRequestForm({ subject, intent, claim, command, refresh }: {
  subject: string; intent: OrganizationOnboardingIntent | null; claim: CorrectionQueue["claimIntent"];
  command: ReturnType<typeof useGovernanceCommand>; refresh: () => void;
}) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  const r = organizationSetupMessages[locale];
  const [kind, setKind] = useState<OnboardingCorrection["kind"]>(intent ? "cancel" : "claim_triage");
  const load = useCallback((signal: AbortSignal): Promise<OrganizationSetupView | null> =>
    kind === "details" || kind === "registration" ? authorizedRequest(organizationSetupPath + "/setup", { signal }, subject) : Promise.resolve(null),
  [kind, subject]);
  const draft = useInstitutionResource(load);
  const saved = draft.data?.intentId === intent?.id && draft.data?.version === intent?.version && draft.data?.draft?.mode === "new"
    ? draft.data.draft : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = kind === "claim_triage" ? claim : intent;
    if (!target) return;
    const form = new FormData(event.currentTarget);
    const body = { intentId: target.id, expectedVersion: target.version, kind };
    if (kind === "details" && saved) {
      void command.send(memberPath, { ...body, change: { ...saved, name: String(form.get("name")).trim() } }, refresh);
    } else if (kind === "registration" && saved) {
      void command.send(memberPath, { ...body, change: form.get("registration") }, refresh);
    } else if (kind !== "details" && kind !== "registration") {
      void command.send(memberPath, body, refresh);
    }
  }

  const options: OnboardingCorrection["kind"][] = [
    ...(intent ? ["cancel", "restart", "registration", "details"] as const : []),
    ...(claim ? ["claim_triage"] as const : []),
  ];
  return <form className="grid max-w-xl gap-3" onSubmit={submit}>
    <label className="text-sm font-semibold">{t.request}
      <select className={institutionField} value={kind} disabled={command.busy} onChange={(event) => {
        const selected = options.find((item) => item === event.target.value);
        if (selected) setKind(selected);
      }}>
        {options.map((item) => <option key={item} value={item}>{t[item]}</option>)}
      </select>
    </label>
    {kind === "registration" && saved && <label className="text-sm font-semibold">{r.registration}
      <select className={institutionField} name="registration" defaultValue={saved.registrationStatus ?? "unknown"}>
        {organizationRegistrationStatuses.map((item) => <option key={item} value={item}>{r.status[item]}</option>)}
      </select>
    </label>}
    {kind === "details" && saved && <label className="text-sm font-semibold">{t.details}
      <input name="name" className={institutionField} defaultValue={saved.name} required minLength={2} maxLength={120} />
    </label>}
    <GovernanceFeedback error={draft.error} />
    <GovernanceConfirmation disabled={command.busy} />
    <button className={`${institutionAction} justify-self-start`} disabled={command.busy ||
      ((kind === "details" || kind === "registration") && !saved)}>{t.request}</button>
  </form>;
}

function CorrectionSummary({ item }: { item: OnboardingCorrection }) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  return <>
    <p className="font-semibold">{t[item.kind]} · {t[item.state]}</p>
    {item.blockers.length > 0 && <>
      <ul className="list-disc ps-5">{item.blockers.map((code) => <li key={code}>{governanceLabel(t, code)}</li>)}</ul>
      <p>{t.protectedHelp}</p>
    </>}
    {item.receiptId && <p className="break-all text-sm">{t.receipt} · {item.receiptId}</p>}
  </>;
}

export function AdminOnboardingCorrections() {
  const { memberId } = useMemberIdentity();
  return memberId && <AdminCorrectionQueue key={memberId} actor={memberId} />;
}

function AdminCorrectionQueue({ actor }: { actor: string }) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  const [id, setId] = useState<string | null>(null);
  const load = useCallback((signal: AbortSignal): Promise<CorrectionQueue> =>
    authorizedRequest(adminPath + "/corrections", { signal }, actor), [actor]);
  const queue = useInstitutionResource(load);
  return <section className={`${institutionCard} grid gap-4`} aria-label={t.corrections}>
    <h2 className="text-xl font-semibold">{t.corrections}</h2>
    <p>{t.queueHelp}</p>
    <GovernanceFeedback error={queue.error} />
    {!queue.data && !queue.error && <p role="status">{authMessages[locale].working}</p>}
    {queue.data?.cases.length === 0 && <p>{t.none}</p>}
    {queue.data?.cases.map((item) => <article key={item.id} className="grid gap-2 border-t border-[var(--theme-border)] pt-3">
      <CorrectionSummary item={item} />
      <button type="button" className={`${institutionLink} justify-self-start`}
        onClick={() => setId(id === item.id ? null : item.id)} aria-expanded={id === item.id}>{t.preview}</button>
      {id === item.id && <AdminCorrectionDetail actor={actor} id={id} updateQueue={queue.refresh} />}
    </article>)}
  </section>;
}

function AdminCorrectionDetail({ actor, id, updateQueue }: { actor: string; id: string; updateQueue: () => void }) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  const load = useCallback((signal: AbortSignal): Promise<CorrectionPreview> =>
    authorizedRequest(adminPath + "/" + id + "/correction-preview", { signal }, actor), [actor, id]);
  const preview = useInstitutionResource(load);
  const command = useGovernanceCommand(actor);
  const item = preview.data;
  const action = item?.canAssign ? "assign" : item?.canApply ? "apply" : null;
  const blockers = item && [...new Set([...item.blockers, ...item.triage])];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !action) return;
    const form = new FormData(event.currentTarget);
    void command.send(adminPath + "/" + id + "/corrections", {
      action, expectedVersion: item.version, reason: String(form.get("reason")).trim(),
    }, () => { preview.refresh(); updateQueue(); });
  }

  return <div className="grid gap-3 rounded-md border border-[var(--theme-border)] p-4">
    <GovernanceFeedback error={preview.error ?? command.error} receipt={command.receipt} />
    {item && <>
      {!!blockers?.length && <>
        <ul className="list-disc ps-5">{blockers.map((code) => <li key={code}>{governanceLabel(t, code)}</li>)}</ul>
        <p>{t.protectedHelp}</p>
        <Link href="/verification/review" className={institutionLink}>{t.viewReview}</Link>
      </>}
      {item.currentIntentVersion !== item.intentVersion && <p>{t.stale}</p>}
      {action && <form key={item.version} className="grid max-w-xl gap-3" onSubmit={submit}>
        <GovernanceConfirmation reason disabled={command.busy} />
        <button className={`${institutionAction} justify-self-start`} disabled={command.busy}>{t[action]}</button>
      </form>}
    </>}
  </div>;
}
