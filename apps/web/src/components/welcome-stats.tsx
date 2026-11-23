"use client";

import { useEffect, useState } from "react";
import type { CommunityStats } from "@ayinou/shared";
import { publicRequest } from "@/lib/api";
import { communityMessages } from "@/lib/community-i18n";
import { membershipMessages } from "@/lib/membership-i18n";
import { useLocale } from "@/lib/locale-store";

type HomepageStats = Pick<CommunityStats, "registered" | "haiti" | "diaspora">;

function isHomepageStats(value: unknown): value is HomepageStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return (["registered", "haiti", "diaspora"] as const).every((key) =>
    stats[key] === null || (typeof stats[key] === "number" && Number.isSafeInteger(stats[key]) && stats[key] >= 0),
  );
}

export function WelcomeStats() {
  const [locale] = useLocale();
  const t = communityMessages[locale];
  const m = membershipMessages[locale];
  const [stats, setStats] = useState<HomepageStats | null>(null);

  useEffect(() => {
    let current: AbortController | undefined;
    function clear() {
      current?.abort();
      setStats(null);
    }
    function refresh() {
      clear();
      const request = new AbortController();
      current = request;
      void publicRequest("/api/v1/homepage/community-statistics", {
        cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(5_000)]),
      }).then((data: unknown) => {
        if (request.signal.aborted || !data || typeof data !== "object" || !("stats" in data)) return;
        if (isHomepageStats(data.stats)) setStats(data.stats);
      }).catch(() => { /* Missing policy or data leaves the section hidden. */ });
    }
    function visibilityChanged() {
      if (document.visibilityState === "visible") refresh();
      else clear();
    }

    if (document.visibilityState === "visible") refresh();
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pageshow", visibilityChanged);
    return () => {
      current?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pageshow", visibilityChanged);
    };
  }, []);

  if (!stats) return null;
  const number = new Intl.NumberFormat(locale);
  return (
    <section className="mt-4 rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-hero)] p-5 sm:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] lg:items-center lg:gap-6" aria-labelledby="welcome-stats">
      <h2 id="welcome-stats" className="text-xl font-bold">{m.stats}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:mt-0">
        {[[t.registered, stats.registered], [t.haiti, stats.haiti], [t.diaspora, stats.diaspora]].map(([label, value]) =>
          <div key={label} className="border-[var(--theme-border)] lg:border-s lg:ps-6"><dt className="text-sm text-[var(--theme-body)]">{label}</dt>
            <dd className={`mt-1 font-semibold ${typeof value === "number" ? "text-2xl tabular-nums" : "text-sm"}`}>{typeof value === "number" ? number.format(value) : t.suppressed}</dd></div>)}
      </dl>
    </section>
  );
}
