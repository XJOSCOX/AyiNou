import { GroupsDirectory } from "./group-directory";
import { PublicDiscussion } from "./public-discussion";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { GroupMetadata } from "@/components/community-card";
import { institutionField, useInstitutionResource, institutionLink, institutionCard } from "@/components/institution-ui";
import { MemberShell } from "@/components/member-shell";
import { PageHeader } from "@/components/page-header";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { loadDepartmentCommunity } from "@/lib/department-community-api";
import { groupMessages } from "@/lib/groups-i18n";
import { useLocale } from "@/lib/locale-store";
import { type GroupKind, groupKinds } from "@ayinou/shared";
import Link from "next/link";
import { useState, useCallback } from "react";

function PublicShell({ children, signedIn }: { children: React.ReactNode; signedIn: boolean }) {
  return <MemberShell signedIn={signedIn}>
    <div className="grid min-w-0 content-start gap-4">{children}</div>
  </MemberShell>;
}

export function PublicGroups({ signedIn }: { signedIn: boolean }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const [kind, setKind] = useState<GroupKind | "">("");
  const [search, setSearch] = useState("");
  return <PublicShell signedIn={signedIn}>
    <PageHeader title={t.directory} />
    <GroupsDirectory kind={kind || undefined} search={search} guest
      searchControl={<label className="block text-sm font-semibold">{t.searchGroups}
        <input type="search" className={institutionField} maxLength={80} value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>}
      categoryFilter={<label className="block min-w-0 text-sm font-semibold">{t.category}
          <select className={institutionField} value={kind} onChange={(event) => setKind(event.target.value as GroupKind | "")}>
            <option value="">{t.all}</option>{groupKinds.map((value) => <option key={value} value={value}>{t[value]}</option>)}
          </select>
      </label>} />
  </PublicShell>;
}

export function PublicGroupRoom({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadDepartmentCommunity(slug, signal, true), [slug]);
  const resource = useInstitutionResource(load);
  const group = resource.data?.community;
  return <PublicShell signedIn={signedIn}>
    <Link href="/community-directory" className={institutionLink}>← {t.directory}</Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!group && resource.error === null && <p role="status">{communityDirectoryMessages[locale].loading}</p>}
    {group && group.kind !== "department" && <>
      <header className={`${institutionCard} grid gap-3`}>
        <h1 dir="auto" className="break-words text-3xl font-semibold">{group.name}</h1>
        <GroupMetadata group={group} />
      </header>
      <section className={institutionCard}>
        <h2 className="font-semibold">{t.rules}</h2>
        <p dir="auto" className="whitespace-pre-wrap break-words">{group.rules}</p>
      </section>
      {group.discussionPublic ? <PublicDiscussion slug={slug} /> : <p>{t.restrictedNotice}</p>}
    </>}
  </PublicShell>;
}
