"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { ambassadorCategories, type AmbassadorAdminAction, type AmbassadorAdminCase, type AmbassadorCase, type AmbassadorCategory } from "@ayinou/shared";
import { changeAmbassadorCase, decideAmbassador, loadAmbassadorAdmin, loadMyAmbassadorCases, proposeAmbassador } from "@/lib/ambassador-api";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { apiErrorCode } from "@/lib/api-errors";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

const value = (form: FormData, field: string) => String(form.get(field) ?? "").trim();
const handlePattern = "[a-z0-9][a-z0-9_]{2,23}";

function AmbassadorFeedback({ error, reload, admin = false }: { error: unknown; reload?: () => void; admin?: boolean }) {
  const [locale] = useLocale();
  if (error === null) return null;
  return <div className="grid gap-2">
    <ApiErrorNotice error={error} retry={reload} signIn />
    {admin && apiErrorCode(error) === "MFA_REQUIRED" && <Link href="/mfa?next=/admin" className={institutionLink}>
      {ambassadorMessages[locale].verifySession}
    </Link>}
  </div>;
}

function CaseStatus({ item }: { item: AmbassadorCase }) {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  return <div className="grid gap-1">
    <h3 className="font-semibold">{t.categories[item.category]} · {t.statuses[item.status]}</h3>
    {item.status === "invited" && item.expiresAt && <p className="text-sm text-[var(--theme-body)]">
      {t.expires.replace("{date}", new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.expiresAt)))}
    </p>}
    {item.reconsideration && <p className="text-sm">{t.review[item.reconsideration]}</p>}
  </div>;
}

export function MyAmbassadorWorkspace() {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  const resource = useInstitutionResource(loadMyAmbassadorCases);
  return <MemberShell>
    <section className="grid gap-4">
      <PageHeader title={t.myProgram} description={t.responsibilities}
        actions={<Link className={institutionLink} href="/ambassadors">{t.about}</Link>} />
      <AmbassadorFeedback error={resource.error} reload={resource.refresh} />
      {!resource.data && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
      {resource.data?.cases.length === 0 && <p className={institutionCard}>{t.emptyMine}</p>}
      {resource.data?.cases.map((item) => <MemberCase key={item.id} item={item} refresh={resource.refresh} />)}
    </section>
  </MemberShell>;
}

function MemberCase({ item, refresh }: { item: AmbassadorCase; refresh(): void }) {
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
  return <article className={`${institutionCard} grid gap-3`}>
    <CaseStatus item={item} />
    {item.status === "invited" && <div className="flex flex-wrap gap-2">
      <button className={institutionAction} disabled={mutation.busy} onClick={() => run({ action: "accept" })}>{t.actions.accept}</button>
      <button className={institutionLink} disabled={mutation.busy} onClick={() => run({ action: "decline" })}>{t.actions.decline}</button>
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
  </article>;
}

export function AmbassadorAdministration() {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  const [handle, setHandle] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1) ?? null;
  const load = useCallback((signal: AbortSignal) => loadAmbassadorAdmin(handle, cursor, signal), [handle, cursor]);
  const resource = useInstitutionResource(load);
  const mutation = useFeedMutation();
  const candidate = resource.data?.candidate;
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHandle(value(new FormData(event.currentTarget), "username"));
    setCursors([]);
    resource.refresh();
  }
  return <section className="grid gap-4">
    <h2 className="text-2xl font-semibold">{t.title}</h2>
    <div className={`${institutionCard} grid gap-3`}>
      <form className="flex flex-wrap items-end gap-2" onSubmit={search}>
        <label className="min-w-0 grow text-sm font-semibold">{t.candidate}
          <input name="username" className={institutionField} pattern={handlePattern} autoCapitalize="none" />
        </label>
        <button className={institutionAction}>{t.search}</button>
      </form>
      {handle && resource.data && !candidate && <p>{t.noResults}</p>}
      {candidate && candidate.username === handle && <>
        <p className="break-words font-semibold">{candidate.displayName} · @{candidate.username}</p>
        <p className="text-sm">{candidate.publicEligible ? t.publicEligible : t.eligibility}</p>
        {candidate.eligible ? <form className="grid max-w-xl gap-2" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const category = value(data, "category") as AmbassadorCategory;
          void mutation.run(async () => {
            await proposeAmbassador(candidate.username, category, value(data, "reason"));
            form.reset();
            resource.refresh();
          });
        }}>
          <label className="text-sm font-semibold">{t.category}<select className={institutionField} name="category">
            {ambassadorCategories.map((category) => <option key={category} value={category}>{t.categories[category]}</option>)}
          </select></label>
          <ReasonField />
          <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.actions.propose}</button>
        </form> : <p className="text-sm">{t.unavailable}</p>}
      </>}
      <AmbassadorFeedback error={mutation.error} admin reload={resource.refresh} />
    </div>
    <AmbassadorFeedback error={resource.error} admin reload={resource.refresh} />
    {!resource.data && resource.error === null && <p role="status">{authMessages[locale].working}</p>}
    {resource.data?.cases.length === 0 && <p>{t.emptyAdmin}</p>}
    {resource.data?.cases.map((item) => <AdminCase key={item.id} item={item} refresh={resource.refresh} />)}
    <div className="flex flex-wrap gap-3">
      {cursor && <button type="button" className={institutionLink} onClick={() => setCursors((items) => items.slice(0, -1))}>{t.previous}</button>}
      {resource.data?.nextCursor && <button type="button" className={institutionLink}
        onClick={() => setCursors((items) => [...items, resource.data!.nextCursor!])}>{t.more}</button>}
    </div>
  </section>;
}

function ReasonField() {
  const [locale] = useLocale();
  return <label className="text-sm font-semibold">{ambassadorMessages[locale].reason}
    <textarea name="reason" className={institutionField} rows={3} required minLength={10} maxLength={1000} />
  </label>;
}

function AdminCase({ item, refresh }: { item: AmbassadorAdminCase; refresh(): void }) {
  const [locale] = useLocale();
  const t = ambassadorMessages[locale];
  const mutation = useFeedMutation();
  const actions: AmbassadorAdminAction[] = item.reconsideration === "pending" ? ["uphold", "allow_new_invitation"]
    : item.status === "proposed" ? ["invite", "revoke"]
    : item.status === "invited" ? ["revoke"]
    : item.status === "active" ? ["suspend", "revoke", "complete"]
    : item.status === "suspended" ? ["resume", "revoke"] : [];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <article className={`${institutionCard} grid gap-3`}>
    <p className="break-words font-semibold">{item.displayName ?? t.unavailable}{item.username && ` · @${item.username}`}</p>
    <CaseStatus item={item} />
    {item.username && actions.length > 0 && <form className="grid max-w-xl gap-2" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const action = actions.find((option) => option === value(data, "action"));
      if (action) void mutation.run(async () => {
        await decideAmbassador(item, action, value(data, "reason"));
        form.reset();
        refresh();
      });
    }}>
      <label className="text-sm font-semibold">{t.action}
        <select name="action" className={institutionField} required>
          <option value="">{t.choose}</option>
          {actions.map((action) => <option key={action} value={action}>{t.actions[action]}</option>)}
        </select>
      </label>
      <ReasonField />
      <button className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{t.record}</button>
    </form>}
    <AmbassadorFeedback error={mutation.error} admin reload={refresh} />
    <details>
      <summary className="cursor-pointer font-semibold">{t.history}</summary>
      <ul className="mt-2 grid gap-2">
        {item.history.map((entry) => <li key={entry.version} className="border-t border-[var(--theme-border)] pt-2 text-sm">
          <p>{t.actions[entry.event]} · <time dateTime={entry.createdAt}>{date.format(new Date(entry.createdAt))}</time></p>
          {entry.reason && <p className="whitespace-pre-line break-words" dir="auto">{entry.reason}</p>}
          {entry.actorId && <p className="break-all text-[var(--theme-body)]">{t.actor} · {entry.actorId}</p>}
        </li>)}
      </ul>
    </details>
  </article>;
}
