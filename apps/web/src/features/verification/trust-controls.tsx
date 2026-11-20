import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionLink, institutionField } from "@/components/institution-ui";
import { adminMessages } from "@/lib/admin-i18n";
import { apiErrorCode } from "@/lib/api-errors";
import { useLocale } from "@/lib/locale-store";
import { trustMessages } from "@/lib/trust-i18n";
import Link from "next/link";
import { type FormEvent } from "react";

export const fields = (event: FormEvent<HTMLFormElement>) => new FormData(event.currentTarget);

export const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export const links = (form: FormData) => field(form, "references").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export function TrustError({ error, retry, returnTo }: { error: unknown; retry?: () => void; returnTo?: "/admin" | "/verification/review" }) {
  const [locale] = useLocale();
  return <>
    <ApiErrorNotice error={error} retry={retry} signIn />
    {returnTo && apiErrorCode(error) === "MFA_REQUIRED" && <Link className={institutionLink}
      href={`/mfa?next=${encodeURIComponent(returnTo)}`}>{adminMessages[locale].verifyNow}</Link>}
  </>;
}

export function ExplanationFields() {
  const [locale] = useLocale();
  const t = trustMessages[locale];
  return <>
    <label className="text-sm font-semibold">{t.explanation}
      <textarea name="explanation" className={institutionField} rows={3} minLength={10} maxLength={1000} required />
    </label>
    <label className="text-sm font-semibold">{t.references}
      <textarea name="references" className={institutionField} rows={2} maxLength={905} />
    </label>
  </>;
}

export function PublicReferences({ references }: { references: string[] }) {
  const [locale] = useLocale();
  if (!references.length) return null;
  return <div><p className="text-sm font-semibold">{trustMessages[locale].references}</p>
    <ul className="space-y-1">
      {references.map((url) => <li key={url} className="break-all">
        <a className={institutionLink} href={url} target="_blank" rel="noreferrer">{url}</a>
      </li>)}
    </ul>
  </div>;
}
