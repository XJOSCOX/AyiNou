"use client";

import type { RecognitionBadge, RecognitionIcon } from "@ayinou/shared";
import { useLocale } from "@/lib/locale-store";
import { verificationCopy } from "@/lib/verification-policy-i18n";

const glyphs: Record<RecognitionIcon, string> = { ribbon: "❖", sun: "☀", leaf: "♧", hands: "✦" };

export function RecognitionMark({ badge }: { badge: RecognitionBadge }) {
  const [locale] = useLocale();
  return <span title={badge.description[locale]}
    className="inline-flex max-w-full items-center gap-2 rounded-md border border-dashed border-[var(--theme-border)] bg-[var(--theme-control)] px-2.5 py-1 text-sm">
    <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: badge.color ?? undefined }}>{glyphs[badge.icon]}</span>
    <span className="break-words"><span className="text-[var(--theme-body)]">{verificationCopy[locale].copy.recognition} · </span>{badge.name[locale]}</span>
  </span>;
}
