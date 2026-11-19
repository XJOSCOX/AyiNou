"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "./auth-shell";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";

export type AuthMode = "register" | "login" | "verify" | "forgot" | "reset";

const inputClass = "mt-2 w-full rounded-xl border border-[#bccbc0] bg-[#fafbf7] px-4 py-3 text-[#153e35] outline-none focus:border-[#155746] focus:ring-2 focus:ring-[#155746]/20";

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const [locale] = useLocale();
  const t = authMessages[locale];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const title = {
    register: t.registerTitle, login: t.loginTitle, verify: t.verifyTitle,
    forgot: t.forgotTitle, reset: t.resetTitle,
  }[mode];
  const intro = {
    register: t.registerIntro, login: t.loginIntro, verify: t.verifyIntro,
    forgot: t.forgotIntro, reset: t.resetIntro,
  }[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (mode !== "reset" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t.invalidEmail); return;
    }
    if (["register", "login", "reset"].includes(mode) &&
      (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setError(t.invalidPassword); return;
    }
    if (mode === "register" && (displayName.trim().length < 2 || displayName.trim().length > 80)) {
      setError(t.invalidName); return;
    }
    setLoading(true);
    try {
      const supabase = browserSupabase();
      if (mode === "register") {
        const { error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
            data: { display_name: displayName.trim(), preferred_locale: locale },
          },
        });
        if (authError) throw authError;
        router.push("/verify-email");
      } else if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) { setError(t.invalidCredentials); return; }
        router.replace("/dashboard");
        router.refresh();
      } else if (mode === "forgot") {
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (recoveryError?.status === 429) throw recoveryError;
        setSuccess(t.resetSent);
      } else if (mode === "reset") {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) { setError(t.sessionNeeded); return; }
        const { error: resetError } = await supabase.auth.updateUser({ password });
        if (resetError) throw resetError;
        await supabase.auth.signOut();
        setSuccess(t.resetDone);
        setPassword("");
      }
    } catch {
      setError(t.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h2 className="font-serif text-4xl leading-tight">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-[#587067]">{intro}</p>

      {mode === "verify" ? (
        <div className="mt-8 space-y-5">
          <p className="rounded-xl bg-[#edf4eb] p-4 text-sm text-[#155746]" role="status">{t.checkMail}</p>
          {process.env.NODE_ENV === "development" && (
            <a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer" className="inline-block font-semibold underline underline-offset-4">{t.mailpit} ↗</a>
          )}
          <p><Link href="/login" className="font-semibold text-[#155746] underline underline-offset-4">{t.backLogin}</Link></p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          {mode === "register" && (
            <label className="block text-sm font-semibold" htmlFor="display-name">{t.displayName}
              <input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} autoComplete="nickname" required minLength={2} maxLength={80} />
            </label>
          )}
          {mode !== "reset" && (
            <label className="block text-sm font-semibold" htmlFor="email">{t.email}
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" required />
            </label>
          )}
          {mode !== "forgot" && (
            <label className="block text-sm font-semibold" htmlFor="password">{mode === "reset" ? t.newPassword : t.password}
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass}
                autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} />
              {mode !== "login" && <span className="mt-2 block text-xs font-normal text-[#6a8075]">{t.passwordHint}</span>}
            </label>
          )}
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {success && <p role="status" className="rounded-xl bg-[#edf4eb] p-3 text-sm text-[#155746]">{success}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-full bg-[#155746] px-6 py-3.5 font-bold text-white hover:bg-[#0c3d31] disabled:opacity-60">
            {loading ? t.working : { register: t.register, login: t.login, forgot: t.sendReset, reset: t.savePassword, verify: "" }[mode]}
          </button>
          {mode === "login" && <p className="text-center text-sm"><Link href="/forgot-password" className="font-semibold text-[#155746] underline underline-offset-4">{t.forgotLink}</Link></p>}
          {mode === "login" && <p className="text-center text-sm text-[#587067]">{t.needAccount} <Link href="/register" className="font-semibold text-[#155746] underline underline-offset-4">{t.register}</Link></p>}
          {mode === "register" && <p className="text-center text-sm text-[#587067]">{t.haveAccount} <Link href="/login" className="font-semibold text-[#155746] underline underline-offset-4">{t.login}</Link></p>}
          {(mode === "forgot" || mode === "reset") && <p className="text-center text-sm"><Link href="/login" className="font-semibold text-[#155746] underline underline-offset-4">{t.backLogin}</Link></p>}
        </form>
      )}
    </AuthShell>
  );
}
