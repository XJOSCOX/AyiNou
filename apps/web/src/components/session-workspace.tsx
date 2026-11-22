"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { PrivateFlow } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { useLocale } from "@/lib/locale-store";
import { sessionSecurityMessages } from "@/lib/session-security-i18n";
import { workflowsEndpoint } from "@/lib/session-security";
import { browserSupabase } from "@/lib/supabase/browser";
import { AdminWorkspace } from "./admin-workspace";
import { VerificationReview } from "./verification-review";
import { institutionLink } from "./institution-ui";
import { MemberShell } from "./member-shell";

export function SessionWorkspace({ subject, flow }: { subject: string; flow: PrivateFlow }) {
  const [locale] = useLocale();
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestId = useRef<string | null>(null);
  const t = sessionSecurityMessages[locale];
  const admin = flow.kind === "admin_workspace";
  const entry = admin ? "/admin" : "/verification/review";
  const endpoint = workflowsEndpoint + "/" + flow.id + "/" + flow.step;

  useEffect(() => {
    const active = new AbortController();
    const timeout = setTimeout(() => setClosed(true), Math.max(0, Date.parse(flow.expiresAt) - Date.now()));
    let authCheck: ReturnType<typeof setTimeout>;
    function checkAccess() {
      if (document.visibilityState !== "visible" || active.signal.aborted) return;
      void authorizedRequest(endpoint, { signal: active.signal }, subject).catch(() => {
        if (!active.signal.aborted) setClosed(true);
      });
    }
    const { data: { subscription } } = browserSupabase().auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (session?.user.id !== subject) setClosed(true);
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
  }, [endpoint, flow.expiresAt, subject]);

  async function close() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    requestId.current ??= crypto.randomUUID();
    try {
      await authorizedRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "cancel", expectedVersion: flow.version, requestId: requestId.current }),
      }, subject);
      setClosed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (closed) return <MemberShell>
    <p role="status">{t.expiredLink} <Link href={entry} className={institutionLink}>{t.back}</Link></p>
  </MemberShell>;
  const action = <div>
    <button type="button" disabled={busy} onClick={() => void close()} className={institutionLink}>{t.closeWorkspace}</button>
    {failed && <p role="alert">{t.failed}</p>}
  </div>;
  return admin ? <AdminWorkspace workspaceId={flow.id} workspaceAction={action} /> : <VerificationReview workspaceAction={action} workspaceId={flow.id} />;
}
