"use client";

import Link from "next/link";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { PrivateFlow, PrivateFlowReceipt } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { ApiRequestError } from "@/lib/api-errors";
import { useLocale } from "@/lib/locale-store";
import { sessionSecurityMessages } from "@/lib/session-security-i18n";
import { workflowsEndpoint } from "@/lib/session-security";
import { browserSupabase } from "@/lib/supabase/browser";
import { institutionAction, institutionCard, institutionLink } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

type Command = { requestId: string; action: "complete" | "cancel"; expectedVersion: number };

export function PrivateWorkflowScreen({ subject, flow }: { subject: string; flow: PrivateFlow }) {
  const [locale] = useLocale();
  const t = sessionSecurityMessages[locale];
  const [busy, setBusy] = useState(false);
  const [command, setCommand] = useState<Command | null>(null);
  const [receipt, setReceipt] = useState<PrivateFlowReceipt | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const organization = flow.kind === "organization_draft";

  useEffect(() => {
    const { data: { subscription } } = browserSupabase().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user.id !== subject) setUnavailable(true);
    });
    return () => subscription.unsubscribe();
  }, [subject]);

  async function submit(action: Command["action"]) {
    if (busy || unavailable) return;
    const next = command?.action === action ? command : { action, expectedVersion: flow.version, requestId: crypto.randomUUID() };
    setCommand(next);
    setBusy(true);
    setFailed(false);
    try {
      const result: PrivateFlowReceipt = await authorizedRequest(workflowsEndpoint + "/" + flow.id + "/" + flow.step, {
        method: "POST", body: JSON.stringify(next),
      }, subject);
      setReceipt(result);
    } catch (cause) {
      if (cause instanceof ApiRequestError && [401, 403, 404].includes(cause.status)) setUnavailable(true);
      else setFailed(true);
    } finally { setBusy(false); }
  }

  return <MemberShell>
    <div className="grid gap-5">
      <PageHeader title={unavailable ? t.unavailable : organization ? t.resume : t.confirmOthers} />
      <section className={`${institutionCard} space-y-4`} aria-busy={busy}>
        {unavailable ? <p role="alert">{t.expiredLink}</p>
          : receipt ? <p role="status">{receipt.state === "completed" ? t.completed : t.cancelled}</p>
          : <>
            <p>{organization ? t.resumeHelp : t.confirmHelp}</p>
            <div className="flex flex-wrap items-center gap-3">
              {organization ? <Link href="/organization-onboarding" className={institutionAction} prefetch={false}>{t.resume}</Link>
                : <button type="button" className={institutionAction} disabled={busy} onClick={() => void submit("complete")}>{t.others}</button>}
              <button type="button" className={institutionLink} disabled={busy} onClick={() => void submit("cancel")}>{t.cancelLink}</button>
            </div>
            {failed && <p role="alert">{t.failed}</p>}
          </>}
        <Link href={organization && !unavailable ? "/organization-onboarding" : "/settings"} className={institutionLink}>{t.back}</Link>
      </section>
    </div>
  </MemberShell>;
}
