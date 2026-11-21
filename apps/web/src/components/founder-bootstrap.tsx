"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionAction, institutionErrorBox, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

const endpoint = "/api/v1/me/founder-bootstrap";
const load = (signal: AbortSignal): Promise<{ available: boolean }> => authorizedRequest(endpoint, { signal });

export function FounderBootstrap() {
  const [locale] = useLocale();
  const t = founderMessages[locale];
  const resource = useInstitutionResource(load);
  const [result, setResult] = useState<"claimed" | "mfa" | "invalid" | null>(null);
  const [busy, setBusy] = useState(false);
  if (!resource.data?.available && result !== "claimed") return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const credential = String(new FormData(form).get("credential") ?? "").trim();
    setBusy(true);
    setResult(null);
    try {
      await authorizedRequest(endpoint, { method: "POST", body: JSON.stringify({ credential }) });
      setResult("claimed");
      resource.refresh();
    } catch (cause) {
      setResult(cause instanceof Error && cause.message === "MFA_REQUIRED" ? "mfa" : "invalid");
    } finally {
      form.reset();
      setBusy(false);
    }
  }

  return <section className="mt-5 grid max-w-prose gap-3 border-t border-[var(--theme-border)] pt-4">
    <h3 className="text-lg font-semibold">{t.bootstrapTitle}</h3>
    {result === "claimed" ? <p role="status">{t.bootstrapComplete}{" "}
      <Link href="/admin" className={institutionLink}>{t.adminTitle}</Link>
    </p> : <>
      <p className="text-sm text-[var(--theme-body)]">{t.bootstrapHelp}</p>
      <form className="grid gap-3" onSubmit={submit} aria-busy={busy}>
        <label className="text-sm font-semibold">{t.bootstrapCredential}
          <input name="credential" type="password" className={institutionField} minLength={43} maxLength={43}
            autoComplete="off" spellCheck={false} required disabled={busy} />
        </label>
        <button type="submit" className={`${institutionAction} justify-self-start`} disabled={busy}>
          {busy ? authMessages[locale].working : t.bootstrapSubmit}
        </button>
      </form>
      {result === "mfa" && <p role="alert" className={institutionErrorBox}>
        <Link href="/mfa?next=/settings" className={institutionLink}>{t.verifySession}</Link>
      </p>}
      {result === "invalid" && <p role="alert" className={institutionErrorBox}>{t.bootstrapUnavailable}</p>}
    </>}
  </section>;
}
