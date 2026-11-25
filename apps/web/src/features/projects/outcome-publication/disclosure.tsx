"use client";

import { useEffect, useState } from "react";
import type { OutcomeDisclosure, PublicOutcomeResult } from "@ayinou/shared";
import { useLocale } from "@/lib/locale-store";
import { outcomePublicationMessages } from "@/lib/project-outcome-publication-i18n";
import { loadPublicOutcomeResults } from "@/lib/project-outcome-publication-api";
import { useReviewCopy } from "../outcome-review/review-controls";
import { outcomeMessages } from "@/lib/project-outcome-i18n";

export function usePublicationCopy() {
  const [locale] = useLocale();
  return { locale, t: outcomePublicationMessages[locale] };
}

export function Disclosure({ result, preview = false }: { result: OutcomeDisclosure & { publishedOn?: string }; preview?: boolean }) {
  const { locale, t } = usePublicationCopy();
  const { t: review } = useReviewCopy();
  const classifications = outcomeMessages[locale];
  const date = (value: string) => new Date(value + "T00:00:00Z").toLocaleDateString(locale, { timeZone: "UTC", dateStyle: "medium" });
  const quantity = (value: number | null) => value === null ? t.unavailable :
    new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(value) + (result.unit ? " " + result.unit : "");
  const periods = [result.startsOn, result.endsOn].filter((item): item is string => item !== null);
  return <article className="grid min-w-0 gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
    <p className="text-sm font-medium text-[var(--theme-link)]">{t.independent}</p>
    <h3 className="break-words text-lg font-semibold" dir="auto">{result.title}</h3>
    <div>
      <p className="font-medium">{review.findings[result.finding]} · {classifications[result.classification]}</p>
      <p className="text-sm">{t[`${result.finding}_help`]}</p>
    </div>
    <p dir="auto" className="whitespace-pre-wrap break-words">{result.summary}</p>
    <dl className="grid gap-3 rounded-md bg-[var(--theme-control)] p-3 text-sm sm:grid-cols-2">
      <div><dt>{t.reported}</dt><dd className="font-semibold">{quantity(result.reportedQuantity)}</dd></div>
      <div><dt>{t.supported}</dt><dd className="font-semibold">{quantity(result.supportedQuantity)}</dd></div>
      {periods.length > 0 && <div><dt>{t.period}</dt><dd>{Array.from(new Set(periods)).map(date).join(" – ")}</dd></div>}
      <div><dt>{t.reviewed}</dt><dd><time dateTime={result.reviewedOn}>{date(result.reviewedOn)}</time></dd></div>
      {result.publishedOn && <div><dt>{t.published}</dt><dd><time dateTime={result.publishedOn}>{date(result.publishedOn)}</time></dd></div>}
    </dl>
    <div><p className="font-medium">{t.limit}</p><p dir="auto" className="break-words">{result.limitations}</p></div>
    {result.corrected && !preview && <p className="text-sm">{t.corrected}</p>}
    <p className="text-sm">{t.assurance}</p>
  </article>;
}

export function PublicOutcomeResults({ project, signedIn }: { project: string; signedIn: boolean }) {
  const [results, setResults] = useState<PublicOutcomeResult[]>([]);
  useEffect(() => {
    let request: AbortController | undefined;
    let displayed = false;
    const clear = () => { request?.abort(); displayed = false; setResults([]); };
    const refresh = () => {
      if (document.visibilityState !== "visible") { clear(); return; }
      request?.abort();
      const current = new AbortController();
      request = current;
      const signal = AbortSignal.any([current.signal, AbortSignal.timeout(5_000)]);
      void loadPublicOutcomeResults(project, signedIn, signal).then(
        (items) => { if (!current.signal.aborted) { displayed = items.length > 0; setResults(items); } },
        () => { if (!current.signal.aborted) { displayed = false; setResults([]); } },
      );
    };
    refresh();
    const timer = window.setInterval(() => { if (displayed) refresh(); }, 10_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      request?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [project, signedIn]);
  return results.length ? <div className="grid min-w-0 gap-3 lg:grid-cols-2">
    {results.map((result, index) => <Disclosure result={result} key={index} />)}
  </div> : null;
}
