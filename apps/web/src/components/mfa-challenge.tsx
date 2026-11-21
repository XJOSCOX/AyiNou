"use client";

import { useState } from "react";
import { accountMessages } from "@/lib/account-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { AuthShell } from "./auth-shell";
import { AuthenticatorCode } from "./authenticator-code";
import styles from "./mfa-challenge.module.css";

export function MfaChallenge({ factorIds, next, subject, sessionId }: {
  factorIds: string[]; next: string; subject: string; sessionId: string;
}) {
  const [locale] = useLocale();
  const t = accountMessages[locale];
  const [factorId, setFactorId] = useState(factorIds[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function verify(code: string) {
    if (busy || !factorId) return;
    setBusy(true);
    setFailed(false);
    try {
      const client = browserSupabase();
      const current = await client.auth.getClaims();
      if (current.data?.claims.sub !== subject || current.data.claims.session_id !== sessionId) {
        window.location.replace("/login");
        return;
      }
      const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      const refreshed = await client.auth.getClaims(data.access_token);
      if (refreshed.data?.claims.sub !== subject || refreshed.data.claims.session_id !== sessionId ||
        refreshed.data.claims.aal !== "aal2") { setFailed(true); return; }
      window.location.replace(next);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    try {
      const client = browserSupabase();
      const current = await client.auth.getClaims();
      if (current.data?.claims.sub === subject && current.data.claims.session_id === sessionId) {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
      }
      window.location.replace("/login");
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell>
      <section className={styles.challenge} aria-labelledby="mfa-title">
        <header className={styles.header}>
          <span className={styles.lock} aria-hidden="true" />
          <h1 id="mfa-title" className={styles.title}>{t.mfaTitle}</h1>
          <p id="mfa-help" className={styles.help}>{factorIds.length ? t.mfaHelp : t.mfaUnavailable}</p>
        </header>
        {factorIds.length > 1 && <label className={styles.factor}>
          {t.authenticator}
          <select value={factorId} disabled={busy} onChange={(event) => setFactorId(event.target.value)}>
            {factorIds.map((id, index) => <option key={id} value={id}>{t.authenticator} {index + 1}</option>)}
          </select>
        </label>}
        {factorId && <AuthenticatorCode busy={busy} submitCode={(code) => { void verify(code); }}
          challenge={{ label: t.mfaChallengeCode, descriptionId: "mfa-help", error: failed ? t.mfaError : undefined }} />}
        <footer className={styles.footer}>
          <button type="button" disabled={busy} onClick={() => { void cancel(); }} className={styles.cancel}>{t.cancel}</button>
        </footer>
      </section>
    </AuthShell>
  );
}
