"use client";

import { useId, useState } from "react";
import { accountMessages } from "@/lib/account-i18n";
import { useLocale } from "@/lib/locale-store";
import { sessionSecurityMessages } from "@/lib/session-security-i18n";
import { browserSupabase } from "@/lib/supabase/browser";
import { AuthShell } from "./auth-shell";
import { AuthenticatorCode } from "./authenticator-code";
import styles from "./mfa-challenge.module.css";

export function MfaChallenge({ factorIds, next, subject, sessionId, workspace }: {
  factorIds: string[]; subject: string; sessionId: string;
} & ({ next: string; workspace?: never } | {
  next?: never;
  workspace: { onVerified: () => Promise<void>; onCancel: () => void; onSessionEnded: () => void };
})) {
  const [locale] = useLocale();
  const t = accountMessages[locale];
  const security = sessionSecurityMessages[locale];
  const titleId = useId();
  const helpId = useId();
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
        if (workspace) workspace.onSessionEnded();
        else window.location.replace("/login");
        return;
      }
      const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      const refreshed = await client.auth.getClaims(data.access_token);
      if (refreshed.data?.claims.sub !== subject || refreshed.data.claims.session_id !== sessionId ||
        refreshed.data.claims.aal !== "aal2") { setFailed(true); return; }
      if (workspace) await workspace.onVerified();
      else window.location.replace(next);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (busy) return;
    if (workspace) { workspace.onCancel(); return; }
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

  const content = (
      <section className={styles.challenge} aria-labelledby={titleId}>
        <header className={styles.header}>
          <span className={styles.lock} aria-hidden="true" />
          {workspace ? <h2 id={titleId} className="text-xl font-semibold">{security.workspaceMfaTitle}</h2>
            : <h1 id={titleId} className={styles.title}>{t.mfaTitle}</h1>}
          <p id={helpId} className={styles.help}>{factorIds.length
            ? (workspace ? security.workspaceMfaHelp : t.mfaHelp) : t.mfaUnavailable}</p>
        </header>
        {factorIds.length > 1 && <label className={styles.factor}>
          {t.authenticator}
          <select value={factorId} disabled={busy} onChange={(event) => setFactorId(event.target.value)}>
            {factorIds.map((id, index) => <option key={id} value={id}>{t.authenticator} {index + 1}</option>)}
          </select>
        </label>}
        {factorId && <AuthenticatorCode busy={busy} submitCode={(code) => { void verify(code); }}
          focusOnMount={Boolean(workspace)}
          challenge={{ label: t.mfaChallengeCode, descriptionId: helpId, error: failed ? t.mfaError : undefined }} />}
        <footer className={styles.footer}>
          <button type="button" disabled={busy} onClick={() => { void cancel(); }} className={styles.cancel}>{t.cancel}</button>
        </footer>
      </section>
  );
  return workspace ? content : <AuthShell>{content}</AuthShell>;
}
