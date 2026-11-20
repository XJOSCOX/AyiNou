"use client";

import { privacyRequestKinds, type Locale, type PrivacyRequestDetail, type PrivacyRequestKind,
  type PrivacyRequestPage, type PrivacyRequestReceipt, type PrivacyRequestSummary } from "@ayinou/shared";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiErrorCode } from "@/lib/api-errors";
import { localizedApiError } from "@/lib/error-i18n";
import { useLocale } from "@/lib/locale-store";
import { privacyMessages } from "@/lib/privacy-i18n";
import { exportMessages } from "@/lib/privacy-export-i18n";
import { ownPrivacyRequest } from "@/lib/privacy-session";
import { browserSupabase } from "@/lib/supabase/browser";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";
import { PrivacyExportPanel } from "./privacy-export-panel";

const collection = "/api/v1/me/privacy-requests";
const card = "min-w-0 rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-6";
const action = "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--theme-button-border)] bg-[var(--theme-button)] px-4 py-2 text-sm font-semibold text-[var(--theme-text)] hover:bg-[var(--theme-button-hover)] disabled:opacity-60";

async function ownRequest<T>(actor: string, path: string, init: RequestInit): Promise<T> {
  return ownPrivacyRequest<T>(actor, collection + path, init);
}

function privacyError(locale: Locale, cause: unknown) {
  const t = privacyMessages[locale];
  switch (apiErrorCode(cause)) {
    case "PRIVACY_KEY_CONFLICT": return t.keyConflict;
    case "PRIVACY_STATE_CONFLICT": return t.stateConflict;
    case "PRIVACY_DISABLED": return t.disabled;
    case "PRIVACY_REVIEW_UNAVAILABLE": return t.reviewUnavailable;
    default: return localizedApiError(locale, cause);
  }
}

export function PrivacyRequests() {
  const [locale] = useLocale();
  const t = privacyMessages[locale];
  const [identity, setIdentity] = useState<string | null | undefined>();

  useEffect(() => {
    const { data: { subscription } } = browserSupabase().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setIdentity(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return <MemberShell>
    <div className="grid min-w-0 gap-5">
      <PageHeader title={t.title} description={t.settings}
        actions={<Link href="/settings" className={action}>{t.back}</Link>} />
      {identity ? <CaseWorkspace key={identity} actor={identity} locale={locale} />
        : <p className={card} role="status">{identity === null ? t.signedOut : t.loading}</p>}
    </div>
  </MemberShell>;
}

function CaseWorkspace({ actor, locale }: { actor: string; locale: Locale }) {
  const t = privacyMessages[locale];
  const [result, setResult] = useState<PrivacyRequestPage | "disabled" | null>(null);
  const [kind, setKind] = useState<PrivacyRequestKind>("access");
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<PrivacyRequestDetail | null>(null);
  const [confirmation, setConfirmation] = useState<{ item: PrivacyRequestSummary; key: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: "received" | "withdrawn"; id: string } | null>(null);
  const [fault, setFault] = useState<unknown>(null);
  const [working, setWorking] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    ownRequest<PrivacyRequestPage>(actor, "", { signal: controller.signal }).then((page) => {
      if (!controller.signal.aborted) setResult(page);
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (apiErrorCode(cause) === "PRIVACY_DISABLED") setResult("disabled");
      else setFault(cause);
    }).finally(() => {
      if (request.current === controller) request.current = null;
    });
    return () => { request.current?.abort(); };
  }, [actor]);

  async function perform(task: (signal: AbortSignal) => Promise<void>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setWorking(true);
    setFault(null);
    try {
      await task(controller.signal);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (apiErrorCode(cause) === "PRIVACY_DISABLED") {
        setResult("disabled");
        setConfirmation(null);
        setDetail(null);
        setNotice(null);
        setDraftKey(null);
      } else {
        const code = apiErrorCode(cause);
        if (code === "PRIVACY_STATE_CONFLICT") setConfirmation(null);
        if (code === "UNAUTHORIZED") {
          setResult(null);
          setConfirmation(null);
          setDetail(null);
          setNotice(null);
          setDraftKey(null);
        }
        setFault(cause);
      }
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setWorking(false);
    }
  }

  async function refresh(signal: AbortSignal, after?: string) {
    const page = await ownRequest<PrivacyRequestPage>(actor, after ? "?after=" + after : "", { signal });
    signal.throwIfAborted();
    setResult((current) => after && current && current !== "disabled"
      ? { ...page, cases: [...current.cases, ...page.cases] } : page);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void perform(async (signal) => {
      const key = draftKey ?? crypto.randomUUID();
      setDraftKey(key);
      const receipt = await ownRequest<PrivacyRequestReceipt>(actor, "", {
        method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ kind }), signal,
      });
      signal.throwIfAborted();
      setDraftKey(null);
      setNotice({ kind: "received", id: receipt.id });
      await refresh(signal);
    });
  }

  function withdraw() {
    if (!confirmation) return;
    const { item, key } = confirmation;
    void perform(async (signal) => {
      const receipt = await ownRequest<PrivacyRequestReceipt>(actor, "/" + item.id + "/withdraw", {
        method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ version: item.version }), signal,
      });
      signal.throwIfAborted();
      setConfirmation(null);
      setNotice({ kind: "withdrawn", id: receipt.id });
      setDetail(null);
      setResult((current) => current && current !== "disabled" ? {
        ...current,
        cases: current.cases.map((entry) => entry.id === receipt.id
          ? { ...entry, state: receipt.state, version: receipt.version, nextAction: "none" } : entry),
      } : current);
    });
  }

  return <>
    {fault ? <section className={card}>
      <p role="alert" className="text-[var(--theme-error-text)]">{privacyError(locale, fault)}</p>
      {!draftKey && !confirmation && <button type="button" className={action} disabled={working} onClick={() => {
        setDetail(null);
        void perform((signal) => refresh(signal));
      }}>{t.retry}</button>}
    </section> : null}
    {result === "disabled" ? <section className={card}>
      <p role="status">{t.disabled}</p>
      <p className="mt-2">{exportMessages[locale].disabled}</p>
      <dl className="mt-4 grid gap-4 md:grid-cols-2">
        {privacyRequestKinds.map((value) => <div key={value}>
          <dt className="font-semibold">{t.kinds[value].label}</dt>
          <dd className="text-sm text-[var(--theme-body)]">{t.kinds[value].description}</dd>
        </div>)}
      </dl>
    </section> : result ? <>
      <form className={card + " grid gap-3"} onSubmit={submit}>
        <p>{t.synthetic}</p>
        <label className="grid max-w-lg gap-2 font-semibold">
          {t.kind}
          <select className="min-h-11 min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3"
            value={kind} onChange={(event) => setKind(event.target.value as PrivacyRequestKind)} disabled={working || !!draftKey}>
            {privacyRequestKinds.map((value) => <option key={value} value={value}>{t.kinds[value].label}</option>)}
          </select>
        </label>
        <p className="text-sm text-[var(--theme-body)]">{t.kinds[kind].description}</p>
        {draftKey && !working && <p>{t.retrySame}</p>}
        <button className={action + " justify-self-start"} type="submit" disabled={working}>{draftKey ? t.retry : t.submit}</button>
      </form>
      {notice && <p role="status" className={card + " break-all"}>{t.success[notice.kind]} {notice.id}</p>}
      <section className={card + " grid gap-4"}>
        <h2 className="text-lg font-semibold">{t.cases}</h2>
        {result.cases.length === 0 && <p>{t.empty}</p>}
        <ul className="grid gap-3">
          {result.cases.map((item) => <li key={item.id} className="grid gap-2 border-t border-[var(--theme-border)] pt-3">
            <h3 className="font-semibold">{t.kinds[item.kind].label}</h3>
            <p>{t.status[item.state]} · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(locale)}</time></p>
            <p className="text-sm text-[var(--theme-body)]">{t.next[item.nextAction]}</p>
            <div className="flex flex-wrap gap-2">
              <button className={action} type="button" disabled={working || !!confirmation} onClick={() => void perform(async (signal) => {
                const current = await ownRequest<PrivacyRequestDetail>(actor, "/" + item.id, { signal });
                signal.throwIfAborted();
                setDetail(current);
              })}>{t.details}</button>
              {item.state === "received" && <button className={action} type="button" disabled={working || !!confirmation}
                onClick={() => setConfirmation({ item, key: crypto.randomUUID() })}>{t.withdraw}</button>}
            </div>
            {confirmation?.item.id === item.id && <div className="grid justify-items-start gap-2">
              <p>{t.confirm}</p>
              <div className="flex flex-wrap gap-2">
                <button className={action} type="button" disabled={working} onClick={withdraw}>{t.confirmAction}</button>
                <button className={action} type="button" disabled={working} onClick={() => setConfirmation(null)}>{t.cancel}</button>
              </div>
            </div>}
            {detail?.id === item.id && <><ol className="grid gap-1 text-sm">
              {detail.events.map((event) => <li key={event.version}>{t.status[event.state]} · <time dateTime={event.at}>
                {new Date(event.at).toLocaleString(locale)}</time></li>)}
            </ol>
            {item.kind === "export" && <PrivacyExportPanel key={item.id} actor={actor} locale={locale} item={item} />}
            </>}
          </li>)}
        </ul>
        {result.nextCursor && <button className={action + " justify-self-start"} type="button" disabled={working}
          onClick={() => void perform((signal) => refresh(signal, result.nextCursor ?? undefined))}>{t.more}</button>}
      </section>
    </> : !fault && <p role="status">{t.loading}</p>}
  </>;
}
