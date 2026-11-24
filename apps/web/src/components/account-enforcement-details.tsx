"use client";

import type { AccountEnforcementNotice } from "@ayinou/shared";
import { adminMessages } from "@/lib/admin-i18n";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { useLocale } from "@/lib/locale-store";

export function EnforcementDetails({ notice, memberView = false }: { notice: AccountEnforcementNotice; memberView?: boolean }) {
  const [locale] = useLocale();
  const t = accountEnforcementMessages[locale];
  const format = new Intl.DateTimeFormat(locale, memberView
    ? { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }
    : { dateStyle: "medium", timeStyle: "short" });
  return <dl className="grid min-w-0 gap-1 text-sm sm:grid-cols-2">
    <div><dt className="font-semibold">{memberView ? t.memberReasonCategory : t.category}</dt><dd>{t[notice.category]}</dd></div>
    <div><dt className="font-semibold">{memberView ? t.memberStatus : adminMessages[locale].value}</dt>
      <dd>{adminMessages[locale][notice.kind]} · {t[notice.status]}</dd></div>
    <div><dt className="font-semibold">{t.starts}</dt><dd><time dateTime={notice.startsAt}>{format.format(new Date(notice.startsAt))}</time></dd></div>
    <div><dt className="font-semibold">{t.ends}</dt><dd>{notice.expiresAt
      ? <time dateTime={notice.expiresAt}>{format.format(new Date(notice.expiresAt))}</time> : t.indefinite}</dd></div>
    <div className="sm:col-span-2"><dt className="font-semibold">{t.reference}</dt><dd className="break-all">{notice.reference}</dd></div>
  </dl>;
}
