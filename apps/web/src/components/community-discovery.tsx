"use client";

import { communityKinds, type Community, type CommunityRecommendationFeedbackAction, type InterestCode } from "@ayinou/shared";
import { useCallback, useState } from "react";
import { apiErrorCode } from "@/lib/api-errors";
import { communityDiscoveryMessages } from "@/lib/community-discovery-i18n";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage, useFeedMutation } from "@/lib/feed-state";
import { communityRecommendationSettings, listCommunityRecommendations, listGroupActivity, resetCommunityRecommendationFeedback,
  saveCommunityRecommendationFeedback, type GroupActivityView } from "@/lib/group-api";
import { groupMessages } from "@/lib/groups-i18n";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { CommunityCard } from "./community-card";
import { GroupInvitationList, GroupMore, TopicSelect } from "./groups";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "./institution-ui";

export function RecommendedCommunities({ search, explore, onMembership }: {
  search: string; explore(topic: InterestCode): void; onMembership(community: Community): void;
}) {
  const [locale] = useLocale();
  const t = communityDiscoveryMessages[locale];
  const c = communityDirectoryMessages[locale];
  const groups = groupMessages[locale];
  const mutation = useFeedMutation();
  const settings = useInstitutionResource(communityRecommendationSettings);
  const [kind, setKind] = useState<Community["kind"] | "">("");
  const [topic, setTopic] = useState("");
  const [country, setCountry] = useState("");
  const [revision, setRevision] = useState(0);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [notice, setNotice] = useState<"feedbackSaved" | "feedbackRestored" | "feedbackReset" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const countryFilter = /^[A-Z]{2}$/.test(country) ? country : "";
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const result = await listCommunityRecommendations({ kind, search, country: countryFilter, topic }, cursor, signal);
    return { rows: result.recommendations.map((entry) => ({ ...entry, id: entry.community.id })), nextCursor: result.nextCursor };
  }, [countryFilter, kind, search, topic]);
  const resource = useCursorPage(load, revision);
  const rows = resource.error === null ? resource.page?.rows.filter((entry) => !excluded.includes(entry.id)) : null;
  const expired = apiErrorCode(resource.error) === "COMMUNITY_RECOMMENDATIONS_EXPIRED";

  function feedback(id: string, action: CommunityRecommendationFeedbackAction) {
    void mutation.run(async () => {
      await saveCommunityRecommendationFeedback(id, action);
      if (action === "restore") {
        setExcluded((removed) => removed.filter((item) => item !== id));
        setLastFeedback(null);
        setNotice("feedbackRestored");
        setRevision((value) => value + 1);
      } else {
        setExcluded((removed) => [...removed, id]);
        setLastFeedback(id);
        setNotice("feedbackSaved");
      }
      settings.refresh();
    });
  }
  function reset() {
    void mutation.run(async () => {
      await resetCommunityRecommendationFeedback();
      setExcluded([]);
      setLastFeedback(null);
      setConfirmReset(false);
      setNotice("feedbackReset");
      settings.refresh();
      setRevision((value) => value + 1);
    });
  }
  return <section className="grid gap-4" aria-label={t.recommended}>
    <header>
      <h2 className="text-xl font-semibold">{t.recommended}</h2>
      <p className="mt-1 text-sm text-[var(--theme-body)]">{t.recommendIntro}</p>
    </header>
    <div className="grid gap-3 sm:max-w-2xl sm:grid-cols-2">
      <label className="min-w-0 text-sm font-semibold">{groups.category}
        <select value={kind} className={institutionField} onChange={(event) => {
          setKind(event.target.value as Community["kind"] | "");
          setCountry("");
          setTopic("");
        }}>
          <option value="">{t.allCategories}</option>
          {communityKinds.map((value) => <option key={value} value={value}>{value === "department" ? groups.officialDepartments : groups[value]}</option>)}
        </select>
      </label>
      {kind === "interest" && <TopicSelect value={topic} change={setTopic} />}
      {kind === "diaspora" && <label className="text-sm font-semibold">{groups.country}
        <input value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} maxLength={2}
          aria-invalid={country.length > 0 && !/^[A-Z]{2}$/.test(country)} className={institutionField} placeholder="HT" />
        {country.length > 0 && !/^[A-Z]{2}$/.test(country) && <span className="mt-1 block text-[var(--theme-body)]">{t.invalidCountry}</span>}
      </label>}
    </div>
    <details className={institutionCard}>
      <summary className="cursor-pointer font-semibold">{t.reset}</summary>
      {settings.data && <p className="mt-2 text-sm text-[var(--theme-body)]">{t.feedbackSummary
        .replace("{hidden}", new Intl.NumberFormat(locale).format(settings.data.hidden))
        .replace("{count}", new Intl.NumberFormat(locale).format(settings.data.notInterested))}</p>}
      {settings.error !== null && <ApiErrorNotice error={settings.error} retry={settings.refresh} />}
      {confirmReset && <p className="my-2 text-sm">{t.resetConfirm}</p>}
      <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" disabled={mutation.busy} className={institutionAction} onClick={() => confirmReset ? reset() : setConfirmReset(true)}>{t.reset}</button>
        {confirmReset && <button type="button" className={institutionLink} onClick={() => setConfirmReset(false)}>{feedMessages[locale].cancel}</button>}
      </div>
    </details>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    {notice && <div className="flex flex-wrap items-center gap-3">
      <p role="status" className="text-sm">{t[notice]}</p>
      {lastFeedback && <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => feedback(lastFeedback, "restore")}>{t.undo}</button>}
    </div>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={expired ? undefined : resource.retry} />}
    {expired && <button type="button" className={`${institutionAction} justify-self-start`}
      onClick={() => setRevision((value) => value + 1)}>{t.refresh}</button>}
    {!resource.page && resource.error === null && <p role="status">{c.loading}</p>}
    {rows?.length === 0 && <p role="status">{t.noRecommendations}</p>}
    <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {rows?.map(({ id, community, reason, recentPublicActivity }) => <CommunityCard key={id} community={community} update={(next) => {
        if (next) onMembership(next);
        if (next && (next.joined || (next.kind !== "department" && next.requestStatus === "pending")))
          setExcluded((removed) => [...removed, id]);
      }}>
        {recentPublicActivity && <p className="text-sm text-[var(--theme-link)]">{t.recentActivity}</p>}
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">{t.why}</summary>
          <p className="mt-1 text-[var(--theme-body)]">{t[reason]}</p>
        </details>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-2">
          {community.kind !== "department" && community.topic && <button className={institutionLink} type="button"
            onClick={() => { if (community.topic) explore(community.topic); }}>{membershipMessages[locale][community.topic]} ↗</button>}
          <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => feedback(id, "not_interested")}>{t.notInterested}</button>
          <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => feedback(id, "hide")}>{t.hide}</button>
        </div>
      </CommunityCard>)}
    </ul>
    <GroupMore resource={resource} />
  </section>;
}

export function MyGroupActivities({ search }: { search: string }) {
  const [revision, setRevision] = useState(0);
  return <>
    <MyGroupSection view="joined" search={search} revision={revision} />
    <MyGroupSection view="managed" search={search} revision={revision} />
    <MyGroupSection view="pending" search={search} revision={revision} />
    <GroupInvitationList onRespond={() => setRevision((previous) => previous + 1)} />
  </>;
}

function MyGroupSection({ view, search, revision }: { view: GroupActivityView; search: string; revision: number }) {
  const [locale] = useLocale();
  const c = communityDirectoryMessages[locale];
  const t = communityDiscoveryMessages[locale];
  const [cleared, setCleared] = useState<string[]>([]);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await listGroupActivity(view, search, cursor, signal);
    return { rows: page.communities, nextCursor: page.nextCursor };
  }, [search, view]);
  const resource = useCursorPage(load, revision);
  const rows = resource.error === null ? resource.page?.rows.filter((group) => !cleared.includes(group.id)) : null;
  const heading = { joined: t.groupsJoined, managed: t.groupsManaged, pending: t.membershipRequests }[view];
  return <section className="grid gap-3" aria-label={heading}>
    <h2 className="text-xl font-semibold">{heading}</h2>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{c.loading}</p>}
    {rows?.length === 0 && <p role="status">{search ? groupMessages[locale].noGroups : { joined: t.noJoined, managed: t.noManaged, pending: t.noPending }[view]}</p>}
    <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {rows?.map((group) => <CommunityCard key={group.id} community={group} update={(next) => {
        if (!next || (next.kind !== "department" && next.requestStatus !== "pending")) setCleared((ids) => [...ids, group.id]);
      }} />)}
    </ul>
    <GroupMore resource={resource} />
  </section>;
}
