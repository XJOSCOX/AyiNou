import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { serverSupabase } from "@/lib/supabase/server";
import { validNewPassword } from "@/lib/password-policy";
import { defaultLocale, isLocale, localeCookie } from "@/lib/i18n";
import { privilegedSetupMessages } from "@/lib/privileged-setup-i18n";
import { founderCookie, founderEmailConfirmationEnabled, workflowId, workflowOrigin, workflowRequest } from "@/lib/privileged-setup-server";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };

const institutionAction = "rounded-md bg-[var(--theme-primary)] px-4 py-3 font-semibold text-[var(--theme-on-primary)]";
const institutionField = "mt-1 block w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-3 py-2";
const institutionLink = "font-semibold text-[var(--theme-link)] underline";

type Details = { email: string; username: string; signupUsername: string };

export default async function FounderSetup({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ result?: string }>;
}) {
  const { id } = await params;
  const jar = await cookies();
  const locale = jar.get(localeCookie)?.value ?? "";
  const t = privilegedSetupMessages[isLocale(locale) ? locale : defaultLocale];
  const result = (await searchParams).result;
  const path = "/setup/f/" + id;
  const endpoint = "/api/v1/setup/founder/" + id;
  if (!workflowId.test(id)) return <AuthShell><h1>{t.unavailable}</h1></AuthShell>;
  const authorization = jar.get(founderCookie(id))?.value;
  const form = authorization && await workflowRequest<Details>(endpoint, { action: "form", authorization });
  const status = form || await workflowRequest<{ open: boolean }>(endpoint);

  async function unlock(data: FormData) {
    "use server";
    const unlocked = await workflowRequest<{ authorization: string }>(endpoint, { action: "unlock", secret: data.get("secret") });
    if (!unlocked) redirect(path + "?result=try");
    (await cookies()).set(founderCookie(id), unlocked.authorization, {
      httpOnly: true, secure: workflowOrigin.startsWith("https:"), sameSite: "lax", path, maxAge: 1800,
    });
    redirect(path);
  }

  async function signup(data: FormData) {
    "use server";
    const cookie = (await cookies()).get(founderCookie(id))?.value;
    const details = cookie && await workflowRequest<Details>(endpoint, { action: "form", authorization: cookie });
    const password = data.get("password");
    if (!cookie || !details || typeof password !== "string" || password !== data.get("confirmation") || !validNewPassword(password)
      || !await founderEmailConfirmationEnabled()) redirect(path + "?result=try");
    const auth = await serverSupabase();
    const digest = createHash("sha256").update(cookie).digest("hex");
    const proof = createHash("sha256").update("r22-founder:" + digest).digest("hex");
    const { error } = await auth.auth.signUp({
      email: details.email, password,
      options: { emailRedirectTo: new URL("/auth/callback?next=" + path, workflowOrigin).href,
        data: { founder_signup_proof: proof, public_username: details.signupUsername, preferred_locale: isLocale(locale) ? locale : defaultLocale } },
    });
    redirect(path + (error ? "?result=try" : "?result=email"));
  }

  async function claim() {
    "use server";
    const cookie = (await cookies()).get(founderCookie(id))?.value;
    if (!cookie || !await workflowRequest(endpoint, { action: "claim", authorization: cookie }, true)) redirect(path + "?result=try");
    (await cookies()).set(founderCookie(id), "", { path, maxAge: 0 });
    redirect("/dashboard");
  }

  return <AuthShell>
    <h1 className="text-3xl font-semibold">{status ? t.founder : t.unavailable}</h1>
    {status && result === "try" && <p role="alert">{t.failed}</p>}
    {status && !form && <form action={unlock} className="mt-5 grid gap-3">
      <label>{t.secret}<input className={institutionField} name="secret" type="password" maxLength={43} required autoComplete="off" /></label>
      <button className={institutionAction}>{t.unlock}</button>
    </form>}
    {form && <div className="mt-5 grid gap-4">
      <p className="break-all">{form.email} · @{form.username}</p>
      {result === "email" && <p role="status">{t.email}</p>}
      {await founderEmailConfirmationEnabled() ? <form action={signup} className="grid gap-3">
        <label>{t.password}<input className={institutionField} type="password" name="password" autoComplete="new-password" required /></label>
        <label>{t.confirmPassword}<input className={institutionField} type="password" name="confirmation" autoComplete="new-password" required /></label>
        <button className={institutionAction}>{t.register}</button>
      </form> : <p role="status">{t.emailBlocked}</p>}
      <p>{t.mfa}</p>
      <Link href={"/mfa?next=" + encodeURIComponent(path)} className={institutionLink}>{t.mfa}</Link>
      <Link href="/settings" className={institutionLink}>{t.settings}</Link>
      <form action={claim}><button className={institutionAction}>{t.activate}</button></form>
    </div>}
  </AuthShell>;
}
