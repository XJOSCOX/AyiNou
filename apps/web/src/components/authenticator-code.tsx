"use client";

import { useState, type FormEvent } from "react";
import { accountMessages } from "@/lib/account-i18n";
import { useLocale } from "@/lib/locale-store";

export const mfaActionClass = "rounded-md bg-[var(--theme-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--theme-on-primary)] hover:bg-[var(--theme-primary-hover)] disabled:opacity-60";

export function AuthenticatorCode({ busy, submitCode }: { busy: boolean; submitCode: (code: string) => void }) {
  const [locale] = useLocale();
  const t = accountMessages[locale];
  const [code, setCode] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && /^[0-9]{6}$/.test(code)) submitCode(code);
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2" aria-busy={busy}>
      <label className="grid gap-1.5 text-sm font-semibold">
        {t.mfaCode}
        <input value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          className="min-h-10 max-w-44 rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-3"
          inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" />
      </label>
      <button type="submit" disabled={busy || code.length !== 6} className={mfaActionClass}>{t.mfaSubmit}</button>
    </form>
  );
}
