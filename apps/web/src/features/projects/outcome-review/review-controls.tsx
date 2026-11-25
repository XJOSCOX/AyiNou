import { useRef, type ReactNode } from "react";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionField } from "@/components/institution-ui";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { outcomeReviewMessages } from "@/lib/project-outcome-review-i18n";

export type ReviewAction = keyof typeof outcomeReviewMessages.en.actions;

export function useReviewCopy() {
  const [locale] = useLocale();
  return { locale, t: outcomeReviewMessages[locale] };
}

export function ReviewCommand({ action, version, send, after, children, input }: {
  action: ReviewAction; version: number; send: (body: string) => Promise<unknown>; after: () => void;
  children?: ReactNode; input?: (form: FormData) => object;
}) {
  const { t } = useReviewCopy();
  const mutation = useFeedMutation();
  const attempt = useRef<{ content: string; requestId: string } | null>(null);
  return <details className="min-w-0 rounded-lg border border-[var(--theme-border)] p-3">
    <summary className="cursor-pointer font-medium">{t.actions[action]}</summary>
    <form className="grid min-w-0 gap-3 pt-3" onSubmit={(event) => {
      event.preventDefault();
      if (mutation.busy) return;
      const form = new FormData(event.currentTarget);
      const command = { action, expectedVersion: version, confirmed: true, note: String(form.get("note") ?? "").trim(), ...input?.(form) };
      const content = JSON.stringify(command);
      if (attempt.current?.content !== content) attempt.current = { content, requestId: crypto.randomUUID() };
      const requestId = attempt.current.requestId;
      void mutation.run(async () => { await send(JSON.stringify({ ...command, requestId })); attempt.current = null; after(); });
    }}>
      {children}
      <label>{t.note}<textarea className={institutionField} name="note" required minLength={3} maxLength={1200} rows={3} />
        <span className="text-sm">{t.privacy}</span></label>
      <label className="flex items-start gap-2"><input type="checkbox" name="confirm" required />{t.confirm}</label>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
      <div><button className={institutionAction} disabled={mutation.busy}>{mutation.busy ? t.submitting : t.actions[action]}</button></div>
    </form>
  </details>;
}

export function HistoryLabel({ action }: { action: string }) {
  const { t } = useReviewCopy();
  return action in t.actions ? t.actions[action as ReviewAction] : t.title;
}
