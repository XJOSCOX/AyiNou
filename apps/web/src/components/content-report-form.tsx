"use client";

import { useState, type FormEvent } from "react";
import { reportCategories, type ReportCategory } from "@ayinou/shared";
import { apiErrorCode } from "@/lib/api-errors";
import { feedMessages } from "@/lib/feed-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { institutionAction, institutionField, institutionLink } from "./institution-ui";

export function ContentReportForm({ submitReport, cancel, reported }: {
  submitReport: (category: ReportCategory, note: string) => Promise<void>;
  cancel: () => void;
  reported: () => void;
}) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const mutation = useFeedMutation();
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [note, setNote] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (category && await mutation.run(() => submitReport(category, note))) reported();
  }
  return <form className="mt-4 grid gap-3 border-t border-[var(--theme-border)] pt-4" onSubmit={submit} aria-busy={mutation.busy}>
    <label className="text-sm font-semibold">{t.reportReason}
      <select className={institutionField} value={category} required disabled={mutation.busy}
        onChange={(event) => setCategory(reportCategories.find((value) => value === event.target.value) ?? "")}>
        <option value="" disabled>—</option>
        {reportCategories.map((value) => <option value={value} key={value}>{t[value]}</option>)}
      </select>
    </label>
    <label className="text-sm font-semibold">{t.reportNote}
      <textarea className={institutionField} value={note} rows={3} maxLength={500} disabled={mutation.busy} onChange={(event) => setNote(event.target.value)} />
    </label>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {apiErrorCode(mutation.error) === "DUPLICATE_REPORT" ? null : <button type="submit" className={`${institutionAction} justify-self-start`}
      disabled={mutation.busy || !category}>{mutation.busy ? t.working : t.sendReport}</button>}
    <button type="button" className={`${institutionLink} justify-self-start`} disabled={mutation.busy} onClick={cancel}>{t.cancel}</button>
  </form>;
}
