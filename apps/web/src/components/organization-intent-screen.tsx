"use client";

import Link from "next/link";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import type { OrganizationIntentReceipt, OrganizationIntentUpdate, OrganizationOnboardingIntent } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { ApiRequestError, apiErrorCode } from "@/lib/api-errors";
import { useLocale } from "@/lib/locale-store";
import { organizationOnboardingMessages } from "@/lib/organization-onboarding-i18n";
import { browserSupabase } from "@/lib/supabase/browser";
import { institutionAction, institutionCard, institutionLink } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

const path = "/api/v1/me/organization-onboarding";
type Command = {
  url: string;
  method: "PUT" | "POST";
  body: OrganizationIntentUpdate | { expectedVersion: number; requestId: string };
};

export function OrganizationIntentScreen({ subject, profileComplete }: { subject: string; profileComplete: boolean }) {
  const [locale] = useLocale();
  const t = organizationOnboardingMessages[locale];
  const [intent, setIntent] = useState<OrganizationOnboardingIntent | null | undefined>();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<"saved" | "cancelled" | null>(null);
  const [pending, setPending] = useState<Command | null>(null);
  const [changed, setChanged] = useState(false);
  const active = useRef<AbortController | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    const { data: { subscription } } = browserSupabase().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user.id === subject) return;
      controller.abort();
      setIntent(undefined);
      setPending(null);
      setChanged(true);
    });
    void authorizedRequest(path, { signal: controller.signal }, subject)
      .then(({ intent: current }: { intent: OrganizationOnboardingIntent | null }) => {
        if (!controller.signal.aborted) setIntent(current);
      }).catch((cause) => {
        if (!controller.signal.aborted) setError(apiErrorCode(cause));
      });
    return () => {
      controller.abort();
      subscription.unsubscribe();
    };
  }, [subject, revision]);

  function reload() {
    setError("");
    setNotice(null);
    setConfirm(false);
    setPending(null);
    setIntent(undefined);
    setRevision((value) => value + 1);
  }

  async function run(command: Command) {
    const controller = active.current;
    if (!controller || controller.signal.aborted || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice(null);
    setPending(null);
    try {
      const receipt: OrganizationIntentReceipt = await authorizedRequest(command.url, {
        method: command.method,
        body: JSON.stringify(command.body),
        signal: controller.signal,
      }, subject);
      if (controller.signal.aborted) return;
      const cancelled = receipt.intent.stage === "cancelled";
      setIntent(cancelled ? null : receipt.intent);
      setNotice(cancelled ? "cancelled" : "saved");
      setConfirm(false);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(apiErrorCode(cause));
      if (cause instanceof ApiRequestError && (cause.status === 0 || cause.status >= 500)) setPending(command);
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function save(stage: OrganizationIntentUpdate["stage"]) {
    void run({ url: path, method: "PUT", body: {
      id: intent?.id ?? null, expectedVersion: intent?.version ?? 0, requestId: crypto.randomUUID(), stage,
    } });
  }

  function cancel() {
    if (!intent) return;
    void run({ url: path + "/" + intent.id + "/change-path", method: "POST", body: {
      expectedVersion: intent.version, requestId: crypto.randomUUID(),
    } });
  }

  const sessionLost = changed || error === "UNAUTHORIZED" || error === "SESSION_CHANGED";
  const stale = error === "STALE_VERSION" || error === "IDEMPOTENCY_CONFLICT" || error === "NOT_FOUND";
  const message = sessionLost ? t.session : stale ? t.stale : error === "DEPENDENCY_BLOCKED" ? t.dependency
    : error === "LIMIT_REACHED" ? t.rate : t.failed;

  return (
    <MemberShell>
      <div className="grid gap-5">
        <PageHeader title={t.title} description={t.intro} />
        <section className={institutionCard} aria-busy={busy}>
          {notice && !sessionLost && <p role="status" className="mb-3">{t[notice]}</p>}
          {(error || sessionLost) && <p role="alert" className="mb-3">{message}</p>}
          {sessionLost ? <Link href="/login" className={institutionLink}>{t.retry}</Link>
            : intent === undefined && !error ? <p role="status">{t.loading}</p>
            : stale || (intent === undefined && error) ? <button type="button" className={institutionAction} onClick={reload}>{t.refresh}</button>
            : <>
              {intent && intent.stage !== "cancelled" && <div className="mb-4">
                <p className="font-semibold">{t[intent.stage]}</p>
                <p className="mt-1 text-[var(--theme-body)]">{t.pending}</p>
              </div>}
              <div className="flex flex-wrap items-center gap-3">
                {pending ? <><button type="button" className={institutionAction} onClick={() => void run(pending)}>{t.retry}</button>
                  <button type="button" className={institutionLink} onClick={reload}>{t.refresh}</button></>
                : confirm ? <>
                  <p className="w-full">{t.confirm}</p>
                  <button type="button" className={institutionAction} disabled={busy} onClick={cancel}>{t.cancelPath}</button>
                  <button type="button" className={institutionLink} disabled={busy} onClick={() => setConfirm(false)}>{t.keep}</button>
                </> : <>
                  {!profileComplete ? <Link href="/onboarding" className={institutionAction}>{t.personalFirst}</Link>
                    : intent?.stage === "awaiting_identity" ? <Link href="/verification?kind=identity" className={institutionAction}>{t.verify}</Link>
                    : <button type="button" className={institutionAction} disabled={busy} onClick={() => save(intent?.stage === "drafting" ? "awaiting_identity" : "drafting")}>
                      {intent?.stage === "drafting" ? t.save : t.start}
                    </button>}
                  {intent && <button type="button" className={institutionLink} disabled={busy} onClick={() => setConfirm(true)}>{t.cancelPath}</button>}
                </>}
              </div>
            </>}
        </section>
      </div>
    </MemberShell>
  );
}
