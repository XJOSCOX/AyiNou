"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { earlyPartnerFeedbackCategories, type EarlyPartnerEnrollment, type EarlyPartnerProgram, type EarlyPartnerWorkspace } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { earlyPartnerLabel, earlyPartnerMessages } from "@/lib/early-partner-i18n";
import { governanceMessages } from "@/lib/governance-i18n";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { ApiErrorNotice } from "./api-error-notice";
import { GovernanceConfirmation, useGovernanceCommand } from "./governance-controls";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { adminActionPanel, adminDangerAction, adminDisclosure } from "./admin-controls";

export function AdminEarlyPartners() {
  const { memberId } = useMemberIdentity();
  return memberId && <PartnerWorkspace key={memberId} actor={memberId} />;
}

export function OrganizationEarlyPartners({ organizationId }: { organizationId: string }) {
  const { memberId } = useMemberIdentity();
  const [locale] = useLocale();
  const [open, setOpen] = useState(false);
  return <details className={institutionCard} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">{earlyPartnerMessages[locale].title}</summary>
    {open && memberId && <PartnerWorkspace key={organizationId + memberId} actor={memberId} org={organizationId} />}
  </details>;
}

function PartnerWorkspace({ actor, org }: { actor: string; org?: string }) {
  const [locale] = useLocale();
  const t = earlyPartnerMessages[locale];
  const security = governanceMessages[locale];
  const [programId, setProgramId] = useState("");
  const path = org ? `/api/v1/institutions/${org}/early-partner` : "/api/v1/admin/early-partners";
  const load = useCallback((signal: AbortSignal): Promise<EarlyPartnerWorkspace> =>
    authorizedRequest(path + (programId ? "?programId=" + programId : ""), { signal }, actor), [actor, path, programId]);
  const resource = useInstitutionResource(load);
  const data = resource.data;
  const program = data?.programs.find((item) => item.id === programId);
  const command = useGovernanceCommand(actor);
  const fault = command.error ?? resource.error;
  const code = apiErrorCode(fault);
  const mfaReturn = org ? `/institutions/${org}` : "/admin";
  const date = (value: string) => new Date(value).toLocaleString(locale);
  const send = (input: object) => void command.send(path, input, resource.refresh);

  return <section className={`${org ? "mt-4" : institutionCard} grid min-w-0 gap-4`} aria-label={t.title}>
    {!org && <h2 className="text-xl font-semibold">{t.title}</h2>}
    <p className="max-w-prose">{t.summary}</p>
    <p role="status" className="text-sm">{t.closed}</p>
    {fault != null && <>
      {code === "EARLY_PARTNER_CLOSED" || code === "EARLY_PARTNER_INELIGIBLE" || code === "EARLY_PARTNER_FULL" ||
        (!org && code === "FORBIDDEN") ? <p role="alert">{code === "EARLY_PARTNER_CLOSED" ? t.closed
          : code === "EARLY_PARTNER_INELIGIBLE" ? t.ineligible : code === "EARLY_PARTNER_FULL" ? t.full : t.restricted}</p>
        : <ApiErrorNotice error={fault} retry={resource.refresh} signIn />}
      {code === "MFA_REQUIRED" && <Link href={`/mfa?next=${mfaReturn}`} className={institutionLink}>{security.mfa}</Link>}
    </>}
    {command.receipt && <p role="status" className="break-all text-sm">{security.receipt} · {command.receipt}</p>}
    {!data && fault == null && <p role="status">{authMessages[locale].working}</p>}
    {data?.role && <p className="text-sm">{t[data.role]}</p>}
    {data && !data.programs.length && <p>{t.none}</p>}
    {!org && data && data.programs.length > 0 && <label className="grid max-w-lg gap-2 font-semibold">
      {t.program}
      <select className={institutionField} value={programId} onChange={(event) => setProgramId(event.target.value)}>
        <option value="">—</option>
        {data.programs.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.version}</option>)}
      </select>
    </label>}
    {!org && program && <ProgramFacts program={program} />}
    {!org && program?.syntheticOpen && program.nominate && <details className="grid gap-2">
      <summary className="cursor-pointer font-semibold">{t.nominate}</summary>
      <form className={`${adminActionPanel} mt-3 max-w-2xl`} onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        send({ action: "nominate", programId: program.id, organizationId: values.get("organization"),
          expectedVersion: program.version, reason: values.get("reason") });
      }}>
        <label className="grid gap-1 font-semibold">{t.organization}
          <input name="organization" className={institutionField} required maxLength={36} disabled={command.busy} />
        </label>
        <GovernanceConfirmation reason disabled={command.busy} />
        <button className={`${institutionAction} justify-self-start`} disabled={command.busy}>{t.nominate}</button>
      </form>
    </details>}
    {data?.enrollments.map((enrollment) => {
      const details = data.programs.find((item) => item.id === enrollment.programId);
      return details && <EnrollmentCard key={enrollment.id + ":" + enrollment.revision} entry={enrollment} program={details}
        member={!!org} owner={data.role === "owner"} busy={command.busy} send={send} />;
    })}
    {!!data?.feedback.length && <section className="grid gap-3">
      <h3 className="font-semibold">{t.feedback}</h3>
      {data.feedback.map((item) => <article key={item.id + ":" + item.revision}
        className="grid gap-2 rounded-md border border-[var(--theme-border)] p-3 [overflow-wrap:anywhere]">
        <h4 className="font-semibold">{t[item.feature]} · {t[item.category]} · {t[item.state]}</h4>
        <p>{item.description}</p>
        {item.steps && <p className="text-sm">{t.steps} · {item.steps}</p>}
        {item.resolution && <p className="text-sm">{t.resolution} · {item.resolution}</p>}
        {!org && program?.review && item.state === "open" && <DecisionForm action="resolve" busy={command.busy}
          admin send={(reason) => send({ action: "resolve", enrollmentId: item.enrollment_id, feedbackId: item.id,
            expectedVersion: item.revision, reason })} />}
      </article>)}
    </section>}
    {!!data?.events.length && <details>
      <summary className="cursor-pointer font-semibold">{t.activity}</summary>
      <ul className="mt-2 grid gap-2 text-sm">{data.events.map((event) => <li key={event.id} className="break-all">
        {earlyPartnerLabel(t, event.action)} · {date(event.at)} · {event.id}
      </li>)}</ul>
    </details>}
  </section>;
}

function ProgramFacts({ program }: { program: EarlyPartnerProgram }) {
  const [locale] = useLocale();
  const t = earlyPartnerMessages[locale];
  const names = institutionMessages[locale];
  const date = (value: string) => new Date(value).toLocaleString(locale);
  return <div className="grid gap-2 [overflow-wrap:anywhere]">
    <h3 className="font-semibold">{program.title}{program.syntheticOpen && " · " + t.synthetic}</h3>
    <p>{program.purpose}</p>
    <p className="text-sm">{t.ends} · {date(program.startsAt)} – {date(program.endsAt)}</p>
    <p className="text-sm">{t.terms} · {program.termsVersion}</p>
    {program.capacity != null && <p className="text-sm">{t.capacity} · {program.reserved} / {program.capacity}</p>}
    {!!program.eligibleKinds?.length && <p className="text-sm">
      {program.eligibleKinds.map((kind) => Object.hasOwn(names, kind) ? names[kind as keyof typeof names] : kind).join(", ")}
    </p>}
    <div className="grid gap-1 text-sm">
      <p className="font-semibold">{t.features}</p>
      <ul className="list-disc ps-5">{program.features.map((feature) => <li key={feature}>
        {t[feature]}{(feature !== "pilot_feedback" || !program.syntheticOpen) && " · " + t.unavailable}
      </li>)}</ul>
    </div>
  </div>;
}

function EnrollmentCard({ entry, program, member, owner, busy, send }: {
  entry: EarlyPartnerEnrollment; program: EarlyPartnerProgram; member: boolean; owner: boolean;
  busy: boolean; send: (input: object) => void;
}) {
  const [locale] = useLocale();
  const t = earlyPartnerMessages[locale];
  const actions = member ? owner ? memberActions(entry, program) : [] : adminActions(entry, program);
  const run = (action: string, fields: object = {}) => send({ enrollmentId: entry.id, expectedVersion: entry.revision, action, ...fields });
  return <article className="grid min-w-0 gap-3 rounded-md border border-[var(--theme-border)] p-3">
    {member && <ProgramFacts program={program} />}
    <h3 className="font-semibold">{t[entry.state]} · {entry.eligible ? t.eligible : t.ineligible}</h3>
    {!member && <p className="break-all text-sm">{t.organization} · {entry.organizationId}</p>}
    {entry.offerUntil && <p className="text-sm">{t.deadline} · {new Date(entry.offerUntil).toLocaleString(locale)}</p>}
    {entry.state === "offered" && !entry.sameOwner && <p className="text-sm">{t.ownerChanged}</p>}
    {member && <p className="text-sm">{t.visibility}</p>}
    {actions.map((action) => <DecisionForm key={action} action={action} admin={!member} busy={busy}
      send={(reason) => run(action, { ...(!member && { reason }),
        ...(action === "accept" && { termsVersion: program.termsVersion, termsDigest: program.termsDigest }) })} />)}
    {entry.canFeedback && <FeedbackForm program={program} busy={busy} send={(fields) => run("feedback", fields)} />}
  </article>;
}

type Decision = "offer" | "reject_nomination" | "accept" | "decline" | "withdraw" | "suspend" | "end" | "expire" |
  "revoke_feedback" | "resolve" | "opt_in" | "opt_out";

function memberActions(entry: EarlyPartnerEnrollment, program: EarlyPartnerProgram): Decision[] {
  switch (entry.state) {
    case "offered": return [...(program.syntheticOpen && entry.canAccept && entry.eligible ? ["accept"] as const : []), "decline", "withdraw"];
    case "active": return [...(entry.optedIn ? ["opt_out"] as const :
      program.syntheticOpen && entry.eligible && entry.sameOwner ? ["opt_in"] as const : []), "withdraw"];
    case "suspended": return ["withdraw"];
    default: return [];
  }
}

function adminActions(entry: EarlyPartnerEnrollment, program: EarlyPartnerProgram): Decision[] {
  if (!program.review) return [];
  switch (entry.state) {
    case "nominated": return [...(entry.canOffer && program.syntheticOpen && entry.eligible ? ["offer"] as const : []),
      ...(entry.canOffer ? ["reject_nomination"] as const : []), "end"];
    case "offered": return ["suspend", "end"];
    case "active": return ["suspend", ...(entry.canRevokeFeedback ? ["revoke_feedback"] as const : []), "end"];
    case "suspended": return ["end"];
    case "expired": return entry.canRecordExpiry ? ["expire"] : [];
    case "ended": return entry.canRecordEnd ? ["end"] : [];
    default: return [];
  }
}

function DecisionForm({ action, admin, busy, send }: { action: Decision; admin?: boolean; busy: boolean; send: (reason: string) => void }) {
  const [locale] = useLocale();
  const t = earlyPartnerMessages[locale];
  return <details className={admin ? "max-w-2xl rounded-lg border border-[var(--theme-border)]" : undefined}>
    <summary className={admin ? adminDisclosure : "cursor-pointer font-semibold"}>{t[action]}</summary>
    <form className={admin ? `${adminActionPanel} m-2` : "mt-2 grid max-w-lg gap-2"} onSubmit={(event) => {
      event.preventDefault();
      send(String(new FormData(event.currentTarget).get("reason") ?? ""));
    }}>
      {action === "accept" && <p className="text-sm">{t.acceptHelp}</p>}
      {action === "resolve" && <>
        <p className="text-sm">{t.resolutionHelp}</p>
        <label className="grid gap-1 font-semibold">{t.resolution}
          <input name="reason" className={institutionField} required minLength={10} maxLength={500} disabled={busy} />
        </label>
      </>}
      <GovernanceConfirmation reason={admin && action !== "resolve"} disabled={busy} />
      <button className={`${admin && (action === "suspend" || action === "end" || action === "revoke_feedback") ? adminDangerAction : institutionAction} justify-self-start`} disabled={busy}>{t[action]}</button>
    </form>
  </details>;
}

function FeedbackForm({ program, busy, send }: { program: EarlyPartnerProgram; busy: boolean; send: (fields: object) => void }) {
  const [locale] = useLocale();
  const t = earlyPartnerMessages[locale];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    send({ feature: values.get("feature"), category: values.get("category"), description: values.get("description"),
      steps: String(values.get("steps")).trim() || undefined });
  }
  return <details>
    <summary className="cursor-pointer font-semibold">{t.feedback}</summary>
    <form className="mt-3 grid max-w-lg gap-3" onSubmit={submit}>
      <p className="text-sm">{t.feedbackHelp}</p>
      <label className="grid gap-1 font-semibold">{t.feature}<select name="feature" className={institutionField} disabled={busy}>
        {program.features.map((feature) => <option key={feature} value={feature}>{t[feature]}</option>)}
      </select></label>
      <label className="grid gap-1 font-semibold">{t.category}<select name="category" className={institutionField} disabled={busy}>
        {earlyPartnerFeedbackCategories.map((category) => <option key={category} value={category}>{t[category]}</option>)}
      </select></label>
      <label className="grid gap-1 font-semibold">{t.description}
        <input name="description" className={institutionField} required minLength={10} maxLength={500} disabled={busy} />
      </label>
      <label className="grid gap-1 font-semibold">{t.steps}
        <input name="steps" className={institutionField} minLength={3} maxLength={500} disabled={busy} />
      </label>
      <GovernanceConfirmation disabled={busy} />
      <button className={`${institutionAction} justify-self-start`} disabled={busy}>{t.feedback}</button>
    </form>
  </details>;
}
