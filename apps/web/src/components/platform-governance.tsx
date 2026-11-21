"use client";

import { useCallback, useState, type FormEvent } from "react";
import { governanceProposalKinds, type GovernanceProposal, type GovernanceProposalKind, type GovernanceStatus } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { governanceLabel, governanceMessages } from "@/lib/governance-i18n";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { GovernanceConfirmation, GovernanceFeedback, useGovernanceCommand } from "./governance-controls";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

const path = "/api/v1/admin/governance";
const invites = "/api/v1/me/governance-invitations";
const eventLabels: Record<string, string> = {
  propose: "proposeEvent", approve: "approveEvent", accept: "acceptEvent", withdraw: "withdrawEvent",
};

export function PlatformGovernance() {
  const { memberId } = useMemberIdentity();
  return memberId && <GovernanceWorkspace key={memberId} actor={memberId} />;
}

function GovernanceWorkspace({ actor }: { actor: string }) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  const load = useCallback((signal: AbortSignal): Promise<GovernanceStatus> => authorizedRequest(path, { signal }, actor), [actor]);
  const resource = useInstitutionResource(load);
  const data = resource.data;
  return <section className={`${institutionCard} grid gap-4`} aria-label={t.governance}>
    <h2 className="text-xl font-semibold">{t.governance}</h2>
    <p>{t.governanceHelp}</p>
    <GovernanceFeedback error={resource.error} />
    {!data && !resource.error && <p role="status">{authMessages[locale].working}</p>}
    {data && <>
      <p><strong>{t[data.mode]}</strong> · {t.closed}</p>
      <h3 className="font-semibold">{t.administrators}</h3>
      <ul className="grid gap-2">{data.administrators.map((item) => <li key={item.id} className="break-words text-sm">
        {item.username ? "@" + item.username : item.id} · {item.eligible ? t.eligible : t.ineligible}
        {item.founding && " · " + t.founding}
      </li>)}</ul>
      <p className="text-sm">{data.authorities.length ? t.delegatedScope + " · " +
        data.authorities.map((scope) => governanceLabel(t, scope)).join(", ") : t.noAuthority}</p>
      <h3 className="font-semibold">{t.proposals}</h3>
      <ProposalForm actor={actor} version={data.version} reload={resource.refresh} />
      {!data.proposals.length && <p>{t.none}</p>}
      <ul className="grid gap-2">{data.proposals.map((item) =>
        <ProposalRow key={item.id + ":" + item.version} actor={actor} item={item} reload={resource.refresh} />)}</ul>
      <ClaimContainment actor={actor} data={data} reload={resource.refresh} />
      <details>
        <summary className="cursor-pointer font-semibold">{t.audit}</summary>
        <ul className="mt-2 grid gap-2 text-sm">
          {data.events.map((event) => <li key={event.id} className="break-words">
            {governanceLabel(t, eventLabels[event.action] ?? event.action)} · {new Date(event.occurredAt).toLocaleString(locale)} · {event.id}
          </li>)}
        </ul>
      </details>
    </>}
  </section>;
}

function ProposalForm({ actor, version, reload }: { actor: string; version: number; reload: () => void }) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  const [kind, setKind] = useState<GovernanceProposalKind>("appoint");
  const command = useGovernanceCommand(actor);
  const targeted = kind !== "distributed" && kind !== "recovery";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void command.send(path + "/proposals", { kind, expectedVersion: version,
      target: targeted ? String(form.get("target")).trim() : null, reason: String(form.get("reason")).trim() }, reload);
  }

  return <form className="grid max-w-xl gap-3" onSubmit={submit}>
    <label className="text-sm font-semibold">{t.propose}
      <select className={institutionField} value={kind} disabled={command.busy} onChange={(event) => {
        const value = governanceProposalKinds.find((item) => item === event.target.value);
        if (value) setKind(value);
      }}>
        {governanceProposalKinds.map((item) => <option key={item} value={item}>{t[item]}</option>)}
      </select>
    </label>
    {targeted && <label className="text-sm font-semibold">{t.target}
      <input name="target" className={institutionField} required maxLength={36} disabled={command.busy} />
    </label>}
    <GovernanceConfirmation reason disabled={command.busy} />
    <GovernanceFeedback error={command.error} receipt={command.receipt} />
    <button className={`${institutionAction} justify-self-start`} disabled={command.busy}>{t.propose}</button>
  </form>;
}

function ProposalRow({ actor, item, reload, member = false }: {
  actor: string; item: GovernanceProposal; reload: () => void; member?: boolean;
}) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  const command = useGovernanceCommand(actor);
  const action = member ? item.state === "awaiting_acceptance" ? "accept" : null
    : item.own && !["expired", "withdrawn"].includes(item.state) ? "withdraw"
      : item.state === "pending" && !item.targeted ? "approve" : null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const form = new FormData(event.currentTarget);
    void command.send(member ? invites + "/" + item.id + "/accept" : path + "/proposals/" + item.id + "/actions",
      { expectedVersion: item.version, ...(member ? {} : { action, reason: String(form.get("reason")).trim() }),
        ...(action === "approve" && { noConflict: true }) }, reload);
  }
  return <li className="grid gap-2 border-t border-[var(--theme-border)] pt-2">
    <p className="font-semibold">{t[item.kind]} · {t[item.state]}</p>
    {item.target && <p className="break-all text-sm">{t.target} · {item.target}</p>}
    {item.rationale && <p className="break-words text-sm">{item.rationale}</p>}
    <p className="text-sm">{t.expires} · <time dateTime={item.expiresAt}>{new Date(item.expiresAt).toLocaleString(locale)}</time></p>
    <GovernanceFeedback error={command.error} receipt={command.receipt} next={member ? "/settings" : "/admin"} />
    {action && <details>
      <summary className="cursor-pointer">{t[action]}</summary>
      <form className="mt-2 grid max-w-xl gap-2" onSubmit={submit}>
        <GovernanceConfirmation reason={!member} conflict={action === "approve"} disabled={command.busy} />
        <button className={`${institutionAction} justify-self-start`} disabled={command.busy}>{t[action]}</button>
      </form>
    </details>}
  </li>;
}

function ClaimContainment({ actor, data, reload }: { actor: string; data: GovernanceStatus; reload: () => void }) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  const command = useGovernanceCommand(actor);

  function send(event: FormEvent<HTMLFormElement>, existing?: GovernanceStatus["holds"][number]) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = existing?.id ?? String(form.get("claimId")).trim();
    void command.send(path + "/claim-holds/" + encodeURIComponent(id), {
      action: existing ? "release" : "place", expectedVersion: existing?.version ?? 0,
      reason: String(form.get("reason")).trim(), noConflict: true,
      ...(!existing && { reportId: String(form.get("reportId")).trim() }),
    }, reload);
  }
  return <details>
    <summary className="cursor-pointer font-semibold">{t.emergency}</summary>
    <div className="mt-3 grid gap-3">
      <p>{t.emergencyHelp}</p>
      <GovernanceFeedback error={command.error} receipt={command.receipt} />
      <form className="grid max-w-xl gap-3" onSubmit={send}>
        <label className="text-sm font-semibold">{t.claimId}
          <input className={institutionField} name="claimId" required maxLength={36} disabled={command.busy} />
        </label>
        <label className="text-sm font-semibold">{t.reportId}
          <input className={institutionField} name="reportId" required maxLength={36} disabled={command.busy} />
        </label>
        <GovernanceConfirmation reason conflict disabled={command.busy} />
        <button className={`${institutionAction} justify-self-start`} disabled={command.busy}>{t.hold}</button>
      </form>
      {data.holds.map((item) => <div key={item.id} className="grid gap-2 border-t border-[var(--theme-border)] pt-2">
        <p>{t[item.state]} · <time dateTime={item.expiresAt}>{new Date(item.expiresAt).toLocaleString(locale)}</time></p>
        {item.state === "active" && item.canRelease && <form className="grid max-w-xl gap-2" onSubmit={(event) => send(event, item)}>
          <GovernanceConfirmation reason conflict disabled={command.busy} />
          <button className={`${institutionLink} justify-self-start`} disabled={command.busy}>{t.release}</button>
        </form>}
      </div>)}
    </div>
  </details>;
}

export function GovernanceInvitations() {
  const { memberId } = useMemberIdentity();
  return memberId && <OwnInvitations key={memberId} actor={memberId} />;
}

function OwnInvitations({ actor }: { actor: string }) {
  const [locale] = useLocale();
  const t = governanceMessages[locale];
  const load = useCallback((signal: AbortSignal): Promise<{ proposals: GovernanceProposal[] }> =>
    authorizedRequest(invites, { signal }, actor), [actor]);
  const resource = useInstitutionResource(load);
  if (!resource.data?.proposals.length) return null;
  return <section className={`${institutionCard} grid gap-3`} aria-label={t.proposals}>
    <h2 className="text-xl font-semibold">{t.proposals}</h2>
    <p>{t.closed}</p>
    <ul className="grid gap-2">{resource.data.proposals.map((item) =>
      <ProposalRow key={item.id + ":" + item.version} actor={actor} item={item} reload={resource.refresh} member />)}</ul>
  </section>;
}
