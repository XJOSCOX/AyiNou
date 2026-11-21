"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CommunityStats, MemberProfile } from "@ayinou/shared";
import { fetchCommunityStats, fetchMyProfile } from "@/lib/api";
import { authMessages } from "@/lib/auth-i18n";
import { accountMessages } from "@/lib/account-i18n";
import { communityMessages } from "@/lib/community-i18n";
import { useLocale } from "@/lib/locale-store";
import { useMemberIdentity } from "@/lib/member-display-name";
import { membershipMessages } from "@/lib/membership-i18n";
import { AdministratorMark, FounderMark, PersonalClaimChecks } from "./institution-ui";
import { MemberShell } from "./member-shell";

export function Dashboard() {
  const [locale] = useLocale();
  const { claims, administrator, founder } = useMemberIdentity();
  const t = communityMessages[locale];
  const auth = authMessages[locale];
  const account = accountMessages[locale];
  const m = membershipMessages[locale];
  const router = useRouter();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    fetchMyProfile().then((loaded) => {
      if (!loaded.displayName || ((loaded.onboardingStep ?? 0) > 0 && loaded.onboardingStep !== 4)) {
        router.replace("/onboarding"); return;
      }
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
      <section className="relative overflow-hidden rounded-[14px] bg-[var(--theme-primary)] px-5 py-7 text-[var(--theme-on-primary)] sm:px-10 sm:py-10">
        <div aria-hidden="true" className="absolute -right-16 -top-24 h-72 w-72 rounded-full border-[42px] border-[var(--theme-chart)]/30" />
        <div aria-hidden="true" className="absolute -bottom-36 right-28 h-72 w-72 rounded-full border-[36px] border-[var(--theme-on-primary-accent)]/15" />
        <div className="relative max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--theme-on-primary-accent)]">{t.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--theme-on-primary-muted)] sm:text-lg">{t.intro}</p>
          {profile && <p className="mt-6 text-sm text-[var(--theme-on-primary-muted)]">
            {auth.dashboardTitle.replace("{name}", profile.displayName ?? "")}
            {profile.displayName && <PersonalClaimChecks claims={claims} />}
            {founder ? <FounderMark /> : administrator && <AdministratorMark />}
          </p>}
          {profileError && <p role="alert" className="mt-6 text-sm text-[var(--theme-on-primary-error)]">{auth.loadError}</p>}
          <div className="mt-7 flex flex-wrap gap-3">
            {profile?.onboardingStep === 0 && <Link href="/onboarding" className="rounded-md border border-current px-4 py-2.5 text-sm font-bold">{m.finish}</Link>}
            <button type="button" disabled className="cursor-not-allowed rounded-md border border-current px-4 py-2.5 text-sm font-semibold opacity-75">{account.comingSoon}</button>
          </div>
        </div>
      </section>

      {!stats && !statsError && <p role="status" className="rounded-2xl bg-[var(--theme-surface)] p-8 text-[var(--theme-body)]">{t.loading}</p>}
      {statsError && <div role="alert" className="rounded-2xl border border-[var(--theme-button-border)] bg-[var(--theme-error-bg)] p-6 text-[var(--theme-error-text)]">
        <p>{t.error}</p>
        <button type="button" onClick={() => { setStatsError(false); setRetry((value) => value + 1); }} className="mt-4 rounded-full bg-[var(--theme-primary)] px-5 py-2 text-sm font-bold text-[var(--theme-on-primary)]">{t.retry}</button>
      </div>}

      {stats && <>
        {stats.registered === 0 && <p role="status" className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 text-[var(--theme-body)]">{t.empty}</p>}
        <section aria-label={t.eyebrow} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {([
            [t.registered, stats.registered, "var(--theme-hero)"],
            [t.haiti, stats.haiti, "var(--theme-selected)"],
            [t.diaspora, stats.diaspora, "var(--theme-control)"],
            [t.represented, stats.representedDepartments, "var(--theme-hero)"],
          ] as const).map(([label, value, color]) => <article key={label} className="rounded-[10px] border border-[var(--theme-border)] p-5 sm:min-h-36 sm:p-6" style={{ backgroundColor: color }}>
            <p className="text-sm font-semibold text-[var(--theme-body)]">{label}</p>
            <p className={`mt-3 font-semibold ${value == null ? "text-base leading-6" : "text-4xl tabular-nums"}`}>{count(value)}{label === t.represented && value != null && <span className="ml-2 text-sm font-semibold text-[var(--theme-body)]">{t.ofTen}</span>}</p>
          </article>)}
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {([[t.active, stats.active], [t.verified, stats.verified], [t.unknown, stats.unknown]] as const).map(([label, value]) => <article key={label} className="rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-surface)] px-6 py-5">
            <p className="text-sm text-[var(--theme-body)]">{label}</p><p className={`mt-2 font-semibold ${value == null ? "text-sm" : "text-3xl tabular-nums"} text-[var(--theme-link)]`}>{count(value)}</p>
          </article>)}
        </section>

        {!stats.geographyAvailable && <aside className="rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-surface)] p-7" role="note">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--theme-link)]">{t.suppressed}</p>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--theme-body)]">{t.privacy}</p>
        </aside>}

        {stats.geographyAvailable && <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
            <h2 className="text-2xl font-semibold tracking-tight">{t.departmentTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{t.departmentIntro}</p>
            <div className="mt-7 space-y-4">
              {visibleDepartments.map((item) => <div key={item.code}>
                <div className="mb-1.5 flex items-center justify-between gap-4 text-sm"><span>{item.name}</span><span className="font-bold tabular-nums">{number.format(item.members)}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--theme-control)]"><div className="h-full rounded-full bg-[var(--theme-chart)]" style={{ width: `${item.members / highestDepartment * 100}%` }} /></div>
              </div>)}
            </div>
          </section>
          <section className="rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
            <h2 className="text-2xl font-semibold tracking-tight">{t.diasporaTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{t.diasporaIntro}</p>
            {visibleCountries.length === 0 ? <p className="mt-7 text-sm text-[var(--theme-body)]">0 {t.members}</p> : <div className="mt-7 space-y-4">
              {visibleCountries.map((item) => <div key={item.code}>
                <div className="mb-1.5 flex items-center justify-between gap-4 text-sm"><span>{regionNames.of(item.code) ?? item.code}</span><span className="font-bold tabular-nums">{number.format(item.members)}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--theme-control)]"><div className="h-full rounded-full bg-[var(--theme-chart-secondary)]" style={{ width: `${item.members / highestCountry * 100}%` }} /></div>
              </div>)}
            </div>}
          </section>
        </div>}

        {stats.membership !== undefined && <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6">
          <h2 className="text-xl font-bold">{m.memberBreakdown}</h2>
          <p className="mt-2 text-sm text-[var(--theme-body)]">{m.membershipNote}</p>
          {stats.membership ? <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            {[[m.haitianCount, stats.membership.haitian], [m.supporterCount, stats.membership.internationalSupporter], [m.unspecifiedCount, stats.membership.unspecified]].map(([label, value]) =>
              <div key={label}><dt>{label}</dt><dd className="text-2xl font-bold">{number.format(Number(value))}</dd></div>)}
          </dl> : <p className="mt-4 text-sm">{m.membershipHidden}</p>}
        </section>}

        <div className="border-t border-[var(--theme-border)] pt-5 text-sm leading-6 text-[var(--theme-body)]">
          <p>{t.updated}: <time dateTime={stats.updatedAt}>{new Intl.DateTimeFormat(locale === "ht" ? "ht-HT" : locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(stats.updatedAt))}</time></p>
          <p className="mt-2">{t.definition}</p>
          <p className="mt-2">{t.footnote}</p>
        </div>
      </>}
    </div>
  </MemberShell>;
}
