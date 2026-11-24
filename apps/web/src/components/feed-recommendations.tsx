"use client";

import { useState } from "react";
import { interestCodes, recommendationActions, type InterestCode, type RecommendationAction, type RecommendationReason } from "@ayinou/shared";
import { feedMessages } from "@/lib/feed-i18n";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import {
  clearRecommendationFeedback, loadRecommendationSettings, saveRecommendationTopics, submitRecommendationFeedback,
} from "@/lib/recommendation-api";
import { recommendationMessages } from "@/lib/recommendation-i18n";
import { ApiErrorNotice } from "./api-error-notice";
import { FeedIcon } from "./feed-actions";
import { institutionAction, institutionLink, useInstitutionResource } from "./institution-ui";

export function TopicOptions({ chosen, limit, busy, onChange }: {
  chosen: InterestCode[];
  limit: number;
  busy: boolean;
  onChange: (codes: InterestCode[]) => void;
}) {
  const [locale] = useLocale();
  const t = recommendationMessages[locale];
  const labels = membershipMessages[locale];
  return <fieldset className="min-w-0" disabled={busy}>
    <legend className="sr-only">{t.topics}</legend>
    <div className="flex flex-wrap gap-2">
      {interestCodes.map((code) => {
        const checked = chosen.includes(code);
        return <label key={code} className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-2 py-1.5 text-sm">
          <input type="checkbox" checked={checked} disabled={!checked && chosen.length >= limit}
            onChange={() => onChange(checked ? chosen.filter((item) => item !== code) : [...chosen, code])} />
          {labels[code]}
        </label>;
      })}
    </div>
  </fieldset>;
}

export function PostTopicLabels({ topics }: { topics: InterestCode[] }) {
  const [locale] = useLocale();
  const labels = membershipMessages[locale];
  return <ul aria-label={recommendationMessages[locale].topics} className="mt-3 flex flex-wrap gap-1.5">
    {topics.map((topic) => <li key={topic} className="rounded-md bg-[var(--theme-control)] px-2 py-1 text-xs text-[var(--theme-body)]">
      {labels[topic]}
    </li>)}
  </ul>;
}

export function RecommendationSettingsPanel({ onChange }: { onChange: () => void }) {
  const [locale] = useLocale();
  const t = recommendationMessages[locale];
  return <section aria-label={t.preferences} className="mt-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] px-3 pb-3 pt-2">
    <h2 className="text-sm font-semibold">{t.preferences}</h2>
    <SettingsContent onChange={onChange} />
  </section>;
}

function SettingsContent({ onChange }: { onChange: () => void }) {
  const [locale] = useLocale();
  const t = recommendationMessages[locale];
  const resource = useInstitutionResource(loadRecommendationSettings);
  if (resource.error !== null) return <div className="mt-3"><ApiErrorNotice error={resource.error} retry={resource.refresh} /></div>;
  if (!resource.data) return <p role="status" className="mt-3">{feedMessages[locale].working}</p>;
  return <SettingsForm initial={resource.data.topics} onChange={onChange} help={t.preferencesHelp} />;
}

function SettingsForm({ initial, onChange, help }: { initial: InterestCode[]; onChange: () => void; help: string }) {
  const [locale] = useLocale();
  const t = recommendationMessages[locale];
  const common = feedMessages[locale];
  const [topics, setTopics] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<"saved" | "feedbackCleared" | null>(null);
  const mutation = useFeedMutation();

  return <div className="mt-3 grid gap-3">
    <p className="text-sm text-[var(--theme-body)]">{help}</p>
    <TopicOptions chosen={topics} limit={interestCodes.length} busy={mutation.busy} onChange={setTopics} />
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={institutionAction} disabled={mutation.busy} onClick={async () => {
        if (await mutation.run(async () => setTopics((await saveRecommendationTopics(topics)).topics))) {
          setNotice("saved");
          onChange();
        }
      }}>{t.save}</button>
      {!confirm && <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => setConfirm(true)}>{t.clearFeedback}</button>}
    </div>
    {confirm && <div className="grid gap-2">
      <p className="text-sm">{t.confirmClear}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={institutionAction} disabled={mutation.busy} onClick={async () => {
          if (await mutation.run(clearRecommendationFeedback)) {
            setConfirm(false);
            setNotice("feedbackCleared");
            onChange();
          }
        }}>{t.clearFeedback}</button>
        <button type="button" className={institutionLink} disabled={mutation.busy} onClick={() => setConfirm(false)}>{common.cancel}</button>
      </div>
    </div>}
    {notice && <p role="status" className="text-sm">{t[notice]}</p>}
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
  </div>;
}

export function RecommendationActions({ id, reason, onFeedback }: {
  id: string;
  reason: RecommendationReason;
  onFeedback: (action: RecommendationAction) => void;
}) {
  const [locale] = useLocale();
  const t = recommendationMessages[locale];
  const mutation = useFeedMutation();
  return <details className="relative text-sm" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={(event) => {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.stopPropagation();
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  }}>
    <summary className="inline-flex min-h-9 max-w-full cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--theme-body)] hover:bg-[var(--theme-control)] hover:text-[var(--theme-link)] focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
      <FeedIcon name="info" /><span>{t.why}</span>
    </summary>
    <div className="absolute bottom-full end-0 z-20 mb-1.5 grid w-64 max-w-[calc(100vw-3rem)] gap-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-2 shadow-lg">
      <p className="px-2 pt-1 text-xs leading-relaxed text-[var(--theme-body)]">{t[reason]}</p>
      <div className="grid gap-0.5">
        {recommendationActions.map((action) => <button key={action} type="button"
          className="min-h-9 rounded-md px-2 py-1 text-start text-sm hover:bg-[var(--theme-selected)] focus-visible:outline-2"
          disabled={mutation.busy} onClick={async () => {
            if (await mutation.run(() => submitRecommendationFeedback(id, action))) onFeedback(action);
          }}>{t[action]}</button>)}
      </div>
      {mutation.error !== null && <ApiErrorNotice error={mutation.error} />}
    </div>
  </details>;
}
