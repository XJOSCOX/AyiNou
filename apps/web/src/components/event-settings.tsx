"use client";

import Link from "next/link";
import { useState } from "react";
import { loadEventNotices, loadEventReports, writeEvent } from "@/lib/events-api";
import { eventMessages } from "@/lib/events-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { eventSecondary } from "./events";
import { institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PageHeader } from "./page-header";

export function EventNoticePreference() {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  const resource = useInstitutionResource(loadEventNotices);
  const mutation = useFeedMutation();
  const [saved, setSaved] = useState<boolean | null>(null);
  return <section className={institutionCard} aria-label={t.notificationSetting}>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {resource.data && <label className="flex min-h-10 items-center gap-2">
      <input type="checkbox" checked={saved ?? resource.data.enabled} disabled={mutation.busy} onChange={(e) => {
        const enabled = e.target.checked;
        void mutation.run(async () => { await writeEvent("PUT","/notification-preference",{ enabled }); setSaved(enabled); });
      }} />{t.notificationSetting}
    </label>}
  </section>;
}

export function EventModeration() {
  const [locale] = useLocale();
  const t = eventMessages[locale];
  const [revision, setRevision] = useState(0);
  const reports = useCursorPage(loadEventReports,revision);
  const mutation = useFeedMutation();
  return <MemberShell><section className="grid gap-4">
    <PageHeader title={t.moderation} />
    {reports.error !== null && <ApiErrorNotice error={reports.error} retry={reports.retry} />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {!reports.page && !reports.error && <p role="status">{t.loading}</p>}
    {reports.page?.rows.length === 0 && <p className={institutionCard}>{t.empty}</p>}
    {reports.page?.rows.map((report) => <article key={report.id} className={institutionCard + " grid gap-3"}>
      <h2><Link className={institutionLink} href={"/events/" + report.eventId}>{report.title}</Link></h2>
      {report.note && <p className="whitespace-pre-wrap break-words" dir="auto">{report.note}</p>}
      <form className="grid gap-3" onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void mutation.run(async () => {
          await writeEvent("POST","/moderation/reports/" + report.id,{ reason:form.get("reason"), action:form.get("action") });
          setRevision((n) => n + 1);
        });
      }}>
        <label>{t.reason}<textarea className={institutionField} name="reason" rows={2} minLength={10} maxLength={500} required /></label>
        <div className="flex flex-wrap gap-2">
          <select name="action" aria-label={t.moderation} className={institutionField}>
            {report.restricted ? <option value="restored">{t.restore}</option> : <option value="restricted">{t.restrict}</option>}
            {!report.restricted && <option value="dismissed">{t.dismiss}</option>}
          </select>
          <button className={eventSecondary} disabled={mutation.busy}>{t.filters}</button>
        </div>
      </form>
    </article>)}
    {reports.page?.nextCursor && <button className={eventSecondary} disabled={reports.loadingMore} onClick={() => { void reports.more(); }}>{t.more}</button>}
  </section></MemberShell>;
}
