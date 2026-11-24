import { GroupMore } from "./group-controls";
import { CommunityLoading, communityEmpty, communityGrid, communitySection, communitySectionMessage } from "@/components/community-card";
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
  return <MemberShell><GroupInvitationList standalone /></MemberShell>;
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
  return <section className={standalone ? "grid gap-4" : communitySection} aria-label={t.invitations}>
    {standalone ? <PageHeader title={t.invitations} actions={
      <Link href="/communities" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2">
        <span aria-hidden="true">←</span>{communityDirectoryMessages[locale].title}
      </Link>
    } /> : <h2 className="text-base font-semibold">{t.invitations}</h2>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <CommunityLoading single={!standalone} />}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {entries?.length === 0 && <p className={standalone ? communityEmpty : communitySectionMessage}>{t.noInvites}</p>}
    {!!entries?.length && <ul className={standalone ? communityGrid : "grid min-w-0 gap-3"}>
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
    </ul>}
    <GroupMore resource={resource} />
  </section>;
}
