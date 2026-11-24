import { TopicSelect, GroupMore } from "./group-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { FilterPanel } from "@/components/filter-panel";
import { CommunityCard } from "@/components/community-card";
import { institutionField } from "@/components/institution-ui";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { communityDiscoveryMessages } from "@/lib/community-discovery-i18n";
import { useCursorPage } from "@/lib/feed-state";
import { listGroups } from "@/lib/group-api";
import { groupMessages } from "@/lib/groups-i18n";
import { useLocale } from "@/lib/locale-store";
import { type GroupKind, type MemberGroup } from "@ayinou/shared";
import { useState, useId, useCallback, type ReactNode } from "react";

export function GroupsDirectory({ kind, guest = false, search, initialTopic = "", searchControl, categoryFilter }: {
  kind?: GroupKind; guest?: boolean; search: string; initialTopic?: string; searchControl?: ReactNode; categoryFilter?: ReactNode;
}) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const c = communityDirectoryMessages[locale];
  const [country, setCountry] = useState("");
  const [topic, setTopic] = useState(initialTopic);
  const [changed, setChanged] = useState<Record<string, MemberGroup>>({});
  const countryError = useId();
  const countryFilter = kind === "diaspora" && /^[A-Z]{2}$/.test(country) ? country : "";
  const topicFilter = kind === "interest" ? topic : "";
  const invalidCountry = kind === "diaspora" && Boolean(country && !countryFilter);
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await listGroups({ kind, search, country: countryFilter, topic: topicFilter }, cursor, signal, guest);
    return { rows: page.communities, nextCursor: page.nextCursor };
  }, [countryFilter, guest, kind, search, topicFilter]);
  const resource = useCursorPage(load);
  return <section className="grid min-w-0 gap-4" aria-label={t.groups}>
    {(kind || categoryFilter) && <FilterPanel search={searchControl}
      active={Number(Boolean(countryFilter || topicFilter)) + Number(Boolean(categoryFilter && kind))}>
      <div className="grid gap-3 sm:grid-cols-2">
        {categoryFilter}
      {kind === "diaspora" ? <label className="text-sm font-semibold">{t.country}
        <input className={institutionField} maxLength={2} value={country} placeholder="HT" aria-invalid={invalidCountry}
          aria-describedby={invalidCountry ? countryError : undefined} onChange={(event) => setCountry(event.target.value.toUpperCase())} />
        {invalidCountry && <span id={countryError} className="mt-1 block text-[var(--theme-body)]">{communityDiscoveryMessages[locale].invalidCountry}</span>}
      </label> : kind === "interest" && <TopicSelect value={topic} change={setTopic} />}
      </div>
    </FilterPanel>}
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} signIn={!guest} />}
    {!resource.page && resource.error === null && <p role="status">{c.loading}</p>}
    {resource.page?.rows.length === 0 && <p role="status">{t.noGroups}</p>}
    <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {resource.error === null && resource.page?.rows.map((group) => <CommunityCard key={group.id} community={changed[group.id] ?? group} guest={guest}
        update={(next) => { if (next && next.kind !== "department") setChanged((current) => ({ ...current, [next.id]: next })); }} />)}
    </ul>
    <GroupMore resource={resource} />
  </section>;
}
