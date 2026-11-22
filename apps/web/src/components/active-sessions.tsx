"use client";

import Link from "next/link";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ActiveSessionList, SessionRevocation } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { ApiRequestError } from "@/lib/api-errors";
import { useLocale } from "@/lib/locale-store";
import { openPrivateFlow, privateFlowPath, sessionsEndpoint } from "@/lib/session-security";
import { sessionSecurityMessages } from "@/lib/session-security-i18n";
import { browserSupabase } from "@/lib/supabase/browser";
import { AuthenticatorCode } from "./authenticator-code";
import { institutionAction, institutionLink } from "./institution-ui";

type Action = { target: string | null; workflow: boolean; requestId: string };

export function ActiveSessions({ subject }: { subject: string }) {
  const [locale] = useLocale();
  const t = sessionSecurityMessages[locale];
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const router = useRouter();
  const [inventory, setInventory] = useState<ActiveSessionList | null>(null);
  const [generation, setGeneration] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [feedback, setFeedback] = useState<"failed" | "revoked" | "unchanged" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { data: { subscription } } = browserSupabase().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user.id !== subject) {
        controller.abort();
        setEnded(true);
        setInventory(null);
      }
    });
    void authorizedRequest(sessionsEndpoint, { signal: controller.signal }, subject)
      .then((result: ActiveSessionList) => { if (!controller.signal.aborted) setInventory(result); })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiRequestError && cause.status === 401) setEnded(true);
        else setFeedback("failed");
      });
    return () => { controller.abort(); subscription.unsubscribe(); };
  }, [generation, subject]);

  function choose(target: string | null) {
    setAction({ target, workflow: target === null && !!inventory?.privileged, requestId: crypto.randomUUID() });
    setStepUp(false);
    setFeedback(null);
  }

  async function run(selected: Action, code?: string) {
    if (busy || ended) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (code) {
        const auth = browserSupabase().auth;
        const { data: session } = await auth.getSession();
        if (session.session?.user.id !== subject) { setEnded(true); return; }
        const { data } = await auth.mfa.listFactors();
        const factor = data?.totp[0];
        if (!factor || (await auth.mfa.challengeAndVerify({ factorId: factor.id, code })).error) {
          setFeedback("failed");
          return;
        }
      }
      if (selected.workflow) {
        const flow = await openPrivateFlow("revoke_other_sessions", subject);
        router.push(privateFlowPath(flow));
      } else {
        const result: SessionRevocation = await authorizedRequest(sessionsEndpoint + "/revoke", {
          method: "POST", body: JSON.stringify({ target: selected.target, requestId: selected.requestId }),
        }, subject);
        setFeedback(result.affected ? "revoked" : "unchanged");
      }
      setAction(null);
      setStepUp(false);
      setGeneration((value) => value + 1);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === "MFA_REQUIRED") setStepUp(true);
      else if (cause instanceof ApiRequestError && cause.status === 401) setEnded(true);
      else setFeedback("failed");
    } finally { setBusy(false); }
  }

  return <div className="mt-5 space-y-3 border-t border-[var(--theme-border)] pt-5">
    <h3 className="font-semibold">{t.active}</h3>
    <p className="text-sm text-[var(--theme-body)]">{t.sessionScope}</p>
    {ended ? <p role="status">{t.sessionEnded} <Link href="/login" className={institutionLink}>{t.signIn}</Link></p> : <>
      {feedback && <p role={feedback === "failed" ? "alert" : "status"}>{t[feedback]}</p>}
      {inventory ? <>
        <ul className="space-y-2">
          {inventory.sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--theme-control)] p-3">
              <div>
                <p className="font-semibold">{session.current ? t.current : t.other}</p>
                <dl id={"session-times-" + session.id} className="text-sm">
                  <div><dt className="inline">{t.started} </dt><dd className="inline">{format.format(new Date(session.createdAt))}</dd></div>
                  <div><dt className="inline">{t.expires} </dt><dd className="inline">{format.format(new Date(session.expiresAt))}</dd></div>
                  <div><dt className="inline">{t.remembered} </dt><dd className="inline">{session.remembered ? t.yes : t.no}</dd></div>
                </dl>
              </div>
              {!session.current && <button type="button" className={institutionLink} disabled={busy}
                aria-describedby={"session-times-" + session.id} onClick={() => choose(session.id)}>{t.single}</button>}
            </li>
          ))}
        </ul>
        {inventory.sessions.some((session) => !session.current) &&
          <button type="button" className={institutionLink} disabled={busy} onClick={() => choose(null)}>{t.others}</button>}
        {action && <div className="space-y-2">
          <p>{stepUp ? t.verify : action.target ? t.confirmSingle : t.confirmHelp}</p>
          {stepUp ? <AuthenticatorCode busy={busy} submitCode={(code) => void run(action, code)} />
            : <button type="button" className={institutionAction} disabled={busy} onClick={() => void run(action)}>{t.continue}</button>}
          <button type="button" className={institutionLink} disabled={busy} onClick={() => { setAction(null); setStepUp(false); }}>{t.cancel}</button>
        </div>}
      </> : feedback ? <button type="button" className={institutionLink} onClick={() => { setFeedback(null); setGeneration((value) => value + 1); }}>{t.retry}</button>
        : <p role="status">{t.loading}</p>}
    </>}
  </div>;
}
