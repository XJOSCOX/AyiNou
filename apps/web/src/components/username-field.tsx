"use client";

import { useEffect, useId, useState } from "react";
import { normalizePublicUsername, publicUsernamePattern, type UsernameAvailability } from "@ayinou/shared";
import { getUsernameAvailability } from "@/lib/api";
import { useLocale } from "@/lib/locale-store";
import { usernameMessages } from "@/lib/username-i18n";

type CheckState = UsernameAvailability | "network";

export function useUsernameAvailability(value: string, enabled: boolean) {
  const candidate = normalizePublicUsername(value);
  const [check, setCheck] = useState<{ candidate: string; status: CheckState }>();
  const [attempt, setAttempt] = useState(0);
  const valid = publicUsernamePattern.test(candidate);
  useEffect(() => {
    if (!enabled || !valid) return;
    const request = new AbortController();
    const delay = window.setTimeout(() => {
      void getUsernameAvailability(candidate, request.signal).then(
        (status) => { if (!request.signal.aborted) setCheck({ candidate, status }); },
        () => { if (!request.signal.aborted) setCheck({ candidate, status: "network" }); },
      );
    }, 350);
    return () => {
      window.clearTimeout(delay);
      request.abort();
    };
  }, [attempt, candidate, enabled, valid]);
  const status: CheckState | "checking" | null = !enabled || !candidate ? null
    : !valid ? "invalid" : check?.candidate === candidate ? check.status : "checking";
  return {
    candidate,
    status,
    report: (result: CheckState) => setCheck({ candidate, status: result }),
    retry: () => { setCheck(undefined); setAttempt((current) => current + 1); },
  };
}

export function UsernameField({ value, onChange, check, className, existing, showPreview }: {
  value: string;
  onChange: (value: string) => void;
  check: ReturnType<typeof useUsernameAvailability>;
  className: string;
  existing?: boolean;
  showPreview?: boolean;
}) {
  const [locale] = useLocale();
  const t = usernameMessages[locale];
  const id = useId();
  const { status, candidate } = check;
  const blocked = status === "blocked";
  const suggestion = status === "taken" || status === "reserved" || status === "unavailable"
    ? candidate.slice(0, 21).replace(/_+$/, "") + "_ht" : null;
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block font-medium">{existing ? t.rename : t.choose}</label>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--theme-body)]">@</span>
        <input id={id} name="username" value={value} onChange={(event) => onChange(event.target.value)}
          className={className + " ps-8"} autoComplete="username" autoCapitalize="none" spellCheck={false}
          maxLength={24} required aria-describedby={id + "-hint " + id + "-status"}
          aria-invalid={status === "invalid" || blocked || status === "taken" || status === "reserved" || status === "unavailable"} />
      </div>
      <p id={id + "-hint"} className="text-xs text-[var(--theme-body)]">{t.guidance}</p>
      <p id={id + "-status"} role="status" aria-atomic="true" className="text-sm text-[var(--theme-body)]">{status && t[status]}</p>
      {status === "network" && <button type="button" onClick={check.retry} className="font-semibold text-[var(--theme-link)] underline">{t.retry}</button>}
      {suggestion && <button type="button" onClick={() => onChange(suggestion)} className="block font-semibold text-[var(--theme-link)] underline">
        {t.suggestion.replace("{username}", suggestion)}
      </button>}
      {blocked && <p className="text-sm">{t.review}{" "}
        <a href="mailto:contact@ayinou.com" className="text-[var(--theme-link)] underline">{t.contact}</a>
      </p>}
      {showPreview && publicUsernamePattern.test(candidate) && (
        <p className="break-words text-sm text-[var(--theme-body)]">
          {t.preview} · <bdi>@{candidate}</bdi>
        </p>
      )}
    </div>
  );
}
