"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { affiliationTypes, membershipPolicies, type AffiliationManagement } from "@ayinou/shared";
import { accountMessages } from "@/lib/account-i18n";
import { decideJoinRequest, inviteAffiliate, loadAffiliationManagement, resolveAffiliationInvitation,
  setAffiliationPolicy, updateAffiliation } from "@/lib/affiliation-api";
import { affiliationMessages } from "@/lib/affiliation-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { institutionError, institutionMessages } from "@/lib/institution-i18n";
import { membershipMessages } from "@/lib/membership-i18n";
import { organizationRoleMessages } from "@/lib/organization-role-i18n";
import { useLocale } from "@/lib/locale-store";
import { AffiliationFeedback, AffiliationTypeSelect, useAffiliationAction } from "./affiliation-ui";
import { institutionAction, institutionCard, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";

export function AffiliationManagementScreen({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = affiliationMessages[locale];
  const system = institutionMessages[locale];
  const auth = authMessages[locale];
  const loader = useCallback((signal: AbortSignal) => loadAffiliationManagement(id, signal), [id]);
  const resource = useInstitutionResource(loader);
  const action = useAffiliationAction(resource.refresh);
  const data = resource.data;
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  function policy(event: FormEvent<HTMLFormElement>, current: AffiliationManagement) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const membershipPolicy = membershipPolicies.find((option) => option === fields.get("policy")) ?? current.membershipPolicy;
    const directoryEnabled = fields.get("directory") === "on";
    void action.run(() => setAffiliationPolicy(id, membershipPolicy, directoryEnabled));
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const username = String(fields.get("username") ?? "").trim();
    const type = affiliationTypes.find((option) => option === fields.get("type"));
    if (type) void action.run(async () => { await inviteAffiliate(id, username, type); form.reset(); });
  }

  return (
    <MemberShell>
      <div className="grid gap-5">
        <header>
          <Link className={institutionLink} href={`/institutions/${id}/roles`}>{organizationRoleMessages[locale].title}</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t.management}</h1>
          <p className="mt-2 max-w-3xl text-[var(--theme-body)]">{t.authorityNote}</p>
        </header>
        {resource.error ? <div className={institutionCard}>
          <p role="alert" className={institutionErrorBox}>{institutionError(system, resource.error)}</p>
          <button type="button" className={`${institutionLink} mt-2`} onClick={resource.refresh}>{auth.retry}</button>
        </div> : !data ? <p role="status">{auth.working}</p> : (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
            <div className="grid min-w-0 gap-4">
              {data.canReviewRequests && <section className={institutionCard}>
                <h2 className="text-xl font-semibold">{t.requests}</h2>
                {data.requests.length ? <ul className="mt-3 divide-y divide-[var(--theme-border)]">
                  {data.requests.map((request) => <RequestRow key={request.id} id={id} request={request}
                    approvalAllowed={data.membershipPolicy !== "invitation_only"} refresh={resource.refresh} />)}
                </ul> : <p className="mt-2 text-sm text-[var(--theme-body)]">{t.requestEmpty}</p>}
              </section>}
              {data.canManageMembers && <section className={institutionCard}>
                <h2 className="text-xl font-semibold">{t.roster}</h2>
                {data.members.length ? <ul className="mt-3 divide-y divide-[var(--theme-border)]">
                  {data.members.map((member) => <MemberRow key={member.id} id={id} member={member} refresh={resource.refresh} allowStaff={data.canInviteStaff} />)}
                </ul> : <p className="mt-2 text-sm text-[var(--theme-body)]">{t.rosterEmpty}</p>}
              </section>}
            </div>
            <div className="grid min-w-0 gap-4">
              <section className={institutionCard}>
                <h2 className="text-xl font-semibold">{t.policy}</h2>
                {data.policyLocked && <p className="mt-2 text-sm text-[var(--theme-body)]">{t.locked}</p>}
                {data.canSetPolicy ? (
                  <form key={`${data.membershipPolicy}:${data.directoryEnabled}`} onSubmit={(event) => policy(event, data)} className="mt-4 grid gap-3" aria-busy={action.busy}>
                    <label className="text-sm font-semibold">{t.policy}
                      <select className={institutionField} name="policy" defaultValue={data.membershipPolicy} disabled={data.policyLocked || action.busy}>
                        {membershipPolicies.map((option) => <option key={option} value={option}>{t[option]}</option>)}
                      </select>
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="directory" className="mt-0.5" defaultChecked={data.directoryEnabled} disabled={action.busy} />
                      {t.directoryEnable}
                    </label>
                    <button type="submit" className={institutionAction} disabled={action.busy}>{t.savePolicy}</button>
                  </form>
                ) : <p className="mt-2 text-sm font-semibold">{t[data.membershipPolicy]}</p>}
              </section>
              {data.canInvite && <section className={institutionCard}>
                <h2 className="text-xl font-semibold">{t.invite}</h2>
                <p className="mt-2 text-sm text-[var(--theme-body)]">{t.inviteHelp}</p>
                <form className="mt-4 grid gap-3" onSubmit={invite} aria-busy={action.busy}>
                  <label className="text-sm font-semibold">{membershipMessages[locale].username}
                    <input className={institutionField} name="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={24} disabled={action.busy} />
                  </label>
                  <AffiliationTypeSelect name="type" disabled={action.busy} allowStaff={data.canInviteStaff} />
                  <button type="submit" className={institutionAction} disabled={action.busy}>{t.invite}</button>
                </form>
                <h3 className="mt-5 border-t border-[var(--theme-border)] pt-4 font-semibold">{t.invitations}</h3>
                {data.invitations.length ? <ul className="divide-y divide-[var(--theme-border)]">
                  {data.invitations.map((item) => <li key={item.id} className="grid gap-1 py-3 text-sm">
                    <p className="break-words">{item.username ? `@${item.username}` : t.unknownMember} · {t[item.affiliationType]}</p>
                    <p className="text-[var(--theme-body)]">{system.expires} {format.format(new Date(item.expiresAt))}</p>
                    <button type="button" className={`${institutionLink} justify-self-start`} disabled={action.busy}
                      onClick={() => { void action.run(() => resolveAffiliationInvitation(item.id, "revoke")); }}>{system.cancelInvite}</button>
                  </li>)}
                </ul> : <p className="mt-2 text-sm text-[var(--theme-body)]">{system.noInvitations}</p>}
              </section>}
              <AffiliationFeedback failure={action.failure} saved={action.saved} />
            </div>
          </div>
        )}
      </div>
    </MemberShell>
  );
}

function RequestRow({ id, request, approvalAllowed, refresh }: {
  id: string; request: AffiliationManagement["requests"][number]; approvalAllowed: boolean; refresh: () => void;
}) {
  const [locale] = useLocale();
  const t = affiliationMessages[locale];
  const action = useAffiliationAction(refresh);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <li className="space-y-2 py-3">
      <p className="break-words font-semibold">{request.displayName ?? request.username ?? t.unknownMember} · {t[request.affiliationType]}</p>
      {request.message && <p className="whitespace-pre-line break-words text-sm text-[var(--theme-body)]">{request.message}</p>}
      {request.isSelf ? <p className="text-sm text-[var(--theme-body)]">{t.manageSelf}</p> : rejecting ? (
        <form className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim()) void action.run(() => decideJoinRequest(id, request.id, "reject", reason.trim()));
        }}>
          <label className="block text-sm font-semibold">{t.reason}
            <textarea className={institutionField} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required disabled={action.busy} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={institutionAction} disabled={action.busy || !reason.trim()}>{t.reject}</button>
            <button type="button" className={institutionLink} disabled={action.busy} onClick={() => setRejecting(false)}>{accountMessages[locale].cancel}</button>
          </div>
        </form>
      ) : <div className="flex flex-wrap gap-3">
        {approvalAllowed && <button type="button" className={institutionAction} disabled={action.busy}
          onClick={() => { void action.run(() => decideJoinRequest(id, request.id, "approve")); }}>{t.approve}</button>}
        <button type="button" className={institutionLink} disabled={action.busy} onClick={() => setRejecting(true)}>{t.reject}</button>
      </div>}
      <AffiliationFeedback failure={action.failure} saved={action.saved} />
    </li>
  );
}

function MemberRow({ id, member, refresh, allowStaff }: {
  id: string; member: AffiliationManagement["members"][number]; refresh: () => void; allowStaff: boolean;
}) {
  const [locale] = useLocale();
  const t = affiliationMessages[locale];
  const action = useAffiliationAction(refresh);
  const [removing, setRemoving] = useState(false);

  return (
    <li className="space-y-2 py-3">
      <p className="break-words font-semibold">{member.displayName ?? member.username ?? t.unknownMember}</p>
      <p className="text-sm text-[var(--theme-body)]">{t[member.affiliationType]} · {t[member.status]}{member.admission && ` · ${t[member.admission]}`}</p>
      {member.canManage && <>
        <div className="flex flex-wrap gap-3">
          {member.status === "active" && <button type="button" className={institutionLink} disabled={action.busy}
            onClick={() => { void action.run(() => updateAffiliation(id, member.id, "suspend")); }}>{t.suspend}</button>}
          {member.status === "suspended" && <button type="button" className={institutionLink} disabled={action.busy}
            onClick={() => { void action.run(() => updateAffiliation(id, member.id, "reinstate")); }}>{t.reinstate}</button>}
          {removing ? <>
            <button type="button" className={institutionAction} disabled={action.busy}
              onClick={() => { void action.run(() => updateAffiliation(id, member.id, "remove")); }}>{t.remove}</button>
            <button type="button" className={institutionLink} disabled={action.busy} onClick={() => setRemoving(false)}>{accountMessages[locale].cancel}</button>
          </> : <button type="button" className={institutionLink} disabled={action.busy} onClick={() => setRemoving(true)}>{t.remove}</button>}
        </div>
        {member.status === "active" && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("type");
          const type = affiliationTypes.find((option) => option === value);
          if (type && type !== member.affiliationType) void action.run(() => updateAffiliation(id, member.id, "change_type", type));
        }}>
          <AffiliationTypeSelect name="type" key={member.affiliationType} defaultValue={member.affiliationType} disabled={action.busy} allowStaff={allowStaff} />
          <button type="submit" className={institutionLink} disabled={action.busy}>{t.change_type}</button>
        </form>}
      </>}
      <AffiliationFeedback failure={action.failure} saved={action.saved} />
    </li>
  );
}
