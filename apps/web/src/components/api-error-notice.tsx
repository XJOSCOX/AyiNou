"use client";

import { ApiRequestError } from "@/lib/api-errors";
import { errorMessages, localizedApiError } from "@/lib/error-i18n";
import { useLocale } from "@/lib/locale-store";
import { institutionErrorBox, institutionLink } from "./institution-ui";

export function ApiErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  const [locale] = useLocale();
  const t = errorMessages[locale];
  return (
    <div className={institutionErrorBox}>
      <p role="alert">{localizedApiError(locale, error)}</p>
      {error instanceof ApiRequestError && error.requestId && <p className="mt-2 break-all text-xs">{t.reference} · {error.requestId}</p>}
      {retry && <button type="button" className={`${institutionLink} mt-2`} onClick={retry}>{t.retry}</button>}
    </div>
  );
}
