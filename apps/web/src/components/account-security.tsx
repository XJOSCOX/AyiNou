"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { adminMessages } from "@/lib/admin-i18n";
import { updateOwnPassword } from "@/lib/account-security";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { institutionAction, institutionErrorBox, institutionField, institutionLink } from "./institution-ui";

export function AccountSecurity() {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"passwordFailed" | "passwordMismatch" | "passwordReauth" | "passwordSaved" | "signoutFailed" | null>(null);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const next = String(fields.get("password") ?? "");
    if (next !== fields.get("confirmation")) {
      setNotice("passwordMismatch");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await updateOwnPassword(String(fields.get("current") ?? ""), next);
      form.reset();
      setNotice("passwordSaved");
    } catch (cause) {
      setNotice(cause instanceof Error && cause.message === "REAUTHENTICATION" ? "passwordReauth" : "passwordFailed");
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere() {
    if (busy || !window.confirm(t.confirmSignOut)) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await browserSupabase().auth.signOut({ scope: "global" });
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch { setNotice("signoutFailed"); }
    finally { setBusy(false); }
  }

  return <div className="mt-4 space-y-4">
    <form className="grid max-w-md gap-3" onSubmit={changePassword} aria-busy={busy}>
      <label className="text-sm font-semibold">{t.currentPassword}
        <input name="current" type="password" autoComplete="current-password" className={institutionField} required disabled={busy} />
      </label>
      <label className="text-sm font-semibold">{t.newPassword}
        <input name="password" type="password" autoComplete="new-password" className={institutionField} required minLength={8} disabled={busy} />
      </label>
      <label className="text-sm font-semibold">{t.confirmNew}
        <input name="confirmation" type="password" autoComplete="new-password" className={institutionField} required minLength={8} disabled={busy} />
      </label>
      <button type="submit" className={`${institutionAction} justify-self-start`} disabled={busy}>{t.apply}</button>
    </form>
    <button type="button" className={institutionLink} onClick={() => { void signOutEverywhere(); }} disabled={busy}>{t.globalSignOut}</button>
    {notice && (notice === "passwordSaved" ? <p role="status">{t[notice]}</p>
      : <p role="alert" className={institutionErrorBox}>{t[notice]}</p>)}
  </div>;
}
