"use client";

import { isLocale, locales, messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";

const languageNames = { ht: "Kreyòl ayisyen", fr: "Français", en: "English" };

export function LanguageSwitch() {
  const [locale, setLocale] = useLocale();

  return (
    <div className="relative flex min-h-9 items-center gap-1.5 rounded-s-md px-2.5 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-[var(--theme-link)]">
      <span aria-hidden="true" className="uppercase">{locale}</span>
      <span aria-hidden="true" className="size-1.5 -translate-y-px rotate-45 border-e border-b border-current" />
      <select aria-label={messages[locale].languageLabel} value={locale}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        onChange={(event) => { if (isLocale(event.target.value)) setLocale(event.target.value); }}>
        {locales.map((option) => <option key={option} value={option} lang={option}>{languageNames[option]}</option>)}
      </select>
    </div>
  );
}
