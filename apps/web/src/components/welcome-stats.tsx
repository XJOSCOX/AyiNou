"use client";

import { useEffect, useState } from "react";
import type { CommunityStats } from "@ayinou/shared";
import { fetchCommunityStats } from "@/lib/api";
import { communityMessages } from "@/lib/community-i18n";
import { membershipMessages } from "@/lib/membership-i18n";
import { useLocale } from "@/lib/locale-store";

export function WelcomeStats() {
  const [locale] = useLocale();
  const t = communityMessages[locale];
  const m = membershipMessages[locale];
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchCommunityStats(controller.signal).then(setStats).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [attempt]);
  const number = new Intl.NumberFormat(locale);
  return (
    <section className="mt-4 rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-hero)] p-5 sm:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] lg:items-center lg:gap-6" aria-labelledby="welcome-stats">
      <h2 id="welcome-stats" className="text-xl font-bold">{m.stats}</h2>
      {error ? <div className="mt-3">
        <p role="alert">{t.error}</p>
        <button type="button" className="mt-2 font-semibold underline" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>{t.retry}</button>
      </div> : !stats ? <p className="mt-3" role="status">{t.loading}</p> : (
        <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:mt-0">
          {[[t.registered, stats.registered], [t.haiti, stats.haiti], [t.diaspora, stats.diaspora]].map(([label, value]) =>
            <div key={label} className="border-[var(--theme-border)] lg:border-s lg:ps-6"><dt className="text-sm text-[var(--theme-body)]">{label}</dt>
              <dd className={`mt-1 font-semibold ${typeof value === "number" ? "text-2xl tabular-nums" : "text-sm"}`}>{typeof value === "number" ? number.format(value) : t.suppressed}</dd></div>)}
        </dl>
      )}
    </section>
  );
}
