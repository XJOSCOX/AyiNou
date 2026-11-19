"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accountMessages } from "@/lib/account-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { AuthShell } from "./auth-shell";
import { AuthenticatorCode } from "./authenticator-code";

export function MfaChallenge({ factorIds, next }: { factorIds: string[]; next: string }) {
  const [locale] = useLocale();
  const t = accountMessages[locale];
  const router = useRouter();
  const [factorId, setFactorId] = useState(factorIds[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function verify(code: string) {
    if (busy || !factorId) return;
    setBusy(true);
    setFailed(false);
    try {
      const { error } = await browserSupabase().auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      router.replace(next);
      router.refresh();
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  async function cancel() {
    await browserSupabase().auth.signOut({ scope: "local" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <AuthShell>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.mfaTitle}</h1>
      <p className="mt-3 text-sm text-[var(--theme-body)]">{factorIds.length ? t.mfaHelp : t.mfaUnavailable}</p>
      {factorIds.length > 1 && <label className="mt-4 grid gap-2 text-sm">
        {t.authenticator}
        <select value={factorId} onChange={(event) => setFactorId(event.target.value)} className="rounded-md bg-[var(--theme-control)] p-2">
          {factorIds.map((id, index) => <option key={id} value={id}>{t.authenticator} {index + 1}</option>)}
        </select>
      </label>}
      {factorId && <AuthenticatorCode busy={busy} submitCode={(code) => { void verify(code); }} />}
      {failed && <p role="alert" className="mt-3 text-sm text-[var(--theme-error-text)]">{t.mfaError}</p>}
      <button type="button" disabled={busy} onClick={() => { void cancel(); }} className="mt-5 text-sm font-semibold text-[var(--theme-link)] underline">{t.cancel}</button>
    </AuthShell>
  );
}
