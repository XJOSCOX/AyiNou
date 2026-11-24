"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { locales, type Locale } from "@ayinou/shared";
import { saveFeedLanguages, translateFeedContent, type FeedLanguageSettings } from "@/lib/feed-languages-api";
import { feedLanguageMessages } from "@/lib/feed-language-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { languageNames } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { ApiErrorNotice } from "./api-error-notice";
import { FilterPanel } from "./filter-panel";
import { institutionAction, institutionLink } from "./institution-ui";
import { SocialText } from "./social-text";

export const TranslationEnabled = createContext(false);

export function FeedLanguageControl({ settings, onSave, views, actions }: { settings: FeedLanguageSettings; views?: ReactNode; actions?: ReactNode; onSave: (settings: FeedLanguageSettings) => void }) {
  const [locale] = useLocale();
  const t = feedLanguageMessages[locale];
  const mutation = useFeedMutation();
  const [draft,setDraft] = useState(settings.languages);
  const selected = new Set(draft);
  if (!settings.enabled) return <div className="flex flex-wrap items-center justify-between gap-2">{views}{actions}</div>;
  return <FilterPanel leading={views} actions={actions} summary={settings.languages.length
    ? t.active + " " + settings.languages.map((language) => languageNames[language]).join(", ") : t.all}>
    <form className="grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      void mutation.run(async () => {
        const result = await saveFeedLanguages(draft);
        setDraft(result.languages); onSave(result);
      });
    }}>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2" disabled={mutation.busy}>
        <legend className="sr-only">{t.preferences}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!selected.size} onChange={() => setDraft([])} />{t.all}
        </label>
        {locales.map((key) => <label key={key} className="flex items-center gap-2 text-sm" lang={key}>
          <input type="checkbox" checked={selected.has(key)} onChange={() => setDraft(selected.has(key) ? draft.filter((item) => item !== key) : [...draft,key])} />
          {languageNames[key]}
        </label>)}
      </fieldset>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
      <button className={institutionAction + " justify-self-start"} disabled={mutation.busy}>{t.apply}</button>
    </form>
  </FilterPanel>;
}

export function TranslatableText({ id, kind, language, allowed = true, children, className, mentions, hashtags }: {
  id:string; kind:"post" | "comment"; language:Locale; allowed?:boolean; children:ReactNode; className?:string;
  mentions?:Record<string,string>; hashtags?:string[];
}) {
  const [locale] = useLocale();
  const enabled = useContext(TranslationEnabled);
  const t = feedLanguageMessages[locale];
  const mutation = useFeedMutation();
  const [result,setResult] = useState<{ language:Locale; body:string | null } | null>(null);
  const [showOriginal,setShowOriginal] = useState(false);
  const active = result?.language === locale ? result : null;
  const available = enabled && allowed && language !== locale;
  const translated = available && active?.body && !showOriginal;
  return <>
    <p dir="auto" lang={translated ? locale : language} className={className}>
      {translated ? <SocialText body={active.body!} mentions={mentions} hashtags={hashtags} /> : children}
    </p>
    {available && <div className="mt-1 flex flex-wrap items-baseline gap-2 text-xs">
      {translated && <span role="status">{t.machine}</span>}
      <button type="button" disabled={mutation.busy} className={institutionLink} onClick={() => {
        if (active?.body) { setShowOriginal(!showOriginal); return; }
        void mutation.run(async () => {
          const response = await translateFeedContent(kind,id,locale);
          setResult({ language:locale,body:response.status === "translated" ? response.body : null });
          setShowOriginal(false);
        });
      }}>{translated ? t.original : t.translate}</button>
      {active?.body === null && <span role="status">{t.unavailable}</span>}
    </div>}
    {available && mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
  </>;
}
