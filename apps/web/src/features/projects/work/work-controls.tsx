import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionLink, institutionAction, institutionField } from "@/components/institution-ui";
import { apiErrorCode } from "@/lib/api-errors";
import { authMessages } from "@/lib/auth-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { type WorkInput, runProjectWork } from "@/lib/project-work-api";
import { projectWorkMessages } from "@/lib/project-work-i18n";
import { type ProjectWork, type ProjectOperationEvent } from "@ayinou/shared";
import Link from "next/link";
import { type ReactNode, useRef } from "react";

export const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

export const actionsClass = "flex flex-wrap items-start gap-3";

export type WorkProps = { work: ProjectWork; refresh: () => void };

export function useWorkMessages() {
  const [locale] = useLocale();
  return { locale, t: projectWorkMessages[locale] };
}

export function Operation({ work, refresh, action, input, children, label, fields }: WorkProps & {
  action: ProjectOperationEvent; input?: WorkInput; children?: ReactNode; label?: string; fields?: (data: FormData) => WorkInput;
}) {
  const { t, locale } = useWorkMessages();
  const mutation = useFeedMutation();
  const idempotency = useRef<string | null>(null);
  return <form className="grid min-w-0 gap-2" onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = { ...input, ...fields?.(new FormData(form)) };
    if (action === "invite") data.key = idempotency.current ??= crypto.randomUUID();
    void mutation.run(async () => {
      await runProjectWork(work.projectId, action, data);
      if (action === "invite") idempotency.current = null;
      form.reset();
      refresh();
    });
  }}>
    {children}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} retry={refresh} signIn />}
    {apiErrorCode(mutation.error) === "MFA_REQUIRED" &&
      <Link className={institutionLink} href={"/mfa?next=/projects/" + work.projectId + "/work"}>{t.authenticator}</Link>}
    <button className={institutionAction} disabled={mutation.busy}>{mutation.busy ? authMessages[locale].working : label ?? t.events[action]}</button>
  </form>;
}

export function ReasonField() {
  const { t } = useWorkMessages();
  return <label>{t.reason}<textarea className={institutionField} name="reason" rows={2} minLength={3} maxLength={500} required /></label>;
}
