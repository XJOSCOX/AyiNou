"use client";

import Link from "next/link";
import type { FeatureNotice, MemberAccountEnforcement } from "@ayinou/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { adminMessages } from "@/lib/admin-i18n";
import { featureMessages } from "@/lib/feature-enforcement-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { AuthShell } from "./auth-shell";
import { institutionAction, institutionErrorBox, institutionLink, useInstitutionResource } from "./institution-ui";
import { EnforcementDetails } from "./account-enforcement-details";

async function readEnforcement(signal: AbortSignal): Promise<MemberAccountEnforcement | null> {
  const { data, error } = await browserSupabase().rpc("m22_my_account_enforcement").abortSignal(signal);
  if (error) throw error;
  return data;
}

async function readFeatures(signal: AbortSignal): Promise<FeatureNotice[] | null> {
  const { data, error } = await browserSupabase().rpc("m23_my_feature_notices").abortSignal(signal);
  if (error) throw error;
  return data;
}

export function RestrictedSession() {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const copy = accountEnforcementMessages[locale];
  const notice = useInstitutionResource(readEnforcement);
  const features = useInstitutionResource(readFeatures);
  const feature = featureMessages[locale];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      const { error } = await browserSupabase().auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <AuthShell>
    <h1 className="text-3xl font-semibold">{notice.data?.canResume ? feature.accountAccess : t.restrictedTitle}</h1>
    {!notice.data?.canResume && <p className="mt-3 text-sm text-[var(--theme-body)]">{t.restrictedHelp}</p>}
    <p className="mt-3 text-sm">{copy.noticeHelp}</p>
    {notice.error !== null && <div className="mt-3" role="status"><p>{copy.unavailable}</p>
      <button type="button" className={institutionLink} onClick={notice.refresh}>{authMessages[locale].retry}</button></div>}
    {notice.error === null && notice.data?.notices.length === 0 && <p className="mt-3 text-sm">{copy.noNotice}</p>}
    {!!notice.data?.notices.length && <ul className="mt-3 grid max-h-[42dvh] gap-3 overflow-y-auto">
      {notice.data.notices.map((item) => <li key={item.reference} className="rounded-md border border-[var(--theme-border)] p-3">
        <EnforcementDetails notice={item} />
      </li>)}
    </ul>}
    {notice.data?.canResume && <Link className={institutionLink} href="/dashboard">{authMessages[locale].dashboard}</Link>}
    <section className="mt-5 grid min-w-0 gap-2" aria-label={feature.features}>
      <h2 className="text-lg font-semibold">{feature.features}</h2>
      {features.error !== null && <div role="status"><p>{copy.unavailable}</p>
        <button type="button" className={institutionLink} onClick={features.refresh}>{authMessages[locale].retry}</button></div>}
      {features.data?.length === 0 && <p className="text-sm">{feature.none}</p>}
      {!!features.data?.length && <ul className="grid max-h-[42dvh] gap-3 overflow-y-auto">
        {features.data.map((item) => <li key={item.id} className="grid gap-1 rounded-md border border-[var(--theme-border)] p-3 text-sm">
          <strong>{feature[item.capability]} · {feature[item.status]}</strong>
          <p>{feature[item.scope]}{item.scopeId && <span className="break-all"> · {item.scopeId}</span>}</p>
          {item.category && <p>{copy[item.category]}</p>}
          <p><time dateTime={item.startsAt}>{date.format(new Date(item.startsAt))}</time> – {item.expiresAt
            ? <time dateTime={item.expiresAt}>{date.format(new Date(item.expiresAt))}</time> : feature.indefinitely}</p>
          <p className="break-all">{copy.reference} · {item.id}</p>
        </li>)}
      </ul>}
    </section>
    <div className="mt-4 grid gap-2 text-sm">
      <Link className={institutionLink} href="/forgot-password">{copy.security}</Link>
      <a className={institutionLink} href="mailto:contact@ayinou.com">{copy.support}</a>
      <p>{copy.noAppeal}</p>
    </div>
    {failed && <p role="alert" className={institutionErrorBox}>{authMessages[locale].loadError}</p>}
    <button type="button" disabled={busy} onClick={() => { void signOut(); }} className={`${institutionAction} mt-4`}>{authMessages[locale].logout}</button>
  </AuthShell>;
}
