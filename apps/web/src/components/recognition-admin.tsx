"use client";

import { recognitionIcons, type RecognitionAdministration, type RecognitionAward, type RecognitionBadge, type RecognitionIcon, type RecognitionText } from "@ayinou/shared";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { accountMessages } from "@/lib/account-i18n";
import { adminMessages } from "@/lib/admin-i18n";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { verificationCopy } from "@/lib/verification-policy-i18n";
import { AdminFeedback } from "./admin-workspace";
import { institutionAction, institutionCard, institutionField, useInstitutionResource } from "./institution-ui";
import { AdminMemberBadges } from "./admin-account-avatar";
import { adminActionPanel, adminCompactCard, adminDangerAction, adminSecondaryAction } from "./admin-controls";
import { RecognitionMark } from "./recognition-mark";
import { VerificationSettings } from "./verification-settings";

const route = "/api/v1/admin/recognition";
const locales = ["en", "fr", "ht", "es"] as const;
const empty = { en: "", fr: "", ht: "", es: "" };
type Selection =
  | { action: "create" }
  | { action: "edit" | "archive" | "reactivate" | "award"; badge: RecognitionBadge }
  | { action: "revoke"; award: RecognitionAward };

export function RecognitionAdmin({ workspaceId, section }: { workspaceId: string; section: "recognitionBadges" | "recognitionHistory" }) {
  const [locale] = useLocale();
  const t = verificationCopy[locale];
  const load = useCallback((signal: AbortSignal): Promise<RecognitionAdministration> =>
    authorizedRequest(route, { signal, headers: { "X-Ayinou-Workspace": workspaceId } }), [workspaceId]);
  const result = useInstitutionResource(load);
  const [selection, select] = useState<Selection | null>(null);
  const catalog = section === "recognitionBadges";
  const badges = new Map(result.data?.badges.map((badge) => [badge.id, badge]));
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const command = selection && <RecognitionCommand key={JSON.stringify(selection)} selection={selection} workspaceId={workspaceId}
    cancel={() => select(null)} done={() => { select(null); result.refresh(); }} />;
  return <>
    {catalog && <VerificationSettings section="recognitionBadges" workspaceId={workspaceId} />}
    <section className={catalog ? institutionCard : `${adminCompactCard} grid gap-3`}>
      <h2 className={catalog ? "text-xl font-semibold" : "border-b border-[var(--theme-border)] pb-2.5 text-lg font-semibold"}>{catalog ? t.copy.decorative : t.sections[section]}</h2>
      {result.error ? <AdminFeedback error={result.error} retry={result.refresh} /> : !result.data ? <p role="status">{authMessages[locale].working}</p> : <>
        {catalog ? <>
          <button className={`${institutionAction} mt-3`} onClick={() => select({ action: "create" })}>{t.copy.create}</button>
          <ul className="mt-3 divide-y divide-[var(--theme-border)]">
            {result.data.badges.map((badge) => <li className="grid gap-2 py-3" key={badge.id}>
              <div className="flex flex-wrap items-center gap-3">
                <RecognitionMark badge={badge} /> <span>{badge.archived ? t.copy.archived : t.copy.active}</span>
              </div>
              <div className="flex flex-wrap gap-4">
                <button type="button" className={adminSecondaryAction} onClick={() => select({ action: "edit", badge })}>{t.copy.edit}</button>
                {badge.archived
                  ? <button type="button" className={adminSecondaryAction} onClick={() => select({ action: "reactivate", badge })}>{t.copy.reactivate}</button>
                  : <>
                    <button type="button" className={adminSecondaryAction} disabled={!badge.awardsEnabled} onClick={() => select({ action: "award", badge })}>{t.copy.award}</button>
                    <button type="button" className={adminDangerAction} onClick={() => select({ action: "archive", badge })}>{t.copy.archive}</button>
                  </>}
              </div>
            </li>)}
          </ul>
        </> : <div className="grid min-w-0 items-start gap-3 xl:grid-cols-2">
          <section className="grid min-w-0 gap-2 rounded-lg border border-[var(--theme-border)] p-3">
            <h3 className="font-semibold">{t.copy.awards}</h3>
            {result.data.awards.length ? <ul className="divide-y divide-[var(--theme-border)]">
              {result.data.awards.map((award) => {
                const badge = badges.get(award.badgeId);
                const expanded = selection?.action === "revoke" && selection.award.id === award.id;
                return <li key={award.id} className="grid min-w-0 gap-2 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="grid min-w-0 gap-1">
                      {badge ? <RecognitionMark badge={badge} /> : <span className="break-all font-semibold">{award.badgeId}</span>}
                      <p className="break-words text-xs text-[var(--theme-body)]">
                        {award.username && <>@{award.username} <AdminMemberBadges username={award.username} /> · </>}<time dateTime={award.awardedAt}>{date.format(new Date(award.awardedAt))}</time>
                      </p>
                    </div>
                    {award.revokedAt ? <time className="rounded-md bg-[var(--theme-control)] px-2 py-1 text-xs font-medium" dateTime={award.revokedAt}>
                      {t.actions.revoke} · {date.format(new Date(award.revokedAt))}
                    </time> : <button type="button" className={adminDangerAction} aria-expanded={expanded}
                      onClick={() => select({ action: "revoke", award })}>{t.copy.revoke}</button>}
                  </div>
                  {expanded && command}
                </li>;
              })}
            </ul> : <p className="text-sm text-[var(--theme-body)]">{t.copy.empty}</p>}
          </section>
          <section className="grid min-w-0 gap-2 rounded-lg border border-[var(--theme-border)] p-3">
            <h3 className="font-semibold">{t.copy.changes}</h3>
            {result.data.history.length ? <ol className="divide-y divide-[var(--theme-border)]">
              {result.data.history.map((event) => <li key={JSON.stringify(event)} className="grid min-w-0 gap-1 py-2.5 text-sm">
                <p className="break-words font-semibold">{t.actions[event.action as keyof typeof t.actions] ?? event.action} · {badges.get(event.badgeId)?.name[locale] ?? event.badgeId}</p>
                <p className="break-words text-xs text-[var(--theme-body)]">{event.actor && <>@{event.actor} <AdminMemberBadges username={event.actor} /> · </>}<time dateTime={event.at}>{dateTime.format(new Date(event.at))}</time></p>
                <p className="whitespace-pre-wrap break-words">{event.reason}</p>
              </li>)}
            </ol> : <p className="text-sm text-[var(--theme-body)]">{t.copy.empty}</p>}
          </section>
        </div>}
      </>}
    </section>
    {catalog && command}
  </>;
}

function RecognitionCommand({ selection, workspaceId, cancel, done }: {
  selection: Selection; workspaceId: string; cancel: () => void; done: () => void;
}) {
  const [locale] = useLocale();
  const t = verificationCopy[locale];
  const badge = "badge" in selection ? selection.badge : undefined;
  const [name, setName] = useState<RecognitionText>(badge?.name ?? empty);
  const [description, setDescription] = useState<RecognitionText>(badge?.description ?? empty);
  const [icon, setIcon] = useState<RecognitionIcon>(badge?.icon ?? "ribbon");
  const [awardsEnabled, setAwardsEnabled] = useState(badge?.awardsEnabled ?? true);
  const [publicEnabled, setPublicEnabled] = useState(badge?.publicEnabled ?? true);
  const [color, setColor] = useState(badge?.color ?? "");
  const [reason, setReason] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const focus = useCallback((element: HTMLElement | null) => { element?.focus(); }, []);
  const receipt = useRef({ key: "", id: "" });
  const metadata = selection.action === "create" || selection.action === "edit";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !window.confirm(t.copy.confirm)) return;
    const command = { action: selection.action, ...(badge && { badgeId: badge.id, expectedRevision: badge.revision }),
      ...(metadata && { name, description, icon, color: color.trim() || null, awardsEnabled, publicEnabled }),
      ...(selection.action === "award" && { username: username.trim().toLowerCase() }),
      ...(selection.action === "revoke" && { awardId: selection.award.id }) };
    const key = JSON.stringify([command, reason.trim()]);
    if (receipt.current.key !== key) receipt.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    try {
      await authorizedRequest(route, { method: "POST", headers: { "X-Ayinou-Workspace": workspaceId },
        body: JSON.stringify({ command, reason: reason.trim(), requestId: receipt.current.id }) });
      done();
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  return <section className={institutionCard} aria-labelledby="recognition-command">
    <h2 id="recognition-command" ref={focus} tabIndex={-1} className="text-xl font-semibold">{t.actions[selection.action]}
      {badge && ` · ${badge.name[locale]}`}</h2>
    <form onSubmit={submit} className={`${adminActionPanel} mt-4 gap-4`}>
      {metadata && <>
        <div className="grid gap-4 md:grid-cols-2">
          {locales.map((language) => <fieldset key={language} className="grid gap-2">
            <legend className="font-semibold">{new Intl.DisplayNames(locale, { type: "language" }).of(language)}</legend>
            <label>{t.copy.name}<input className={institutionField} value={name[language]} onChange={(event) =>
              setName({ ...name, [language]: event.target.value })} minLength={2} maxLength={64} required /></label>
            <label>{t.copy.description}<textarea className={institutionField} value={description[language]} onChange={(event) =>
              setDescription({ ...description, [language]: event.target.value })} minLength={2} maxLength={300} required /></label>
          </fieldset>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>{t.copy.icon}<select className={institutionField} value={icon} onChange={(event) =>
            setIcon(event.target.value as RecognitionIcon)}>{recognitionIcons.map((item) => <option value={item} key={item}>{t.icons[item]}</option>)}</select></label>
          <label>{t.copy.color}<input className={institutionField} placeholder="#774CB0" value={color} onChange={(event) =>
            setColor(event.target.value)} pattern="#[0-9A-Fa-f]{6}" /></label>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2"><input type="checkbox" checked={awardsEnabled} onChange={(event) =>
            setAwardsEnabled(event.target.checked)} />{t.flags.recognitionAwards}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={publicEnabled} onChange={(event) =>
            setPublicEnabled(event.target.checked)} />{t.flags.recognitionPublic}</label>
        </div>
      </>}
      {selection.action === "award" && <label>{t.copy.username}<input className={institutionField} required value={username}
        onChange={(event) => setUsername(event.target.value)} /></label>}
      <label>{adminMessages[locale].registrationPolicy.reason}<textarea className={institutionField} required minLength={10} maxLength={500}
        value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {error != null && (apiErrorCode(error) === "POLICY_PAUSED" ? <p role="alert">{t.copy.paused}</p> : <AdminFeedback error={error} />)}
      <div className="flex flex-wrap gap-4">
        <button className={selection.action === "archive" || selection.action === "revoke" ? adminDangerAction : institutionAction} disabled={busy}>{t.copy.save}</button>
        <button type="button" className={adminSecondaryAction} onClick={cancel} disabled={busy}>{accountMessages[locale].cancel}</button>
      </div>
    </form>
  </section>;
}
