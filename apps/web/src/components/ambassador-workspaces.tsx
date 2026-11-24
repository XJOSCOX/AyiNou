"use client";

import Link from "next/link";
import { useCallback, useId, useState, type FormEvent, type ReactNode } from "react";
import { ambassadorCategories, type AmbassadorAdminAction, type AmbassadorAdminCase, type AmbassadorMemberCase } from "@ayinou/shared";
import { changeAmbassadorCase, decideAmbassador, loadAmbassadorAdmin, loadMyAmbassadorCases, proposeAmbassador } from "@/lib/ambassador-api";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { apiErrorCode } from "@/lib/api-errors";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { useAdminRenewalPath } from "./admin-section-context";
import { ApiErrorNotice } from "./api-error-notice";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { institutionAction, institutionCard, institutionField, institutionLink, PersonalClaimChecks, useInstitutionResource } from "./institution-ui";
import { AdminMemberBadges } from "./admin-account-avatar";
import { adminActionPanel, adminCompactCard, adminConfirmation, adminDangerAction, adminDisclosure, adminSecondaryAction } from "./admin-controls";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

const value = (form: FormData, field: string) => String(form.get(field) ?? "").trim();
const handlePattern = "[a-z0-9][a-z0-9_]{2,23}";

function AmbassadorFeedback({ error, reload, admin = false }: { error: unknown; reload?: () => void; admin?: boolean }) {
  const [locale] = useLocale();
  const renewalPath = useAdminRenewalPath();
  if (error === null) return null;
  return <div className="grid gap-2">
    <ApiErrorNotice error={error} retry={reload} signIn />
    {admin && apiErrorCode(error) === "MFA_REQUIRED" && <Link href={renewalPath} className={institutionLink}>
      {ambassadorMessages[locale].verifySession}
    </Link>}
  </div>;
}

export function MyAmbassadorWorkspace() {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  const resource = useInstitutionResource(loadMyAmbassadorCases);
  return <MemberShell>
    <section className="grid gap-4">
      <PageHeader title={t.myProgram} description={t.responsibilities}
        actions={<Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2" href="/ambassadors">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
          {t.directory}
        </Link>} />
      <AmbassadorFeedback error={resource.error} reload={resource.refresh} />
      {!resource.data && resource.error === null && <p role="status" className={institutionCard}>{authMessages[locale].working}</p>}
      {resource.data?.cases.length === 0 && <section aria-labelledby="ambassador-participation-empty" className={institutionCard + " grid gap-2"}>
        <h2 id="ambassador-participation-empty" className="text-lg font-semibold">{t.emptyMineTitle}</h2>
        <p className="max-w-prose text-sm leading-relaxed text-[var(--theme-body)]">{t.emptyMine}</p>
      </section>}
      {resource.data?.cases.map((item) => <MemberCase key={item.id} item={item} refresh={resource.refresh} />)}
    </section>
  </MemberShell>;
}

function MemberCase({ item, refresh }: { item: AmbassadorMemberCase; refresh(): void }) {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  const mutation = useFeedMutation();
  const [statement, setStatement] = useState(item.statement ?? "");
  const [reason, setReason] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  const [saved, setSaved] = useState(false);
  function run(input: Parameters<typeof changeAmbassadorCase>[1]) {
    setSaved(false);
    void mutation.run(async () => {
      await changeAmbassadorCase(item, input);
      if (input.action === "publish" && !input.publish) setStatement("");
      setSaved(true);
      setWithdraw(false);
      refresh();
    });
  }
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const invitedAt = item.invitedAt ?? (item.status === "invited" ? item.updatedAt : null);
  const dates = [
    { label: t.sentOn, value: invitedAt },
    { label: item.status === "expired" ? t.expiredOn : t.respondBy, value: item.expiresAt },
    { label: t.acceptedOn, value: item.acceptedAt },
  ];
  return <details className="group min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 rounded-xl px-5 py-4 hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-6 [&::-webkit-details-marker]:hidden">
      <span className="grid min-w-0 flex-1 basis-44 gap-1">
        <span className="font-semibold">{t.invitationTitle}</span>
        <span className="text-sm text-[var(--theme-body)]">{t.categories[item.category]}</span>
      </span>
      <span className={`rounded-md px-2.5 py-1 text-sm font-semibold ${item.status === "invited"
        ? "bg-[var(--theme-selected)] text-[var(--theme-link)]"
        : "bg-[var(--theme-control)] text-[var(--theme-body)]"}`}>{t.statuses[item.status]}</span>
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--theme-control)] text-[var(--theme-link)]">
        <svg className="group-open:rotate-180" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </span>
    </summary>
    <div className="grid gap-5 border-t border-[var(--theme-border)] p-5 sm:p-6">
      <dl className="grid gap-3 rounded-lg bg-[var(--theme-control)] p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-sm text-[var(--theme-body)]">{t.inviteSender}</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            <span dir="auto" className="break-words">{item.sender?.displayName ?? t.programTeam}</span>
            {!!item.sender?.personalClaims.length && <PersonalClaimChecks claims={item.sender.personalClaims} />}
            {item.sender?.founderVerified && <FounderVerifiedMark compact />}
          </dd>
        </div>
        {dates.map(({ label, value }) => value && <div key={label}>
          <dt className="text-sm text-[var(--theme-body)]">{label}</dt>
          <dd className="mt-1 text-sm font-semibold"><time dateTime={value}>{date.format(new Date(value))}</time></dd>
        </div>)}
      </dl>
      {item.invitationMessage && <div className="grid gap-2 rounded-lg border border-[var(--theme-border)] border-s-4 border-s-[var(--theme-primary)] px-4 py-3">
        <h2 className="font-semibold">{t.whyInvited}</h2>
        <p className="max-w-prose whitespace-pre-line break-words text-sm leading-relaxed" dir="auto">{item.invitationMessage}</p>
      </div>}
      <div className="grid max-w-prose gap-2">
        <h2 className="font-semibold">{t.roleTitle}</h2>
        <p className="text-sm leading-relaxed text-[var(--theme-body)]">{t.meaning}</p>
        <p className="text-sm leading-relaxed text-[var(--theme-body)]">{t.roleDetails}</p>
      </div>
      {item.reconsideration && <p className="text-sm">{t.review[item.reconsideration]}</p>}
      {item.status === "invited" && <div className="flex flex-col gap-2 border-t border-[var(--theme-border)] pt-4 sm:flex-row sm:flex-wrap">
        <button type="button" className={institutionAction + " min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2"}
          disabled={mutation.busy} onClick={() => run({ action: "accept" })}>{t.actions.accept}</button>
        <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--theme-border)] px-4 py-2 text-sm font-semibold text-[var(--theme-text)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          disabled={mutation.busy} onClick={() => run({ action: "decline" })}>{t.actions.decline}</button>
      </div>}
      {item.status === "active" && <>
        <p className="text-sm">{item.publicOptIn && item.publicEligible ? t.visible : t.private}</p>
        {!item.publicEligible && <p className="text-sm text-[var(--theme-body)]">{t.eligibility}</p>}
        {item.publicEligible && <form className="grid max-w-xl gap-2" onSubmit={(event) => {
          event.preventDefault();
          run({ action: "publish", publish: true, statement: statement.trim() || null });
        }}>
          <label className="text-sm font-semibold">{t.statement}
            <textarea rows={3} maxLength={500} dir="auto" className={institutionField} value={statement} onChange={(event) => setStatement(event.target.value)} />
          </label>
          <button disabled={mutation.busy} className={`${institutionAction} justify-self-start`}>{t.actions.publish}</button>
        </form>}
        {item.publicOptIn && <button className={`${institutionLink} justify-self-start`} disabled={mutation.busy}
          onClick={() => run({ action: "publish", publish: false, statement: null })}>{t.hide}</button>}
      </>}
      {(item.status === "active" || item.status === "suspended") && (withdraw ? <div className="flex flex-wrap items-center gap-2">
        <p className="basis-full text-sm">{t.withdrawConfirm}</p>
        <button className={institutionAction} disabled={mutation.busy} onClick={() => run({ action: "withdraw" })}>{t.actions.withdraw}</button>
        <button className={institutionLink} onClick={() => setWithdraw(false)}>{t.cancel}</button>
      </div> : <button className={`${institutionLink} justify-self-start`} onClick={() => setWithdraw(true)}>{t.actions.withdraw}</button>)}
      {item.canRequestReview && <form className="grid max-w-xl gap-2" onSubmit={(event) => {
        event.preventDefault();
        run({ action: "request_review", reason });
      }}>
        <p className="text-sm">{t.reviewWindow}</p>
        <label className="text-sm font-semibold">{t.reason}
          <textarea className={institutionField} value={reason} onChange={(event) => setReason(event.target.value)}
            minLength={10} maxLength={1000} required rows={3} />
        </label>
        <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.actions.request_review}</button>
      </form>}
      {saved && <p role="status" className="text-sm">{t.saved}</p>}
      <AmbassadorFeedback error={mutation.error} reload={refresh} />
    </div>
  </details>;
}

export function AmbassadorAdministration() {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  const [handle, setHandle] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const cursor = cursors.at(-1) ?? null;
  const load = useCallback((signal: AbortSignal) => loadAmbassadorAdmin(handle, cursor, signal), [handle, cursor]);
  const resource = useInstitutionResource(load);
  const matched = resource.data?.candidate;
  const candidate = matched?.username === handle ? matched : null;
  const nextCursor = resource.data?.nextCursor;

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHandle(value(new FormData(event.currentTarget), "username"));
    setCursors([]);
    setActivePanel(null);
    resource.refresh();
  }

  function closePanel(key: string) {
    setActivePanel((open) => open === key ? null : open);
  }

  return <section className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
    <section className={`${adminCompactCard} grid gap-3`}>
      <form className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={search}>
        <label className="min-w-0 text-sm font-semibold">{t.candidate}
          <input name="username" type="search" className={institutionField} pattern={handlePattern} autoCapitalize="none" />
        </label>
        <button type="submit" className={`${institutionAction} min-h-11 justify-self-start`}>{t.search}</button>
      </form>
      {handle && resource.data && !candidate && <p className="text-sm text-[var(--theme-body)]">{t.noResults}</p>}
      {candidate && <div className="grid gap-2 rounded-lg border border-[var(--theme-border)] p-3">
        <h3 className="break-words font-semibold">
          {candidate.displayName || "@" + candidate.username}
          {candidate.displayName && <span className="ms-1 text-sm font-normal text-[var(--theme-body)]">@{candidate.username}</span>}
          {" "}<AdminMemberBadges username={candidate.username} />
        </h3>
        <p className="text-sm text-[var(--theme-body)]">{candidate.publicEligible ? t.publicEligible : t.eligibility}</p>
        {candidate.eligible
          ? <AmbassadorActionDisclosure label={t.proposalPanel} open={activePanel === "proposal"}
            onOpen={() => setActivePanel("proposal")} onClose={() => closePanel("proposal")}
            render={(close) => <AmbassadorProposal username={candidate.username} close={close} refresh={resource.refresh} />} />
          : <p className="text-sm">{t.unavailable}</p>}
      </div>}
    </section>
    <section className={`${adminCompactCard} grid gap-3`}>
      <h2 className="border-b border-[var(--theme-border)] pb-2.5 text-lg font-semibold">{t.casesTitle}</h2>
      <AmbassadorFeedback error={resource.error} admin reload={resource.refresh} />
      {!resource.data && resource.error === null && <p role="status" className="text-sm">{authMessages[locale].working}</p>}
      {resource.data?.cases.length === 0 && <p className="text-sm text-[var(--theme-body)]">{t.emptyAdmin}</p>}
      {resource.data?.cases.map((item) => <AdminCase key={item.id + ":" + item.version} item={item} refresh={resource.refresh}
        open={activePanel === item.id} onOpen={() => setActivePanel(item.id)} onClose={() => closePanel(item.id)} />)}
      {(cursor || nextCursor) && <div className="flex flex-wrap gap-2">
        {cursor && <button type="button" className={adminSecondaryAction} onClick={() => {
          setActivePanel(null);
          setCursors((items) => items.slice(0, -1));
        }}>{t.previous}</button>}
        {nextCursor && <button type="button" className={adminSecondaryAction} onClick={() => {
          setActivePanel(null);
          setCursors((items) => [...items, nextCursor]);
        }}>{t.more}</button>}
      </div>}
    </section>
  </section>;
}

function AmbassadorActionDisclosure({ label, open, onOpen, onClose, render }: {
  label: string; open: boolean; onOpen: () => void; onClose: () => void;
  render: (close: () => void) => ReactNode;
}) {
  const panelId = useId();
  const triggerId = panelId + "-toggle";

  function close() {
    const button = document.getElementById(triggerId);
    if (button?.getAttribute("aria-expanded") === "true") button.focus();
    onClose();
  }

  return <div className="min-w-0">
    <button id={triggerId} type="button" aria-expanded={open} aria-controls={panelId}
      className={`${adminSecondaryAction} group min-h-11 gap-2 aria-expanded:border-[var(--theme-link)] aria-expanded:bg-[var(--theme-selected)]`}
      onClick={open ? close : onOpen}>
      {label}
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 group-aria-expanded:rotate-180"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <div id={panelId} hidden={!open}>{open && render(close)}</div>
  </div>;
}

function AmbassadorProposal({ username, close, refresh }: { username: string; close: () => void; refresh: () => void }) {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  const mutation = useFeedMutation();
  return <form className={`${adminActionPanel} mt-2`} aria-busy={mutation.busy} onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const category = ambassadorCategories.find((item) => item === data.get("category"));
    if (!category) return;
    void mutation.run(async () => {
      await proposeAmbassador(username, category, value(data, "reason"));
      close();
      refresh();
    });
  }}>
    <fieldset disabled={mutation.busy} className="grid min-w-0 gap-3">
      <label className="text-sm font-semibold">{t.category}<select className={institutionField} name="category" required defaultValue="">
        <option value="" disabled>{t.chooseCategory}</option>
        {ambassadorCategories.map((category) => <option key={category} value={category}>{t.categories[category]}</option>)}
      </select></label>
      <ReasonField />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={institutionAction}>{t.actions.propose}</button>
        <button type="button" className={adminSecondaryAction} onClick={close}>{t.cancel}</button>
      </div>
    </fieldset>
    <AmbassadorFeedback error={mutation.error} admin reload={refresh} />
  </form>;
}

function ReasonField() {
  const [locale] = useLocale();
  return <label className="text-sm font-semibold">{ambassadorMessages[locale].reason}
    <textarea name="reason" className={institutionField} rows={3} required minLength={10} maxLength={1000} />
  </label>;
}

function AdminCase({ item, refresh, open, onOpen, onClose }: {
  item: AmbassadorAdminCase; refresh: () => void; open: boolean; onOpen: () => void; onClose: () => void;
}) {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  const actions: AmbassadorAdminAction[] = item.reconsideration === "pending" ? ["uphold", "allow_new_invitation"]
    : item.status === "proposed" ? ["invite", "revoke"]
    : item.status === "invited" ? ["revoke"]
    : item.status === "active" ? ["suspend", "revoke", "complete"]
    : item.status === "suspended" ? ["resume", "revoke"] : [];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <article className="grid min-w-0 gap-2 rounded-lg border border-[var(--theme-border)] p-3">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="break-words font-semibold">{item.displayName || (item.username ? "@" + item.username : t.unavailable)}
          {item.username && <>{" "}<AdminMemberBadges username={item.username} /></>}</h3>
        <p className="break-words text-sm text-[var(--theme-body)]">{item.displayName && item.username && `@${item.username} · `}
          {t.categories[item.category]}</p>
      </div>
      <span className="rounded-md bg-[var(--theme-control)] px-2 py-1 text-xs font-semibold">{t.statuses[item.status]}</span>
    </header>
    {item.status === "invited" && item.expiresAt && <p className="text-sm text-[var(--theme-body)]">
      {t.expires.replace("{date}", date.format(new Date(item.expiresAt)))}
    </p>}
    {item.reconsideration && <p className="text-sm">{t.review[item.reconsideration]}</p>}
    {item.history.length > 0 && <details className="rounded-md border border-[var(--theme-border)]">
      <summary className={adminDisclosure}>{t.history}</summary>
      <ul className="grid gap-2 border-t border-[var(--theme-border)] p-3">
        {item.history.map((entry) => <li key={entry.version} className="text-sm">
          <p>{t.actions[entry.event]} · <time dateTime={entry.createdAt}>{date.format(new Date(entry.createdAt))}</time></p>
          {entry.reason && <p className="whitespace-pre-line break-words" dir="auto">{entry.reason}</p>}
          {entry.actorId && <p className="break-all text-xs text-[var(--theme-body)]">{t.actor} · {entry.actorId}</p>}
        </li>)}
      </ul>
    </details>}
    {item.username && actions.length > 0 && <AmbassadorActionDisclosure label={t.decisionPanel} open={open}
      onOpen={onOpen} onClose={onClose}
      render={(close) => <AmbassadorDecision item={item} actions={actions} close={close} refresh={refresh} />} />}
  </article>;
}

function AmbassadorDecision({ item, actions, close, refresh }: {
  item: AmbassadorAdminCase; actions: AmbassadorAdminAction[]; close: () => void; refresh: () => void;
}) {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  const mutation = useFeedMutation();
  const [selected, setSelected] = useState("");
  const dangerous = selected === "revoke" || selected === "suspend";
  return <form className={`${adminActionPanel} mt-2 max-w-2xl`} aria-busy={mutation.busy} onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const action = actions.find((option) => option === data.get("action"));
    if (!action || (dangerous && data.get("confirmImpact") !== "yes")) return;
    void mutation.run(async () => {
      await decideAmbassador(item, action, value(data, "reason"),
        action === "invite" ? value(data, "invitationMessage") : undefined);
      close();
      refresh();
    });
  }}>
    <fieldset disabled={mutation.busy} className="grid min-w-0 gap-3">
      <label className="text-sm font-semibold">{t.action}
        <select name="action" className={institutionField} required value={selected}
          onChange={(event) => setSelected(event.target.value)}>
          <option value="">{t.choose}</option>
          {actions.map((action) => <option key={action} value={action}>{t.actions[action]}</option>)}
        </select>
      </label>
      <ReasonField />
      {selected === "invite" && <label className="text-sm font-semibold">{t.inviteMessageLabel}
        <textarea name="invitationMessage" className={institutionField} rows={3} required minLength={10} maxLength={1000}
          aria-describedby={`invite-message-help-${item.id}`} />
        <span id={`invite-message-help-${item.id}`} className="mt-1 block font-normal text-[var(--theme-body)]">{t.inviteMessageHelp}</span>
      </label>}
      {dangerous && <label className={adminConfirmation} key={selected}>
        <input type="checkbox" name="confirmImpact" value="yes" required />{t.confirmImpact}
      </label>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={dangerous ? adminDangerAction : institutionAction} disabled={!selected}>{t.record}</button>
        <button type="button" className={adminSecondaryAction} onClick={close}>{t.cancel}</button>
      </div>
    </fieldset>
    <AmbassadorFeedback error={mutation.error} admin reload={refresh} />
  </form>;
}
