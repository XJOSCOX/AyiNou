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
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
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
  return <>
    {catalog && <VerificationSettings section="recognitionBadges" workspaceId={workspaceId} />}
    <section className={institutionCard}>
      <h2 className="text-xl font-semibold">{catalog ? t.copy.decorative : t.sections[section]}</h2>
      {result.error ? <AdminFeedback error={result.error} retry={result.refresh} /> : !result.data ? <p role="status">{authMessages[locale].working}</p> : <>
        {catalog ? <>
          <button className={`${institutionAction} mt-3`} onClick={() => select({ action: "create" })}>{t.copy.create}</button>
          <ul className="mt-3 divide-y divide-[var(--theme-border)]">
            {result.data.badges.map((badge) => <li className="grid gap-2 py-3" key={badge.id}>
              <div className="flex flex-wrap items-center gap-3">
                <RecognitionMark badge={badge} /> <span>{badge.archived ? t.copy.archived : t.copy.active}</span>
              </div>
              <div className="flex flex-wrap gap-4">
                <button className={institutionLink} onClick={() => select({ action: "edit", badge })}>{t.copy.edit}</button>
                {badge.archived
                  ? <button className={institutionLink} onClick={() => select({ action: "reactivate", badge })}>{t.copy.reactivate}</button>
                  : <>
                    <button className={institutionLink} disabled={!badge.awardsEnabled} onClick={() => select({ action: "award", badge })}>{t.copy.award}</button>
                    <button className={institutionLink} onClick={() => select({ action: "archive", badge })}>{t.copy.archive}</button>
                  </>}
              </div>
            </li>)}
          </ul>
        </> : <>
          <h3 className="mt-4 font-semibold">{t.copy.awards}</h3>
          {!result.data.awards.length && <p>{t.copy.empty}</p>}
          <ul className="divide-y divide-[var(--theme-border)]">
            {result.data.awards.map((award) => <li key={award.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span>{badges.get(award.badgeId)?.name[locale] ?? award.badgeId}</span>
              {award.username && <span>@{award.username}</span>}
              <time dateTime={award.awardedAt}>{new Date(award.awardedAt).toLocaleDateString(locale)}</time>
              {award.revokedAt ? <span>{t.actions.revoke}</span> :
                <button className={institutionLink} onClick={() => select({ action: "revoke", award })}>{t.copy.revoke}</button>}
            </li>)}
          </ul>
          <h3 className="mt-4 font-semibold">{t.copy.changes}</h3>
          {!result.data.history.length && <p>{t.copy.empty}</p>}
          <ol className="divide-y divide-[var(--theme-border)]">
            {result.data.history.map((event) => <li key={JSON.stringify(event)} className="grid gap-1 py-2 text-sm">
              <p>{t.actions[event.action as keyof typeof t.actions]} · {badges.get(event.badgeId)?.name[locale] ?? event.badgeId}
                {event.actor && ` · @${event.actor}`} · <time dateTime={event.at}>{new Date(event.at).toLocaleString(locale)}</time></p>
              <p className="break-words">{event.reason}</p>
            </li>)}
          </ol>
        </>}
      </>}
    </section>
    {selection && <RecognitionCommand key={JSON.stringify(selection)} selection={selection} workspaceId={workspaceId}
      cancel={() => select(null)} done={() => { select(null); result.refresh(); }} />}
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
    <form onSubmit={submit} className="mt-4 grid gap-4">
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
        <button className={institutionAction} disabled={busy}>{t.copy.save}</button>
        <button type="button" className={institutionLink} onClick={cancel} disabled={busy}>{accountMessages[locale].cancel}</button>
      </div>
    </form>
  </section>;
}
