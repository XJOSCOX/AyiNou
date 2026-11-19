"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Factor } from "@supabase/supabase-js";
import { referralCodePattern } from "@ayinou/shared";
import { AuthShell } from "./auth-shell";
import { accountMessages } from "@/lib/account-i18n";
import { validateReferralCode } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { membershipMessages } from "@/lib/membership-i18n";
import { isLocale } from "@/lib/i18n";
import styles from "./auth-screen.module.css";

export type AuthMode = "register" | "login" | "verify" | "forgot" | "reset";

const fieldClass = "block w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-4 text-[var(--theme-text)] outline-none focus:border-[var(--theme-link)] focus:ring-2 focus:ring-[var(--theme-link)]/20";
const floatingFieldClass = `${fieldClass} ${styles.floatingInput} pb-2 pt-6`;
const primaryActionClass = "w-full rounded-md bg-[var(--theme-primary)] px-6 py-3.5 font-semibold text-[var(--theme-on-primary)] hover:bg-[var(--theme-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)]";

export function AuthScreen({ mode, invalidLink = false, initialReferral = "" }: {
  mode: AuthMode; invalidLink?: boolean; initialReferral?: string;
}) {
  const [locale, setLocale] = useLocale();
  const t = authMessages[locale];
  const m = membershipMessages[locale];
  const account = accountMessages[locale];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [referral, setReferral] = useState(initialReferral);
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
        const code = referral.trim().toUpperCase();
        if (code && (!referralCodePattern.test(code) || !await validateReferralCode(code))) {
          setError(account.invalidReferral);
          return;
        }
        const { error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
            data: {
              display_name: displayName.trim(), preferred_locale: locale, first_name: firstName.trim(), last_name: lastName.trim(),
              ...(code ? { referral_code: code } : {}),
            },
          },
        });
        if (authError?.code === "email_address_not_authorized") {
          setError(t.confirmationUnavailable);
          return;
        }
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
        if (recoveryError && !["user_not_found", "email_address_not_authorized"].includes(recoveryError.code ?? "")) {
          throw recoveryError;
        }
        setSuccess(t.resetSent);
      } else if (mode === "reset") {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) { setError(t.sessionNeeded); return; }
        const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error) throw assurance.error;
        if (userData.user.factors?.some((factor: Factor) => factor.status === "verified") && assurance.data.currentLevel !== "aal2") {
          router.replace("/mfa?next=/reset-password");
          return;
        }
        const { error: resetError } = await supabase.auth.updateUser({ password });
        if (resetError) throw resetError;
        await supabase.auth.signOut();
        setSuccess(t.resetDone);
        setPassword("");
      }
    } catch (cause) {
      const status = typeof cause === "object" && cause && "status" in cause ? Number(cause.status) : 0;
      setError(status === 429 || (cause instanceof Error && cause.message === "RATE_LIMITED")
        ? m.rateLimited : !status || status >= 500 ? m.serviceError : t.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm leading-7 text-[var(--theme-body)]">{intro}</p>

      {mode === "verify" ? (
        <Link href="/login" className={`${primaryActionClass} mt-6 block text-center`}>{t.backLogin}</Link>
      ) : (
        <form onSubmit={submit} className={`mt-6 ${mode === "register" ? "space-y-4" : "space-y-5"}`} aria-busy={loading} noValidate>
          {mode === "register" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="relative block">
                  <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" maxLength={80} className={floatingFieldClass} placeholder=" " aria-describedby="private-names" required />
                  <span className={styles.fieldLabel}>{m.firstName}</span>
                </label>
                <label className="relative block">
                  <input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" maxLength={80} className={floatingFieldClass} placeholder=" " aria-describedby="private-names" required />
                  <span className={styles.fieldLabel}>{m.lastName}</span>
                </label>
              </div>
              <p id="private-names" className="text-xs text-[var(--theme-body)]">{m.privateNames}</p>
              <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                <label className="relative block" htmlFor="display-name">
                  <input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={floatingFieldClass} placeholder=" " autoComplete="nickname" required minLength={2} maxLength={80} />
                  <span className={styles.fieldLabel}>{t.displayName}</span>
                </label>
                <label className="relative block">
                  <select className={floatingFieldClass} value={locale} onChange={(event) => {
                    if (isLocale(event.target.value)) setLocale(event.target.value);
                  }}>
                    <option value="ht">Kreyòl ayisyen</option><option value="fr">Français</option><option value="en">English</option>
                  </select>
                  <span className={styles.fieldLabel}>{t.preferredLanguage}</span>
                </label>
              </div>
            </>
          )}
          {mode !== "reset" && (
            <div className="relative">
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className={floatingFieldClass} placeholder=" " autoComplete="email" required />
              <label htmlFor="email" className={styles.fieldLabel}>{t.email}</label>
            </div>
          )}
          {mode !== "forgot" && (
            <div>
              <div className="relative">
                <input id="password" type={visiblePassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={`${floatingFieldClass} ${styles.passwordInput} pe-14`}
                  placeholder=" " autoComplete={mode === "login" ? "current-password" : "new-password"} aria-describedby={mode !== "login" ? "password-hint" : undefined} required />
                <label htmlFor="password" className={styles.fieldLabel}>{mode === "reset" ? t.newPassword : t.password}</label>
                <button type="button" aria-controls="password" aria-label={visiblePassword ? m.hidePassword : m.showPassword}
                  className="absolute end-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-md text-[var(--theme-body)] hover:bg-[var(--theme-selected)] hover:text-[var(--theme-link)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)]"
                  onClick={() => setVisiblePassword((shown) => !shown)}>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {visiblePassword ? (
                      <>
                        <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.3a9 9 0 0 1 2.1-.3c5.5 0 9 7 9 7a15 15 0 0 1-2 2.8M6.3 6.7A17.8 17.8 0 0 0 3 12s3.5 7 9 7a9.2 9.2 0 0 0 4.1-1" />
                      </>
                    ) : (
                      <>
                        <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
                        <circle cx="12" cy="12" r="2.5" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
              {mode !== "login" && <p id="password-hint" className="mt-2 text-xs text-[var(--theme-body)]">{t.passwordHint}</p>}
            </div>
          )}
          {mode === "register" && (
            <label className="relative block">
              <input value={referral} onChange={(event) => setReferral(event.target.value)} className={floatingFieldClass}
                placeholder=" " autoComplete="off" autoCapitalize="characters" maxLength={64} spellCheck={false} />
              <span className={styles.fieldLabel}>{account.optionalReferral}</span>
            </label>
          )}
          {(error || showLinkError) && <p role="alert" className="rounded-md bg-[var(--theme-error-bg)] p-3 text-sm text-[var(--theme-error-text)]">{error || t.sessionNeeded}</p>}
          {success && <p role="status" className="rounded-md bg-[var(--theme-control)] p-3 text-sm text-[var(--theme-link)]">{success}</p>}
          {mode === "login" && <p className="text-right text-sm"><Link href="/forgot-password" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{t.forgotLink}</Link></p>}
          <button type="submit" disabled={loading} className={`${primaryActionClass} disabled:opacity-60`}>
            {loading ? t.working : { register: t.register, login: t.login, forgot: t.sendReset, reset: t.savePassword, verify: "" }[mode]}
          </button>
          {mode === "login" && <p className="border-t border-[var(--theme-border)] pt-5 text-center text-sm text-[var(--theme-body)]">{t.needAccount} <Link href="/register" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{t.register}</Link></p>}
          {mode === "register" && <p className="border-t border-[var(--theme-border)] pt-5 text-center text-sm text-[var(--theme-body)]">{t.haveAccount} <Link href="/login" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{t.login}</Link></p>}
          {(mode === "forgot" || mode === "reset") && <p className="text-center text-sm"><Link href="/login" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{t.backLogin}</Link></p>}
        </form>
      )}
    </AuthShell>
  );
}
