"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { PrivateFlow } from "@ayinou/shared";
import { adminMessages } from "@/lib/admin-i18n";
import { adminEntryPath, type AdminTab } from "@/lib/admin-navigation";
import { authorizedRequest } from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { institutionMessages } from "@/lib/institution-i18n";
import { useLocale } from "@/lib/locale-store";
import { sessionSecurityMessages } from "@/lib/session-security-i18n";
import { openPrivateFlow, privateFlowPath, workflowsEndpoint } from "@/lib/session-security";
import { browserSupabase } from "@/lib/supabase/browser";
import { AdminWorkspace } from "./admin-workspace";
import { FeatureEnforcementPanel } from "./feature-enforcement";
import { VerificationReview } from "./verification-review";
import { institutionAction, institutionCard } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import styles from "./mfa-challenge.module.css";

export function SessionWorkspace({ subject, sessionId, flow, initialSection }: {
  subject: string; sessionId: string; flow: PrivateFlow; initialSection: AdminTab;
}) {
  const [locale] = useLocale();
  const router = useRouter();
  const [section, setSection] = useState(initialSection);
  const [state, setState] = useState<"active" | "renewing" | "closed" | "signedOut">("active");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestId = useRef<string | null>(null);
  const closing = useRef(false);
  const t = sessionSecurityMessages[locale];
  const delegated = flow.kind === "moderation_workspace";
  const admin = flow.kind === "admin_workspace" || delegated;
  const entry = admin ? adminEntryPath(section) : "/verification/review";
  const endpoint = workflowsEndpoint + "/" + flow.id + "/" + flow.step;

  useEffect(() => {
    const active = new AbortController();
    const expiresAt = Date.parse(flow.expiresAt);
    function expire() {
      setState((current) => current === "active" ? (admin && !closing.current ? "renewing" : "closed") : current);
    }
    const timeout = setTimeout(expire, Math.max(0, expiresAt - Date.now()));
    let authCheck: ReturnType<typeof setTimeout>;
    function checkAccess() {
      if (document.visibilityState !== "visible" || active.signal.aborted) return;
      if (Date.now() >= expiresAt) { expire(); return; }
      void authorizedRequest(endpoint, { signal: active.signal }, subject, sessionId).catch((cause) => {
        if (active.signal.aborted) return;
        const code = apiErrorCode(cause);
        setState((current) => current !== "active" ? current
          : code === "UNAUTHORIZED" || code === "SESSION_CHANGED" ? "signedOut" : "closed");
      });
    }
    const { data: { subscription } } = browserSupabase().auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (session?.user.id !== subject) setState("signedOut");
      else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        clearTimeout(authCheck);
        authCheck = setTimeout(checkAccess, 0);
      }
    });
    document.addEventListener("visibilitychange", checkAccess);
    return () => {
      active.abort();
      clearTimeout(authCheck);
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", checkAccess);
      subscription.unsubscribe();
    };
  }, [admin, endpoint, flow.expiresAt, sessionId, subject]);

  useEffect(() => {
    if (state !== "renewing") return;
    const active = new AbortController();
    const signal = AbortSignal.any([active.signal, AbortSignal.timeout(10_000)]);
    void openPrivateFlow(delegated ? "moderation_workspace" : "admin_workspace", subject, sessionId, signal).then((replacement) => {
      if (active.signal.aborted) return;
      if (replacement.id === flow.id) setState("closed");
      else router.replace(privateFlowPath(replacement, section));
    }).catch((cause) => {
      if (active.signal.aborted) return;
      const code = apiErrorCode(cause);
      if (code === "MFA_REQUIRED") router.replace(adminEntryPath(section, true));
      else setState(code === "UNAUTHORIZED" || code === "SESSION_CHANGED" ? "signedOut" : "closed");
    });
    return () => active.abort();
  }, [delegated, flow.id, router, section, sessionId, state, subject]);

  async function close() {
    if (closing.current) return;
    closing.current = true;
    setBusy(true);
    setFailed(false);
    requestId.current ??= crypto.randomUUID();
    try {
      await authorizedRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "cancel", expectedVersion: flow.version, requestId: requestId.current }),
      }, subject, sessionId);
      setState("closed");
    } catch {
      setFailed(true);
    } finally {
      closing.current = false;
      setBusy(false);
    }
  }

  if (state !== "active") {
    const renewing = state === "renewing";
    const signedOut = state === "signedOut";
    return <MemberShell>
      <div className="grid gap-4">
        <PageHeader title={admin ? adminMessages[locale].administration : institutionMessages[locale].review} />
        <section className={`${institutionCard} mx-auto grid w-full max-w-md justify-items-center gap-4 py-8 text-center`}
          aria-labelledby="workspace-status">
          <span className={styles.lock} aria-hidden="true" />
          <h2 id="workspace-status" className="text-xl font-semibold">
            {renewing ? t.workspaceRenewing : signedOut ? t.sessionEnded : t.unavailable}
          </h2>
          <p role="status" className="max-w-[38ch] text-sm text-[var(--theme-body)]">
            {renewing ? t.workspaceRenewingHelp : signedOut ? t.workspaceSignInHelp : t.expiredLink}
          </p>
          {!renewing && <Link href={signedOut ? "/login" : entry} className={institutionAction}>
            {signedOut ? t.signIn : admin ? t.openAdmin : t.openReview}
          </Link>}
        </section>
      </div>
    </MemberShell>;
  }

  const action = <div>
    <button type="button" disabled={busy} onClick={() => void close()}
      className="inline-flex min-h-10 items-center rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">
      {t.closeWorkspace}
    </button>
    {failed && <p role="alert">{t.failed}</p>}
  </div>;
  if (delegated) return <MemberShell><div className="grid gap-4">
    <PageHeader title={adminMessages[locale].administration} actions={action} />
    <FeatureEnforcementPanel workspace={flow.id} />
  </div></MemberShell>;
  return admin ? <AdminWorkspace workspaceId={flow.id} workspaceAction={action} section={section} onSectionChange={setSection} /> : <VerificationReview workspaceAction={action} workspaceId={flow.id} />;
}
