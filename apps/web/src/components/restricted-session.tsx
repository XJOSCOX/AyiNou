"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminMessages } from "@/lib/admin-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { AuthShell } from "./auth-shell";
import { institutionAction, institutionErrorBox } from "./institution-ui";

export function RestrictedSession() {
  const [locale] = useLocale();
  const t = adminMessages[locale];
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
    {failed && <p role="alert" className={institutionErrorBox}>{authMessages[locale].loadError}</p>}
    <button type="button" disabled={busy} onClick={() => { void signOut(); }} className={`${institutionAction} mt-4`}>{authMessages[locale].logout}</button>
  </AuthShell>;
}
