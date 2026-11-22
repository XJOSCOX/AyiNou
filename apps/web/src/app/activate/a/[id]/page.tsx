import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { defaultLocale, isLocale, localeCookie } from "@/lib/i18n";
import { privilegedSetupMessages } from "@/lib/privileged-setup-i18n";
import { governanceMessages } from "@/lib/governance-i18n";
import { workflowId, workflowRequest } from "@/lib/privileged-setup-server";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };

const institutionAction = "rounded-md bg-[var(--theme-primary)] px-4 py-3 font-semibold text-[var(--theme-on-primary)]";
const institutionField = "mt-1 block w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-3 py-2";
const institutionLink = "font-semibold text-[var(--theme-link)] underline";

export default async function AdministratorActivation({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ result?: string }>;
}) {
  const { id } = await params;
  const preference = (await cookies()).get(localeCookie)?.value ?? "";
  const locale = isLocale(preference) ? preference : defaultLocale;
  const t = privilegedSetupMessages[locale];
  const g = governanceMessages[locale];
  const endpoint = "/api/v1/administrator-activation/" + id;
  const invitation = workflowId.test(id) && await workflowRequest<{
    ready: boolean;
    authorizationMode?: "founder_direct";
    state?: "awaiting_acceptance" | "activated" | "expired" | "withdrawn" | "unavailable";
  }>(endpoint, undefined, true);
  const failed = (await searchParams).result === "try";

  async function activate(data: FormData) {
    "use server";
    const outcome = await workflowRequest<{ authorizationMode?: "founder_direct" }>(endpoint,
      { code: data.get("code"), accept: data.get("accept") === "on" }, true);
    if (!outcome) redirect("/activate/a/" + id + "?result=try");
    redirect(outcome.authorizationMode === "founder_direct" ? "/activate/a/" + id : "/admin");
  }

  return <AuthShell>
    <h1 className="text-3xl font-semibold">{invitation ? t.administrator : t.unavailable}</h1>
    {!invitation && <Link className={institutionLink} href="/login">{t.signIn}</Link>}
    {invitation && invitation.authorizationMode === "founder_direct" && <p className="mt-4">{g.founderAuthorized}</p>}
    {invitation && !invitation.ready && <p className="mt-4" role="status">{invitation.state ? g[invitation.state] : t.pending}</p>}
    {invitation && invitation.state === "activated" && <Link href="/admin" className={institutionLink}>{g.governance}</Link>}
    {invitation && invitation.ready && <form action={activate} className="mt-5 grid gap-4">
      <Link href={"/mfa?next=" + encodeURIComponent("/activate/a/" + id)} className={institutionLink}>{t.mfa}</Link>
      <Link href="/settings" className={institutionLink}>{t.settings}</Link>
      {failed && <p role="alert">{t.failed}</p>}
      <label>{t.secret}<input className={institutionField} name="code" type="password" maxLength={43} autoComplete="off" required /></label>
      <label className="flex gap-2"><input name="accept" type="checkbox" required />{t.accept}</label>
      <button className={institutionAction}>{t.activate}</button>
    </form>}
  </AuthShell>;
}
