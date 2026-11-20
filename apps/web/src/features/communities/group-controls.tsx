import { institutionAction, institutionField } from "@/components/institution-ui";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { groupMessages } from "@/lib/groups-i18n";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import { interestCodes } from "@ayinou/shared";

export function GroupMore({ resource }: { resource: { page: { nextCursor: string | null } | null; loadingMore: boolean; more(): Promise<void> } }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  return resource.page?.nextCursor && <button type="button" className={`${institutionAction} justify-self-start`}
    disabled={resource.loadingMore} onClick={() => { void resource.more(); }}>{resource.loadingMore ? t.loading : t.more}</button>;
}

export function TopicSelect({ value, change }: { value: string; change(value: string): void }) {
  const [locale] = useLocale();
  const t = groupMessages[locale];
  return <label className="min-w-0 text-sm font-semibold">{t.topic}
    <select className={institutionField} value={value} onChange={(event) => change(event.target.value)}>
      <option value="">{t.none}</option>
      {interestCodes.map((code) => <option key={code} value={code}>{membershipMessages[locale][code]}</option>)}
    </select>
  </label>;
}
