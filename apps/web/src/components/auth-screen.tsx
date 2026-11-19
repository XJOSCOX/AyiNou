"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "./auth-shell";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { membershipMessages } from "@/lib/membership-i18n";
import { isLocale } from "@/lib/i18n";

export type AuthMode = "register" | "login" | "verify" | "forgot" | "reset";

const inputClass = "mt-2 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-control)] px-4 py-3 text-[var(--theme-text)] outline-none focus:border-[var(--theme-link)] focus:ring-2 focus:ring-[var(--theme-link)]/20";

export function AuthScreen({ mode, invalidLink = false }: { mode: AuthMode; invalidLink?: boolean }) {
  const [locale, setLocale] = useLocale();
  const t = authMessages[locale];
  const m = membershipMessages[locale];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showLinkError, setShowLinkError] = useState(invalidLink);

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
    if (loading) return;
    setShowLinkError(false);
    setError("");
    setSuccess("");
    if (mode !== "reset" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t.invalidEmail); return;
    }
    if (["register", "reset"].includes(mode) &&
      (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setError(t.invalidPassword); return;
    }
    if (mode === "login" && !password) { setError(t.invalidCredentials); return; }
    if (mode === "register" && [firstName, lastName].some((name) =>
      !name.trim() || name.trim().length > 80 || /\p{Cc}/u.test(name.trim()))) {
      setError(m.invalidPrivateNames); return;
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
            data: { display_name: displayName.trim(), preferred_locale: locale, first_name: firstName.trim(), last_name: lastName.trim() },
          },
        });
        if (authError) throw authError;
        router.push("/verify-email");
      } else if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) {
          if (authError.status === 400 && ["invalid_credentials", "email_not_confirmed"].includes(authError.code ?? "")) {
            setError(t.invalidCredentials); return;
          }
          throw authError;
        }
        router.replace("/dashboard");
        router.refresh();
      } else if (mode === "forgot") {
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (recoveryError && recoveryError.code !== "user_not_found") throw recoveryError;
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
    } catch (cause) {
      const status = typeof cause === "object" && cause && "status" in cause ? Number(cause.status) : 0;
      setError(status === 429 ? m.rateLimited : !status || status >= 500 ? m.serviceError : t.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm leading-7 text-[var(--theme-body)]">{intro}</p>

      {mode === "verify" ? (
        <div className="mt-8 space-y-5">
          <p className="rounded-xl bg-[var(--theme-control)] p-4 text-sm text-[var(--theme-link)]" role="status">{t.checkMail}</p>
          {process.env.NODE_ENV === "development" &&
            process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321" && (
            <a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer" className="inline-block font-semibold underline underline-offset-4">{t.mailpit} ↗</a>
          )}
          <p><Link href="/login" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{t.backLogin}</Link></p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-5" aria-busy={loading} noValidate>
          {mode === "register" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">{m.firstName}
                  <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" maxLength={80} className={inputClass} aria-describedby="private-names" required />
                </label>
                <label className="text-sm font-semibold">{m.lastName}
                  <input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" maxLength={80} className={inputClass} aria-describedby="private-names" required />
                </label>
              </div>
              <p id="private-names" className="text-xs text-[var(--theme-body)]">{m.privateNames}</p>
              <label className="block text-sm font-semibold" htmlFor="display-name">{t.displayName}
                <input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} autoComplete="nickname" required minLength={2} maxLength={80} />
              </label>
              <label className="block text-sm font-semibold">{t.preferredLanguage}
                <select className={inputClass} value={locale} onChange={(event) => {
                  if (isLocale(event.target.value)) setLocale(event.target.value);
                }}>
                  <option value="ht">Kreyòl ayisyen</option><option value="fr">Français</option><option value="en">English</option>
                </select>
              </label>
            </>
          )}
          {mode !== "reset" && (
            <label className="block text-sm font-semibold" htmlFor="email">{t.email}
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" required />
            </label>
          )}
          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="password" className="text-sm font-semibold">{mode === "reset" ? t.newPassword : t.password}</label>
                <button type="button" className="text-xs font-semibold text-[var(--theme-link)] underline" onClick={() => setVisiblePassword(!visiblePassword)}>
                  {visiblePassword ? m.hidePassword : m.showPassword}
                </button>
              </div>
              <input id="password" type={visiblePassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass}
                autoComplete={mode === "login" ? "current-password" : "new-password"} aria-describedby={mode !== "login" ? "password-hint" : undefined} required />
              {mode !== "login" && <p id="password-hint" className="mt-2 text-xs text-[var(--theme-body)]">{t.passwordHint}</p>}
            </div>
          )}
          {(error || showLinkError) && <p role="alert" className="rounded-xl bg-[var(--theme-error-bg)] p-3 text-sm text-[var(--theme-error-text)]">{error || t.sessionNeeded}</p>}
          {success && <p role="status" className="rounded-xl bg-[var(--theme-control)] p-3 text-sm text-[var(--theme-link)]">{success}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-full bg-[var(--theme-primary)] px-6 py-3.5 font-bold text-[var(--theme-on-primary)] hover:bg-[var(--theme-primary-hover)] disabled:opacity-60">
            {loading ? t.working : { register: t.register, login: t.login, forgot: t.sendReset, reset: t.savePassword, verify: "" }[mode]}
          </button>
          {mode === "login" && <p className="text-center text-sm"><Link href="/forgot-password" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{t.forgotLink}</Link></p>}
          {mode === "login" && <p className="text-center text-sm text-[var(--theme-body)]">{t.needAccount} <Link href="/register" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{t.register}</Link></p>}
          {mode === "register" && <p className="text-center text-sm text-[var(--theme-body)]">{t.haveAccount} <Link href="/login" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{t.login}</Link></p>}
          {(mode === "forgot" || mode === "reset") && <p className="text-center text-sm"><Link href="/login" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{t.backLogin}</Link></p>}
        </form>
      )}
    </AuthShell>
  );
}
