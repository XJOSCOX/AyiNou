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

export function ReviewCommand({ action, label, triggerLabel, confirmation, noteField = "note", minNote = 3, version, send, after, children, input, disclosureGroup }: {
  action: string; label?: string; triggerLabel?: string; confirmation?: string; noteField?: "note" | "reason"; minNote?: number; version: number;
  send: (body: string) => Promise<unknown>; after: () => void;
  children?: ReactNode; input?: (form: FormData) => object; disclosureGroup?: string;
}) {
  const { t } = useReviewCopy();
  const mutation = useFeedMutation();
  const commandLabel = label ?? t.actions[action as ReviewAction];
  const attempt = useRef<{ content: string; requestId: string } | null>(null);
  return <details name={disclosureGroup} className={disclosureGroup
    ? "group/compact min-w-0 rounded-md border border-[var(--theme-border)] [overflow-wrap:anywhere]"
    : "min-w-0 rounded-lg border border-[var(--theme-border)] p-3"}>
    <summary className={disclosureGroup
      ? "flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden"
      : "cursor-pointer font-medium"}>
      <span>{triggerLabel ?? commandLabel}</span>
      {disclosureGroup && <span aria-hidden="true" className="size-2 shrink-0 rotate-45 border-e border-b group-open/compact:rotate-[225deg]" />}
    </summary>
    <form className={disclosureGroup ? "grid min-w-0 gap-3 border-t border-[var(--theme-border)] p-3 text-sm" : "grid min-w-0 gap-3 pt-3"} onSubmit={(event) => {
      event.preventDefault();
      if (mutation.busy) return;
      const form = new FormData(event.currentTarget);
      const command = { action, expectedVersion: version, confirmed: true, [noteField]: String(form.get("note") ?? "").trim(), ...input?.(form) };
      const content = JSON.stringify(command);
      if (attempt.current?.content !== content) attempt.current = { content, requestId: crypto.randomUUID() };
      const requestId = attempt.current.requestId;
      void mutation.run(async () => { await send(JSON.stringify({ ...command, requestId })); attempt.current = null; after(); });
    }}>
      {children}
      <label>{t.note}<textarea className={institutionField} name="note" required minLength={minNote} maxLength={noteField === "reason" ? 500 : 1200} rows={disclosureGroup ? 2 : 3} />
        <span className="text-sm">{t.privacy}</span></label>
      <label className="flex items-start gap-2"><input type="checkbox" name="confirm" required />{confirmation ?? t.confirm}</label>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
      <div><button className={institutionAction} disabled={mutation.busy}>{mutation.busy ? t.submitting : commandLabel}</button></div>
    </form>
  </details>;
}

export function HistoryLabel({ action }: { action: string }) {
  const { t } = useReviewCopy();
  return action in t.actions ? t.actions[action as ReviewAction] : t.title;
}
