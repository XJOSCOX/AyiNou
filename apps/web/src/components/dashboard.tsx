"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CommunityStats, MemberProfile } from "@ayinou/shared";
import { fetchCommunityStats, fetchMyProfile } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { communityMessages } from "@/lib/community-i18n";
import { useLocale } from "@/lib/locale-store";
import { MemberShell } from "./member-shell";

export function Dashboard() {
  const [locale] = useLocale();
  const t = communityMessages[locale];
  const auth = authMessages[locale];
  const router = useRouter();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    fetchMyProfile().then((loaded) => {
      if (!loaded.displayName) { router.replace("/onboarding"); return; }
      setProfile(loaded);
    }).catch((cause) => {
      if (cause instanceof Error && cause.message === "UNAUTHORIZED") { router.replace("/login"); return; }
      setProfileError(true);
    });
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCommunityStats(controller.signal).then((loaded) => {
      setStats(loaded);
      setStatsError(false);
    }).catch(() => { if (!controller.signal.aborted) setStatsError(true); });
    return () => controller.abort();
  }, [retry]);

  const number = new Intl.NumberFormat(locale === "ht" ? "ht-HT" : locale);
  const regionNames = new Intl.DisplayNames([locale === "ht" ? "ht-HT" : locale], { type: "region" });
  const count = (value: number | null | undefined) => value == null ? t.suppressed : number.format(value);
  const visibleDepartments = stats?.departments ?? [];
  const visibleCountries = stats?.diasporaCountries ?? [];
  const highestDepartment = Math.max(1, ...visibleDepartments.map((item) => item.members));
  const highestCountry = Math.max(1, ...visibleCountries.map((item) => item.members));

  return <MemberShell>
    <div className="space-y-9">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#174e41] px-6 py-9 text-white shadow-[0_20px_60px_-30px_#174e41] sm:px-10 sm:py-12">
        <div aria-hidden="true" className="absolute -right-16 -top-24 h-72 w-72 rounded-full border-[42px] border-[#4a9279]/30" />
        <div aria-hidden="true" className="absolute -bottom-36 right-28 h-72 w-72 rounded-full border-[36px] border-[#e8be75]/15" />
        <div className="relative max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f0cc8d]">{t.eyebrow}</p>
          <h1 className="mt-5 font-serif text-4xl leading-tight sm:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#e0eee7] sm:text-lg">{t.intro}</p>
          {profile && <p className="mt-6 text-sm text-[#cfe2d6]">{auth.dashboardTitle.replace("{name}", profile.displayName ?? "")}</p>}
          {profileError && <p role="alert" className="mt-6 text-sm text-[#ffe0cf]">{auth.loadError}</p>}
          <Link href="/profile" className="mt-7 inline-flex rounded-full bg-[#e8be75] px-5 py-2.5 text-sm font-bold text-[#173b32] transition hover:bg-white">{auth.myProfile} ↗</Link>
        </div>
      </section>

      {!stats && !statsError && <p role="status" className="rounded-2xl bg-white p-8 text-[#496258]">{t.loading}</p>}
      {statsError && <div role="alert" className="rounded-2xl border border-[#e7b6aa] bg-[#fff4ef] p-6 text-[#733e34]">
        <p>{t.error}</p>
        <button type="button" onClick={() => { setStatsError(false); setRetry((value) => value + 1); }} className="mt-4 rounded-full bg-[#174e41] px-5 py-2 text-sm font-bold text-white">{t.retry}</button>
      </div>}

      {stats && <>
        {stats.registered === 0 && <p role="status" className="rounded-2xl border border-[#d7dfd3] bg-white p-6 text-[#365e54]">{t.empty}</p>}
        <section aria-label={t.eyebrow} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            [t.registered, stats.registered, "#e3ede4"],
            [t.haiti, stats.haiti, "#f4e4ce"],
            [t.diaspora, stats.diaspora, "#e4edf0"],
            [t.represented, stats.representedDepartments, "#efe8d9"],
          ] as const).map(([label, value, color]) => <article key={label} className="min-h-40 rounded-[1.5rem] border border-[#d9e2d7] p-6" style={{ backgroundColor: color }}>
            <p className="text-sm font-semibold text-[#3f6156]">{label}</p>
            <p className={`mt-5 font-serif ${value == null ? "text-base leading-6" : "text-4xl"} text-[#173e34]`}>{count(value)}{label === t.represented && value != null && <span className="ml-2 font-sans text-sm font-semibold text-[#648075]">{t.ofTen}</span>}</p>
          </article>)}
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {([[t.active, stats.active], [t.verified, stats.verified], [t.unknown, stats.unknown]] as const).map(([label, value]) => <article key={label} className="rounded-2xl border border-[#d9e2d7] bg-white px-6 py-5">
            <p className="text-sm text-[#547064]">{label}</p><p className={`mt-2 font-serif ${value == null ? "text-sm" : "text-3xl"} text-[#174e41]`}>{count(value)}</p>
          </article>)}
        </section>

        {!stats.geographyAvailable && <aside className="rounded-[1.5rem] border border-[#d9e2d7] bg-white p-7" role="note">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#a3622a]">{t.suppressed}</p>
          <p className="mt-3 max-w-3xl leading-7 text-[#365e54]">{t.privacy}</p>
        </aside>}

        {stats.geographyAvailable && <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[1.5rem] border border-[#d9e2d7] bg-white p-6 sm:p-8">
            <h2 className="font-serif text-2xl text-[#173e34]">{t.departmentTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-[#587165]">{t.departmentIntro}</p>
            <div className="mt-7 space-y-4">
              {visibleDepartments.map((item) => <div key={item.code}>
                <div className="mb-1.5 flex items-center justify-between gap-4 text-sm"><span>{item.name}</span><span className="font-bold tabular-nums">{number.format(item.members)}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#e8eee8]"><div className="h-full rounded-full bg-[#3e8f70]" style={{ width: `${item.members / highestDepartment * 100}%` }} /></div>
              </div>)}
            </div>
          </section>
          <section className="rounded-[1.5rem] border border-[#d9e2d7] bg-white p-6 sm:p-8">
            <h2 className="font-serif text-2xl text-[#173e34]">{t.diasporaTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-[#587165]">{t.diasporaIntro}</p>
            {visibleCountries.length === 0 ? <p className="mt-7 text-sm text-[#587165]">0 {t.members}</p> : <div className="mt-7 space-y-4">
              {visibleCountries.map((item) => <div key={item.code}>
                <div className="mb-1.5 flex items-center justify-between gap-4 text-sm"><span>{regionNames.of(item.code) ?? item.code}</span><span className="font-bold tabular-nums">{number.format(item.members)}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#e9eee9]"><div className="h-full rounded-full bg-[#d19c58]" style={{ width: `${item.members / highestCountry * 100}%` }} /></div>
              </div>)}
            </div>}
          </section>
        </div>}

        <footer className="border-t border-[#d5ded3] pt-5 text-sm leading-6 text-[#5a7165]">
          <p>{t.updated}: <time dateTime={stats.updatedAt}>{new Intl.DateTimeFormat(locale === "ht" ? "ht-HT" : locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(stats.updatedAt))}</time></p>
          <p className="mt-2">{t.definition}</p>
          <p className="mt-2">{t.footnote}</p>
        </footer>
      </>}
    </div>
  </MemberShell>;
}
