"use client";

import Link from "next/link";
import type { MemberAccountEnforcement } from "@ayinou/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { adminMessages } from "@/lib/admin-i18n";
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

export function RestrictedSession() {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const copy = accountEnforcementMessages[locale];
  const notice = useInstitutionResource(readEnforcement);
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
    <h1 className="text-3xl font-semibold">{t.restrictedTitle}</h1>
    <p className="mt-3 text-sm text-[var(--theme-body)]">{t.restrictedHelp}</p>
    <p className="mt-3 text-sm">{copy.noticeHelp}</p>
    {notice.error !== null && <div className="mt-3" role="status"><p>{copy.unavailable}</p>
      <button type="button" className={institutionLink} onClick={notice.refresh}>{authMessages[locale].retry}</button></div>}
    {notice.error === null && notice.data?.notices.length === 0 && <p className="mt-3 text-sm">{copy.noNotice}</p>}
    {!!notice.data?.notices.length && <ul className="mt-3 grid max-h-[42dvh] gap-3 overflow-y-auto">
      {notice.data.notices.map((item) => <li key={item.reference} className="rounded-md border border-[var(--theme-border)] p-3">
        <EnforcementDetails notice={item} />
      </li>)}
    </ul>}
    {notice.data?.canResume && <p className="mt-4 text-sm" role="status">{copy.resume}</p>}
    <div className="mt-4 grid gap-2 text-sm">
      <Link className={institutionLink} href="/forgot-password">{copy.security}</Link>
      <a className={institutionLink} href="mailto:contact@ayinou.com">{copy.support}</a>
      <p>{copy.noAppeal}</p>
    </div>
    {failed && <p role="alert" className={institutionErrorBox}>{authMessages[locale].loadError}</p>}
    <button type="button" disabled={busy} onClick={() => { void signOut(); }} className={`${institutionAction} mt-4`}>{authMessages[locale].logout}</button>
  </AuthShell>;
}
