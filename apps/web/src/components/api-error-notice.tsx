"use client";

import Link from "next/link";
import { ApiRequestError } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { errorMessages, localizedApiError } from "@/lib/error-i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionErrorBox, institutionLink } from "./institution-ui";

export function ApiErrorNotice({ error, retry, signIn = false }: { error: unknown; retry?: () => void; signIn?: boolean }) {
  const [locale] = useLocale();
  const t = errorMessages[locale];
  const expiredSession = signIn && error instanceof ApiRequestError && error.status === 401;
  return (
    <div className={institutionErrorBox}>
      <p role="alert">{localizedApiError(locale, error)}</p>
      {error instanceof ApiRequestError && error.requestId && <p className="mt-2 break-all text-xs">{t.reference} · {error.requestId}</p>}
      {expiredSession ? <Link href="/login" className={`${institutionLink} mt-2 inline-block`}>{authMessages[locale].login}</Link>
        : retry && <button type="button" className={`${institutionLink} mt-2`} onClick={retry}>{t.retry}</button>}
    </div>
  );
}
