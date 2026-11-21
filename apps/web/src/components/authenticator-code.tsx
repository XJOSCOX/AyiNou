"use client";

import { useId, useState, type FormEvent } from "react";
import { accountMessages } from "@/lib/account-i18n";
import { useLocale } from "@/lib/locale-store";
import styles from "./mfa-challenge.module.css";

export const mfaActionClass = "rounded-md bg-[var(--theme-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--theme-on-primary)] hover:bg-[var(--theme-primary-hover)] disabled:opacity-60";

export function AuthenticatorCode({ busy, submitCode, challenge }: {
  busy: boolean;
  submitCode: (code: string) => void;
  challenge?: { label: string; descriptionId: string; error?: string };
}) {
  const [locale] = useLocale();
  const t = accountMessages[locale];
  const [code, setCode] = useState("");
  const [caret, setCaret] = useState(0);
  const errorId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && /^[0-9]{6}$/.test(code)) submitCode(code);
  }

  return (
    <form onSubmit={submit} className={challenge ? styles.form : "mt-4 flex flex-wrap items-end gap-2"} aria-busy={busy}>
      <label className="grid gap-1.5 text-sm font-semibold">
        {challenge?.label ?? t.mfaCode}
        <span className={challenge ? styles.codeField : undefined}>
          {challenge && <span className={styles.codeGroups} aria-hidden="true">
            {[0, 3].map((start) => <span key={start} className={styles.codeGroup}>
              {[start, start + 1, start + 2].map((index) =>
                <span key={index} className={styles.digit} data-active={index === Math.min(caret, 5)}>
                  {code[index] ?? ""}
                </span>)}
            </span>)}
          </span>}
          <input value={code} onChange={(event) => {
            const value = event.currentTarget.value;
            setCode(value.replace(/[^0-9]/g, "").slice(0, 6));
            if (challenge) setCaret(value.slice(0, event.currentTarget.selectionStart ?? value.length).replace(/[^0-9]/g, "").length);
          }}
            onSelect={challenge ? (event) => setCaret(event.currentTarget.selectionStart ?? code.length) : undefined}
            className={challenge ? styles.codeInput : "min-h-10 max-w-44 rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-3"}
            aria-describedby={challenge?.error ? `${challenge.descriptionId} ${errorId}` : challenge?.descriptionId}
            aria-invalid={challenge?.error ? true : undefined}
            inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" />
        </span>
      </label>
      {challenge?.error && <p id={errorId} role="alert" className={styles.error}>{challenge.error}</p>}
      <button type="submit" disabled={busy || code.length !== 6}
        className={challenge ? `${mfaActionClass} ${styles.submit}` : mfaActionClass}>{t.mfaSubmit}</button>
    </form>
  );
}
