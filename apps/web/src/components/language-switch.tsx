"use client";

import { locales, messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";

export function LanguageSwitch() {
  const [locale, setLocale] = useLocale();

  return (
    <div role="group" aria-label={messages[locale].languageLabel} className="flex rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] p-0.5">
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          className="grid size-8 place-items-center rounded-sm text-xs font-bold uppercase text-[var(--theme-body)] transition-colors hover:text-[var(--theme-link)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--theme-link)] aria-pressed:bg-[var(--theme-selected)] aria-pressed:text-[var(--theme-link)]"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
