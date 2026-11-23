"use client";

import { useVerificationPresentation } from "./verification-presentation";
import { DesignationMark } from "./designation-mark";
import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";

export function FounderVerifiedMark({ compact }: { compact?: boolean }) {
  const [locale] = useLocale();
  const t = founderMessages[locale];
  return <DesignationMark kind="founderIdentity" label={t.badge} title={t.badgeMeaning} compact={compact} />;
}

export function FounderVerifiedBadge() {
  const [locale] = useLocale();
  const t = founderMessages[locale];
  const { showGold } = useVerificationPresentation();
  if (!showGold) return null;
  return <div className="mt-3 grid gap-2 text-sm">
    <FounderVerifiedMark />
    <p className="text-[var(--theme-body)]">{t.badgeMeaning}</p>
  </div>;
}
