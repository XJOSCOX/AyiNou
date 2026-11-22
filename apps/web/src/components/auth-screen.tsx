"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completePasswordRecovery } from "@/app/reset-password/actions";
import { publicUsernamePattern, referralCodePattern, type SignupPath } from "@ayinou/shared";
import { organizationOnboardingMessages } from "@/lib/organization-onboarding-i18n";
import { AuthShell } from "./auth-shell";
import { accountMessages } from "@/lib/account-i18n";
import { getUsernameAvailability, validateReferralCode } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { browserSupabase } from "@/lib/supabase/browser";
import { membershipMessages } from "@/lib/membership-i18n";
import { validNewPassword } from "@/lib/password-policy";
import { passwordSecurityMessages } from "@/lib/password-security-i18n";
import { PasswordRequirements } from "./password-requirements";
import { UsernameField, useUsernameAvailability } from "./username-field";
import { usernameMessages } from "@/lib/username-i18n";
import styles from "./auth-screen.module.css";

export type AuthMode = "register" | "login" | "verify" | "forgot" | "reset";

const fieldClass = "block w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-4 text-[var(--theme-text)] outline-none focus:border-[var(--theme-link)] focus:ring-2 focus:ring-[var(--theme-link)]/20";
const floatingFieldClass = `${fieldClass} ${styles.floatingInput} pb-2 pt-6`;
const primaryActionClass = "w-full rounded-md bg-[var(--theme-primary)] px-6 py-3.5 font-semibold text-[var(--theme-on-primary)] hover:bg-[var(--theme-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-link)]";

export function AuthScreen({ mode, invalidLink = false, initialReferral = "", claimHandle, joinHandle, recoverySession, passwordReset }: {
  mode: AuthMode; invalidLink?: boolean; initialReferral?: string; claimHandle?: string; joinHandle?: string;
  recoverySession?: string; passwordReset?: boolean;
}) {
  const [locale] = useLocale();
  const t = authMessages[locale];
  const m = membershipMessages[locale];
  const account = accountMessages[locale];
  const passwordCopy = passwordSecurityMessages[locale];
  const creatingPassword = mode === "register" || mode === "reset";
  const errors = {
    usernameConflict: usernameMessages[locale].conflict, usernameNetwork: usernameMessages[locale].network,
    invalidEmail: t.invalidEmail, invalidPassword: passwordCopy.invalid,
    mismatch: passwordCopy.mismatch, samePassword: passwordCopy.samePassword, signOutPending: passwordCopy.signOutPending,
    invalidCredentials: t.invalidCredentials, invalidReferral: account.invalidReferral,
    invalidPrivateNames: m.invalidPrivateNames, confirmationUnavailable: t.confirmationUnavailable,
    sessionNeeded: t.sessionNeeded, rateLimited: m.rateLimited, serviceError: m.serviceError, genericError: t.genericError,
  };
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [username, setUsername] = useState("");
  const usernameCheck = useUsernameAvailability(username, mode === "register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [referral, setReferral] = useState(initialReferral);
  const [signupPath, setSignupPath] = useState<SignupPath>("individual");
  const signupSlides = useRef<HTMLDivElement>(null);
  const signup = organizationOnboardingMessages[locale];
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<keyof typeof errors | "">("");
  const [success, setSuccess] = useState<"resetSent" | "resetDone" | "">(passwordReset ? "resetDone" : "");
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
    if (loading || passwordChanged) return;
    setShowLinkError(false);
    setError("");
    setSuccess("");
    if (mode !== "reset" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("invalidEmail"); return;
    }
    if (creatingPassword && !validNewPassword(password)) { setError("invalidPassword"); return; }
    if (creatingPassword && password !== confirmPassword) { setError("mismatch"); return; }
    if (mode === "login" && !password) { setError("invalidCredentials"); return; }
    if (mode === "register" && [firstName, lastName].some((name) =>
      !name.trim() || name.trim().length > 80 || /\p{Cc}/u.test(name.trim()))) {
      setError("invalidPrivateNames"); return;
    }
    if (mode === "register" && !publicUsernamePattern.test(usernameCheck.candidate)) {
      usernameCheck.report("invalid");
      setError("usernameConflict");
      return;
    }
    setLoading(true);
    try {
      const supabase = browserSupabase();
      if (mode === "register") {
        const status = usernameCheck.status === "available" ? "available"
          : await getUsernameAvailability(usernameCheck.candidate).catch(() => "network" as const);
        usernameCheck.report(status);
        if (status !== "available") {
          setError(status === "network" ? "usernameNetwork" : "usernameConflict");
          return;
        }
        const code = referral.trim().toUpperCase();
        if (code && (!referralCodePattern.test(code) || !await validateReferralCode(code))) {
          setError("invalidReferral");
          return;
        }
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
            data: {
              preferred_locale: locale, first_name: firstName.trim(), last_name: lastName.trim(),
              signup_path: signupPath, public_username: usernameCheck.candidate,
              ...(code ? { referral_code: code } : {}),
            },
          },
        });
        if (authError?.code === "email_address_not_authorized") {
          setError("confirmationUnavailable");
          return;
        }
        if (authError?.code === "weak_password") { setError("invalidPassword"); return; }
        if (authError) {
          // Auth reports a generic insertion failure when another signup wins the lease.
          if (authError.code === "unexpected_failure" || (authError.status ?? 0) >= 500) {
            const latest = await getUsernameAvailability(usernameCheck.candidate).catch(() => "network" as const);
            if (latest !== "available" && latest !== "network") {
              usernameCheck.report(latest);
              setError("usernameConflict");
              return;
            }
          }
          throw authError;
        }
        if (data.session) {
          router.replace("/onboarding");
          router.refresh();
        } else {
          router.push("/verify-email");
        }
      } else if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) {
          if (authError.status === 400 && ["invalid_credentials", "email_not_confirmed"].includes(authError.code ?? "")) {
            setError("invalidCredentials"); return;
          }
          throw authError;
        }
        if (claimHandle || joinHandle) {
          const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          const next = claimHandle ? `/verification?claim=${claimHandle}` : `/organization/${joinHandle}`;
          const challenge = claimHandle ? `/mfa?claim=${claimHandle}` : `/mfa?join=${joinHandle}`;
          router.replace(assurance.data?.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2"
            ? challenge : next);
        } else router.replace("/dashboard");
        router.refresh();
      } else if (mode === "forgot") {
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (recoveryError && !["user_not_found", "email_address_not_authorized"].includes(recoveryError.code ?? "")) {
          throw recoveryError;
        }
        setSuccess("resetSent");
      } else if (mode === "reset") {
        if (!recoverySession) { setError("sessionNeeded"); return; }
        const result = await completePasswordRecovery(password, confirmPassword, recoverySession);
        if (result === "mfa") { window.location.replace("/mfa?next=/reset-password"); return; }
        if (result === "done" || result === "signOutPending") {
          setPasswordChanged(true);
          setPassword("");
          setConfirmPassword("");
          if (result === "done") {
            window.location.replace("/login?reset=done");
            return;
          }
          const current = await supabase.auth.getClaims();
          if (current.data?.claims.session_id === recoverySession &&
            !(await supabase.auth.signOut({ scope: "local" })).error) window.location.replace("/login?reset=done");
          else setError("signOutPending");
        } else setError(result);
      }
    } catch (cause) {
      const status = typeof cause === "object" && cause && "status" in cause ? Number(cause.status) : 0;
      setError(status === 429 || (cause instanceof Error && cause.message === "RATE_LIMITED")
        ? "rateLimited" : !status || status >= 500 ? "serviceError" : "genericError");
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
            <fieldset className="grid min-w-0 gap-2" disabled={loading} aria-describedby="signup-path-help">
              <legend className="mb-2 font-semibold">{signup.choice}</legend>
              <div className="grid min-w-0 grid-cols-2 gap-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] p-1">
                {(["individual", "organization"] as const).map((path, index) => (
                  <label key={path} className="relative flex min-h-11 min-w-0 cursor-pointer items-center justify-center rounded-md px-2 py-2 text-center text-sm font-semibold has-checked:bg-[var(--theme-surface)] has-checked:text-[var(--theme-link)] focus-within:outline-2 focus-within:outline-[var(--theme-link)]">
                    <input type="radio" name="signup-path" value={path} checked={signupPath === path} className="absolute inset-0 size-full cursor-pointer opacity-0"
                      onChange={() => {
                        setSignupPath(path);
                        const track = signupSlides.current;
                        if (track) track.scrollTo({ left: index * track.clientWidth });
                      }} />
                    <span className="break-words">{signup[path]}</span>
                  </label>
                ))}
              </div>
              <div ref={signupSlides} className={styles.signupSlides} dir="ltr"
                onScroll={(event) => {
                  if (loading) return;
                  const { scrollLeft, clientWidth } = event.currentTarget;
                  if (clientWidth) setSignupPath(scrollLeft >= clientWidth / 2 ? "organization" : "individual");
                }}>
                {(["individual", "organization"] as const).map((path) => (
                  <div key={path} dir="auto" className="rounded-lg bg-[var(--theme-hero)] px-4 py-3"
                    aria-hidden={signupPath !== path}>
                    <strong className="block">{signup[path]}</strong>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--theme-body)]">{signup[`${path}Help`]}</p>
                  </div>
                ))}
              </div>
              <p id="signup-path-help" className="text-sm text-[var(--theme-body)]">{signup.explanation}</p>
            </fieldset>
          )}
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
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <UsernameField value={username} onChange={setUsername} check={usernameCheck} showPreview
                  className={fieldClass + " min-h-11 py-2"} />
                <label htmlFor="email" className="block min-w-0 space-y-1.5 font-medium">
                  <span className="block">{t.email}</span>
                  <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className={fieldClass + " min-h-11 py-2 font-normal"} autoComplete="email" required />
                </label>
              </div>
            </>
          )}
          {mode !== "reset" && mode !== "register" && (
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
                  placeholder=" " autoComplete={mode === "login" ? "current-password" : "new-password"} aria-describedby={creatingPassword ? "password-hint" : undefined} required />
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
              {creatingPassword && <PasswordRequirements password={password} />}
            </div>
          )}
          {creatingPassword && <label className="relative block" htmlFor="confirm-password">
            <input id="confirm-password" type={visiblePassword ? "text" : "password"} value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)} className={floatingFieldClass}
              placeholder=" " autoComplete="new-password" aria-invalid={error === "mismatch" || undefined} required />
            <span className={styles.fieldLabel}>{passwordCopy.confirm}</span>
          </label>}
          {mode === "register" && (
            <label className="relative block">
              <input value={referral} onChange={(event) => setReferral(event.target.value)} className={floatingFieldClass}
                placeholder=" " autoComplete="off" autoCapitalize="characters" maxLength={64} spellCheck={false} />
              <span className={styles.fieldLabel}>{account.optionalReferral}</span>
            </label>
          )}
          {(error || showLinkError) && <p role="alert" className="rounded-md bg-[var(--theme-error-bg)] p-3 text-sm text-[var(--theme-error-text)]">{error ? errors[error] : t.sessionNeeded}</p>}
          {success && <p role="status" className="rounded-md bg-[var(--theme-control)] p-3 text-sm text-[var(--theme-link)]">{t[success]}</p>}
          {mode === "login" && <p className="text-right text-sm"><Link href="/forgot-password" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{t.forgotLink}</Link></p>}
          <button type="submit" disabled={loading || passwordChanged} className={`${primaryActionClass} disabled:opacity-60`}>
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
