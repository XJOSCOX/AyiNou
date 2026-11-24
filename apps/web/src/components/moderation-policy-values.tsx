import type { Locale, ModerationPolicy, PolicyAuditEvent } from "@ayinou/shared";
import { accountEnforcementMessages } from "@/lib/account-enforcement-i18n";
import { featureMessages } from "@/lib/feature-enforcement-i18n";
import { moderationPolicyMessages } from "@/lib/moderation-policy-i18n";
import { useLocale } from "@/lib/locale-store";

type Key = keyof ModerationPolicy;
type Value = ModerationPolicy[Key];
export function formatModerationPolicyValue(locale: Locale, key: Key, value: Value): string {
  const copy = moderationPolicyMessages[locale];
  const minutes = new Intl.NumberFormat(locale, { style: "unit", unit: "minute" });
  if (typeof value === "boolean") return value ? copy.on : copy.off;
  if (typeof value === "number") return minutes.format(value);
  if (typeof value === "string") return value || copy.none;
  if (!value.length) return copy.none;
  if (key === "suspensionPresets") return (value as number[]).map((item) => {
    const unit = item >= 1440 ? "day" : "hour";
    return new Intl.NumberFormat(locale, { style: "unit", unit }).format(item / (unit === "day" ? 1440 : 60));
  }).join(", ");
  return key === "reasonCategories"
    ? (value as ModerationPolicy["reasonCategories"]).map((item) => accountEnforcementMessages[locale][item]).join(", ")
    : (value as ModerationPolicy["delegableCapabilities"]).map((item) => featureMessages[locale][item]).join(", ");
}

export function ModerationPolicyChanges({ changes }: { changes: PolicyAuditEvent["changes"] }) {
  const [locale] = useLocale();
  const copy = moderationPolicyMessages[locale];
  return <dl className="grid gap-2 rounded-md border border-[var(--theme-border)] p-3 text-sm">
    {changes.map(({ key, before, after }) => <div key={key} className="min-w-0 break-words">
      <dt className="font-semibold">{copy[key as Key]}</dt>
      <dd>{formatModerationPolicyValue(locale, key as Key, before)} → {formatModerationPolicyValue(locale, key as Key, after)}</dd>
    </div>)}
  </dl>;
}
