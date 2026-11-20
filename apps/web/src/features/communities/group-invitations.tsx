import { GroupMore } from "./group-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionLink, institutionCard, institutionAction } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { PageHeader } from "@/components/page-header";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { useFeedMutation, useCursorPage } from "@/lib/feed-state";
import { groupInbox, respondGroupInvitation } from "@/lib/group-api";
import { groupMessages } from "@/lib/groups-i18n";
import { useLocale } from "@/lib/locale-store";
import Link from "next/link";
import { useState, useCallback } from "react";

export function GroupInbox() {
  const [locale] = useLocale();
  return <MemberShell><div className="grid gap-4">
    <Link className={institutionLink} href="/communities">← {communityDirectoryMessages[locale].title}</Link>
    <GroupInvitationList standalone />
  </div></MemberShell>;
}

export function GroupInvitationList({ standalone = false, onRespond }: { standalone?: boolean; onRespond?(): void }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const [revision, setRevision] = useState(0);
  const [handled, setHandled] = useState<string[]>([]);
  const mutation = useFeedMutation();
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await groupInbox(cursor, signal);
    return { rows: page.invitations, nextCursor: page.nextCursor };
  }, []);
  const resource = useCursorPage(load, revision);
  const entries = resource.error === null ? resource.page?.rows.filter(({ id }) => !handled.includes(id)) : null;
  return <section className="grid gap-4" aria-label={t.invitations}>
    {standalone ? <PageHeader title={t.invitations} /> : <h2 className="text-xl font-semibold">{t.invitations}</h2>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{communityDirectoryMessages[locale].loading}</p>}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {entries?.length === 0 && <p>{t.noInvites}</p>}
    <ul className="grid gap-3">
      {entries?.map((invite) => <li key={invite.id} className={`${institutionCard} grid gap-2`}>
        <p className="text-sm text-[var(--theme-link)]">{t[invite.purpose]}</p>
        <h2 dir="auto" className="break-words text-xl font-semibold">{invite.name}</h2>
        <time dateTime={invite.expiresAt} className="text-sm">{new Date(invite.expiresAt).toLocaleString(locale)}</time>
        <div className="flex flex-wrap gap-3">
          {([true, false] as const).map((accept) => <button key={String(accept)} type="button" className={accept ? institutionAction : institutionLink}
            disabled={mutation.busy} onClick={() => { void mutation.run(async () => {
              await respondGroupInvitation(invite.id, accept);
              setHandled((ids) => [...ids, invite.id]);
              setRevision((value) => value + 1);
              onRespond?.();
            }); }}>{accept ? t.accept : t.decline}</button>)}
          {invite.purpose === "ownership" && <Link href="/mfa?next=%2Fcommunities%2Finvitations" className={institutionLink}>{t.manageMfa}</Link>}
        </div>
      </li>)}
    </ul>
    <GroupMore resource={resource} />
  </section>;
}
