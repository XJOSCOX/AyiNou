"use client";

import { useCallback, useState } from "react";
import type { PolicyAuditEvent, PolicyAuditPage } from "@ayinou/shared";
import { adminMessages } from "@/lib/admin-i18n";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { verificationCopy } from "@/lib/verification-policy-i18n";
import { AdminFeedback } from "./admin-workspace";
import { institutionCard, institutionLink, useInstitutionResource } from "./institution-ui";

export function PolicyAuditHistory({ workspaceId }: { workspaceId: string }) {
  const [locale] = useLocale();
  const t = adminMessages[locale];
  const copy = t.policyAudit;
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const cursor = pages.at(-1) ?? null;
  const load = useCallback(async (signal: AbortSignal) => {
    const query = cursor ? "?" + new URLSearchParams({ cursor }) : "";
    const page: PolicyAuditPage = await authorizedRequest("/api/v1/admin/audit/policies" + query,
      { signal, cache: "no-store", headers: { "X-Ayinou-Workspace": workspaceId } });
    return { cursor, page };
  }, [cursor, workspaceId]);
  const history = useInstitutionResource(load);
  const page = history.data?.cursor === cursor ? history.data.page : null;
  const labels: Record<PolicyAuditEvent["changes"][number]["key"], string> = {
    ...t.memberExperience.flags,
    ...verificationCopy[locale].flags,
    homepageStatistics: t.homepageStatistics, enabled: t.registrationPolicy.enabled,
    mode: t.registrationPolicy.mode, individualEnabled: t.registrationPolicy.individualEnabled,
    organizationEnabled: t.registrationPolicy.organizationEnabled,
    referralsEnabled: t.registrationPolicy.referralsEnabled, rewardsEnabled: copy.rewards,
  };
  const formatValue = (value: PolicyAuditEvent["changes"][number]["before"]) =>
    typeof value === "boolean" ? (value ? t.homepageOn : t.homepageOff) : t.registrationPolicy[value];
  const formatTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return <section className={institutionCard} aria-labelledby="policy-history-heading">
    <h2 id="policy-history-heading" className="text-xl font-semibold">{copy.title}</h2>
    {history.error ? <div className="mt-3">
      <AdminFeedback error={history.error} retry={history.refresh} />
      {pages.length > 1 && <button className={`${institutionLink} mt-3`} type="button" onClick={() => setPages([null])}>{copy.latest}</button>}
    </div> : !page ? <p role="status" className="mt-3">{authMessages[locale].working}</p>
      : page.events.length ? <ol className="mt-3 divide-y divide-[var(--theme-border)]">
        {page.events.map((event) => <li className="grid gap-2 py-3" key={`${event.source}:${event.revision}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-semibold">{event.source === "homepage" ? t.homepageStatistics : event.source === "registration" ? t.registrationPolicy.title : event.source === "verification" ? verificationCopy[locale].sections.verificationSettings : t.memberExperience.title}</h3>
            <time className="text-sm text-[var(--theme-body)]" dateTime={event.occurredAt}>{formatTime.format(new Date(event.occurredAt))}</time>
          </div>
          <p className="break-words text-sm">{copy.changedBy} · {event.actorUsername ? `@${event.actorUsername}` : event.actorId}</p>
          <dl className="grid gap-1 text-sm">
            {event.changes.map((change) => <div className="flex flex-wrap gap-x-2" key={change.key}>
              <dt>{labels[change.key]}</dt>
              <dd>{formatValue(change.before)} → {formatValue(change.after)}</dd>
            </div>)}
            <div className="min-w-0"><dt className="font-medium">{copy.reason}</dt><dd className="whitespace-pre-wrap break-words">{event.reason}</dd></div>
          </dl>
        </li>)}
      </ol> : <p className="mt-3 text-sm text-[var(--theme-body)]">{copy.empty}</p>}
    {page && !history.error && (pages.length > 1 || page.nextCursor) && <div className="mt-3 flex flex-wrap gap-4">
      {pages.length > 1 && <button type="button" className={institutionLink} onClick={() => setPages(pages.slice(0, -1))}>{copy.newer}</button>}
      {page.nextCursor && <button type="button" className={institutionLink}
        onClick={() => setPages([...pages, page.nextCursor])}>{copy.older}</button>}
    </div>}
  </section>;
}
