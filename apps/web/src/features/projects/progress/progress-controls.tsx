import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionLink, institutionAction, institutionField } from "@/components/institution-ui";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { type ProgressSection, type ProgressInput, changeProgress } from "@/lib/project-progress-api";
import { projectProgressMessages } from "@/lib/project-progress-i18n";
import { projectWorkMessages } from "@/lib/project-work-i18n";
import { type ProjectProgressEvent } from "@ayinou/shared";
import Link from "next/link";
import { type ReactNode, useRef } from "react";

export const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export const nullable = (data: FormData, key: string) => value(data, key) || null;

export const actionRow = "flex flex-wrap items-start gap-3";

export type Controls = { id: string; refresh: () => void };

export function useProgressText() {
  const [locale] = useLocale();
  return { locale, t: projectProgressMessages[locale], workText: projectWorkMessages[locale] };
}

export function Change({ id, refresh, section, action, data, read, children }: Controls & {
  section: ProgressSection; action: ProjectProgressEvent; data?: ProgressInput; read?: (fields: FormData) => ProgressInput; children?: ReactNode;
}) {
  const { t, locale } = useProgressText();
  const mutation = useFeedMutation();
  const key = useRef<string | null>(null);
  return <form className="grid min-w-0 gap-2" onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = { ...data, ...read?.(new FormData(form)) };
    if (action === "entry_create" || action === "milestone_create") input.key = key.current ??= crypto.randomUUID();
    void mutation.run(async () => {
      await changeProgress(id, section, action, input);
      key.current = null;
      form.reset();
      refresh();
    });
  }}>
    {children}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
    {apiErrorCode(mutation.error) === "MFA_REQUIRED" &&
      <Link href={"/mfa?next=/projects/" + id + "/work"} className={institutionLink}>{t.authenticator}</Link>}
    <button className={institutionAction} disabled={mutation.busy}>{mutation.busy ? authMessages[locale].working : t.actions[action]}</button>
  </form>;
}

export function Reason() {
  const { t } = useProgressText();
  return <label>{t.reason}<textarea className={institutionField} name="reason" minLength={3} maxLength={600} rows={2} required /></label>;
}
