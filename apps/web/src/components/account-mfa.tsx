"use client";

import { useEffect, useState } from "react";
import type { Factor } from "@supabase/supabase-js";
import { accountMessages } from "@/lib/account-i18n";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { AuthenticatorCode, mfaActionClass } from "./authenticator-code";

type MfaState = { verified: string[]; pending: string[] };
type Setup = { id: string; key: string };

async function readFactors(): Promise<MfaState> {
  const { data, error } = await browserSupabase().auth.mfa.listFactors();
  if (error) throw error;
  const all: Factor[] = data.all;
  const totp = all.filter((factor) => factor.factor_type === "totp");
  return {
    verified: totp.filter((factor) => factor.status === "verified").map((factor) => factor.id),
    pending: totp.filter((factor) => factor.status === "unverified").map((factor) => factor.id),
  };
}

export function AccountMfa() {
  const [locale] = useLocale();
  const t = accountMessages[locale];
  const auth = authMessages[locale];
  const [factors, setFactors] = useState<MfaState | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    readFactors().then((result) => { if (active) setFactors(result); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try { await action(); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }

  async function enroll() {
    const mfa = browserSupabase().auth.mfa;
    // Remove only unfinished TOTP enrollments so an interrupted setup can be retried.
    for (const factorId of factors?.pending ?? []) {
      const { error } = await mfa.unenroll({ factorId });
      if (error && error.code !== "mfa_factor_not_found") throw error;
    }
    const { data, error } = await mfa.enroll({ factorType: "totp", issuer: "AyiNou" });
    if (error) throw error;
    setSetup({ id: data.id, key: data.totp.secret });
  }

  async function verify(code: string) {
    if (!setup) return;
    const { error } = await browserSupabase().auth.mfa.challengeAndVerify({ factorId: setup.id, code });
    if (error) throw error;
    const id = setup.id;
    setSetup(null);
    setFactors((previous) => ({ verified: [...(previous?.verified ?? []), id], pending: [] }));
  }

  async function remove(factorId: string) {
    const client = browserSupabase();
    const { error } = await client.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    if (setup?.id === factorId) setSetup(null);
    setRemoveId(null);
    setFactors((previous) => previous && ({
      verified: previous.verified.filter((id) => id !== factorId),
      pending: previous.pending.filter((id) => id !== factorId),
    }));
    await client.auth.refreshSession();
  }

  return (
    <div className="mt-5 border-t border-[var(--theme-border)] pt-5">
      <h3 className="font-semibold">{t.authenticator}</h3>
      {!factors && (failed
        ? <p role="alert" className="mt-2 text-sm text-[var(--theme-error-text)]">{t.mfaUnavailable}</p>
        : <p role="status" className="mt-2 text-sm">{auth.working}</p>)}
      {factors && <>
        <p className="mt-2 text-sm text-[var(--theme-body)]">{factors.verified.length ? t.mfaOn : t.mfaOff}</p>
        {setup ? (
          <div className="mt-3 rounded-md bg-[var(--theme-control)] p-3">
            <p className="text-sm text-[var(--theme-body)]">{t.mfaSetup}</p>
            <code className="mt-2 block break-all font-semibold">{setup.key}</code>
            <AuthenticatorCode busy={busy} submitCode={(code) => { void run(() => verify(code)); }} />
            <button type="button" disabled={busy} className="mt-3 text-sm underline" onClick={() => { void run(() => remove(setup.id)); }}>{t.cancel}</button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {factors.verified.map((id, index) => (
              <div key={id}>
                {removeId === id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm">{t.mfaConfirmRemove}</p>
                    <button type="button" disabled={busy} className={mfaActionClass} onClick={() => { void run(() => remove(id)); }}>{t.mfaRemove}</button>
                    <button type="button" disabled={busy} className="px-2 text-sm underline" onClick={() => setRemoveId(null)}>{t.cancel}</button>
                  </div>
                ) : <button type="button" disabled={busy} className="text-sm font-semibold text-[var(--theme-link)] underline" onClick={() => setRemoveId(id)}>
                  {t.mfaRemove}{factors.verified.length > 1 ? ` ${index + 1}` : ""}
                </button>}
              </div>
            ))}
            <button type="button" disabled={busy} className={mfaActionClass} onClick={() => { void run(enroll); }}>{t.mfaEnable}</button>
          </div>
        )}
        {failed && <p role="alert" className="mt-3 text-sm text-[var(--theme-error-text)]">{t.mfaError}</p>}
      </>}
    </div>
  );
}
