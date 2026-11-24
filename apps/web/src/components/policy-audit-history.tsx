"use client";

import { useCallback, useState } from "react";
import type { PolicyAuditEvent, PolicyAuditPage } from "@ayinou/shared";
import { adminMessages } from "@/lib/admin-i18n";
import { authorizedRequest } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { verificationCopy } from "@/lib/verification-policy-i18n";
import { AdminFeedback } from "./admin-workspace";
import { useInstitutionResource } from "./institution-ui";
import { AdminMemberBadges } from "./admin-account-avatar";
import { adminCompactCard, adminDisclosure, adminSecondaryAction } from "./admin-controls";

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
  const formatTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

  return <section className={adminCompactCard} aria-labelledby="policy-history-heading">
    <h2 id="policy-history-heading" className="border-b border-[var(--theme-border)] pb-3 text-lg font-semibold">{copy.title}</h2>
    {history.error ? <div className="mt-3">
      <AdminFeedback error={history.error} retry={history.refresh} />
      {pages.length > 1 && <button className={`${adminSecondaryAction} mt-3`} type="button" onClick={() => setPages([null])}>{copy.latest}</button>}
    </div> : !page ? <p role="status" className="mt-3">{authMessages[locale].working}</p>
      : page.events.length ? <ol className="mt-3 grid gap-2">
        {page.events.map((event) => <li key={`${event.source}:${event.revision}`}>
          <details className="min-w-0 rounded-lg border border-[var(--theme-border)]">
            <summary className={adminDisclosure}>
              <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words">
                  <span className="block">{event.source === "homepage" ? t.homepageStatistics : event.source === "registration" ? t.registrationPolicy.title : event.source === "verification" ? verificationCopy[locale].sections.verificationSettings : t.memberExperience.title}</span>
                  <span className="block break-words text-xs font-normal text-[var(--theme-body)]">
                    {event.actor?.displayName && `${event.actor.displayName} · `}
                    {event.actorUsername ? `@${event.actorUsername}` : event.actor?.username ? `@${event.actor.username}` : !event.actor?.displayName && event.actorId}
                    {(event.actorUsername || event.actor?.username) && <>{" "}<AdminMemberBadges username={event.actorUsername ?? event.actor?.username ?? null} /></>}
                  </span>
                </span>
                <time className="text-xs font-normal text-[var(--theme-body)]" dateTime={event.occurredAt}>{formatTime.format(new Date(event.occurredAt))} UTC</time>
              </span>
            </summary>
            <dl className="grid gap-2 border-t border-[var(--theme-border)] bg-[var(--theme-control)] px-3 py-2.5 text-sm">
              {event.changes.map((change) => <div className="grid gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" key={change.key}>
                <dt className="font-medium">{labels[change.key]}</dt>
                <dd>{formatValue(change.before)} → {formatValue(change.after)}</dd>
              </div>)}
              <div className="min-w-0 border-t border-[var(--theme-border)] pt-2">
                <dt className="font-medium">{copy.reason}</dt>
                <dd className="whitespace-pre-wrap break-words">{event.reason}</dd>
              </div>
            </dl>
          </details>
        </li>)}
      </ol> : <p className="mt-3 text-sm text-[var(--theme-body)]">{copy.empty}</p>}
    {page && !history.error && (pages.length > 1 || page.nextCursor) && <div className="mt-3 flex flex-wrap gap-4">
      {pages.length > 1 && <button type="button" className={adminSecondaryAction} onClick={() => setPages(pages.slice(0, -1))}>{copy.newer}</button>}
      {page.nextCursor && <button type="button" className={adminSecondaryAction}
        onClick={() => setPages([...pages, page.nextCursor])}>{copy.older}</button>}
    </div>}
  </section>;
}
