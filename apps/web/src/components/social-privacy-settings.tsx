"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { followPolicies, mentionPolicies, profileModes, type SocialPrivacy } from "@ayinou/shared";
import { loadFollowRequests, loadSocialPrivacy, resolveFollowRequest, saveSocialPrivacy, type RequestAction, type RequestView } from "@/lib/f24-api";
import { f24Messages } from "@/lib/f24-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { discoveryTab } from "./discovery-accounts";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

const selections = { mode: profileModes, followPolicy: followPolicies, mentions: mentionPolicies };
const toggles = ["showFollowers", "showFollowing", "showBiography", "showActivity", "shareLanguage", "followNotices"] as const;

export function SocialPrivacySettings() {
  const [locale] = useLocale();
  const t = f24Messages[locale];
  const resource = useInstitutionResource(loadSocialPrivacy);
  const mutation = useFeedMutation();
  const [draft, setDraft] = useState<SocialPrivacy | null>(null);
  const [saved, setSaved] = useState(false);
  const settings = draft ?? resource.data;

  function change<K extends keyof SocialPrivacy>(key: K, value: SocialPrivacy[K]) {
    if (!settings) return;
    setDraft({ ...settings, [key]: value });
    setSaved(false);
  }

  return <section id="social-privacy" className={institutionCard}>
    <h2 className="text-xl font-semibold">{t.privacy}</h2>
    <p className="mt-2 max-w-prose text-sm">{t.privacyHint}</p>
    <Link className={`${institutionLink} mt-2 inline-block`} href="/profile#privacy">{discoveryProfileLabel[locale]}</Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!settings && resource.error === null && <p role="status">{feedMessages[locale].working}</p>}
    {settings && <form className="mt-4 grid max-w-3xl gap-4" onSubmit={(event) => {
      event.preventDefault();
      void mutation.run(async () => { setDraft(await saveSocialPrivacy(settings)); setSaved(true); });
    }}>
      <fieldset disabled={mutation.busy} className="grid gap-3 sm:grid-cols-3">
        {(["mode", "followPolicy", "mentions"] as const).map((key) => <label key={key} className="text-sm font-semibold">
          {t[key]}<select value={settings[key]} className={institutionField}
            onChange={(event) => change(key, event.target.value as SocialPrivacy[typeof key])}>
            {selections[key].map((value) => <option key={value} value={value}>{t[value]}</option>)}
          </select>
        </label>)}
      </fieldset>
      <fieldset disabled={mutation.busy} className="grid gap-3 sm:grid-cols-2">
        {toggles.map((key) => <label key={key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings[key]} onChange={(event) => change(key, event.target.checked)} />{t[key]}
        </label>)}
      </fieldset>
      <button type="submit" className={`${institutionAction} justify-self-start`} disabled={mutation.busy}>{saveLabel[locale]}</button>
      {saved && <p role="status" className="text-sm">{t.saved}</p>}
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    </form>}
  </section>;
}

const discoveryProfileLabel = { en: "Edit profile and discovery visibility", fr: "Modifier le profil et sa visibilité", ht: "Modifye pwofil ak vizibilite li", es: "Editar el perfil y su visibilidad" };
const saveLabel = { en: "Save privacy settings", fr: "Enregistrer les paramètres", ht: "Anrejistre paramèt yo", es: "Guardar ajustes de privacidad" };

export function FollowRequestsPanel() {
  const [locale] = useLocale();
  const t = f24Messages[locale];
  const [view, setView] = useState<RequestView>("incoming");
  return <section id="follow-requests" className={institutionCard}>
    <h2 className="mb-3 text-xl font-semibold">{t.followRequests}</h2>
    <div className="mb-3 flex flex-wrap gap-2">
      {(["incoming", "outgoing"] as const).map((tab) => <button type="button" key={tab} className={discoveryTab}
        aria-pressed={view === tab} onClick={() => setView(tab)}>{t[tab]}</button>)}
    </div>
    <FollowRequests key={view} view={view} />
  </section>;
}

function FollowRequests({ view }: { view: RequestView }) {
  const [locale] = useLocale();
  const t = f24Messages[locale];
  const feedback = feedMessages[locale];
  const [handled, setHandled] = useState(new Set<string>());
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const { requests, nextCursor } = await loadFollowRequests(view, cursor, signal);
    return { rows: requests, nextCursor };
  }, [view]);
  const resource = useCursorPage(load);
  const mutation = useFeedMutation();
  const rows = resource.page?.rows.filter(({ id }) => !handled.has(id));
  async function resolve(id: string, action: RequestAction) {
    if (await mutation.run(() => resolveFollowRequest(id, action))) setHandled((current) => new Set([...current, id]));
  }

  return <div className="grid gap-3">
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {!rows && resource.error === null && <p role="status">{feedback.working}</p>}
    {rows?.length === 0 && <p>{t.noRequests}</p>}
    {!!rows?.length && <ul className="divide-y divide-[var(--theme-border)]">{rows.map(({ id, username, displayName }) => <li key={id}
      className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="break-all">{username ? <Link href={`/members/${encodeURIComponent(username)}`} className={institutionLink}>
        {displayName ? `${displayName} · @${username}` : `@${username}`}
      </Link> : displayName}</span>
      <div className="flex gap-2">
        {(view === "incoming" ? ["approve", "reject"] as const : ["cancel"] as const).map((action) => <button type="button" key={action}
          className={action === "approve" ? institutionAction : discoveryTab} disabled={mutation.busy}
          onClick={() => { void resolve(id, action); }}>{t[action]}</button>)}
      </div>
    </li>)}</ul>}
    {resource.page?.nextCursor && <button type="button" className={`${discoveryTab} justify-self-start`} disabled={resource.loadingMore}
      onClick={() => { void resource.more(); }}>{feedback.loadMore}</button>}
  </div>;
}
