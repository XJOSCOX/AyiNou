"use client";

import Image from "next/image";
import Link from "next/link";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { authMessages } from "@/lib/auth-i18n";
import { Navbar } from "./navbar";
import { UpdatesSidebar } from "./updates-sidebar";
import { SiteFooter } from "./site-footer";
import { membershipMessages } from "@/lib/membership-i18n";
import { WelcomeStats } from "./welcome-stats";

export function HomePage() {
  const [locale] = useLocale();
  const t = messages[locale];
  const auth = authMessages[locale];
  const m = membershipMessages[locale];

  return (
    <div id="top" className="flex min-h-screen flex-col bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-[var(--theme-surface)] focus:p-4">{t.skip}</a>
      <Navbar />
      <div className="mx-auto w-full max-w-[1500px] px-5 sm:px-8 grid flex-1 gap-y-8 py-6 sm:py-9 lg:grid-cols-[248px_minmax(0,1fr)] lg:py-0 xl:grid-cols-[270px_minmax(0,1fr)]">
        <UpdatesSidebar />

        <main id="main" tabIndex={-1} className="min-w-0 lg:py-9 lg:pl-8 xl:pl-10">
          <section className="grid overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-hero)] md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="px-6 py-8 sm:p-10 xl:p-14">
              <h1 className="text-balance text-[clamp(2.25rem,4.25vw,4.5rem)] font-extrabold leading-[1.06] tracking-[-0.055em]">{t.heroTitle}</h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--theme-body)] lg:text-lg">{t.heroBody}</p>
              <Link href="/register" className="mt-6 inline-block rounded-lg border border-[var(--theme-button-border)] bg-[var(--theme-button)] px-4 py-3 text-sm font-bold hover:bg-[var(--theme-button-hover)]">{auth.register}</Link>
            </div>
            <div className="relative aspect-[16/9] bg-[var(--theme-hero)] md:aspect-auto">
              <Image src="/ayinou-coast.webp" alt="" fill sizes="(min-width: 1500px) 455px, (min-width: 1024px) 32vw, (min-width: 768px) 40vw, 100vw" className="object-cover" preload />
            </div>
          </section>

          <WelcomeStats />

          <section className="mt-10 sm:mt-12">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.building}</h2>
            <div className="mt-5 grid border-t border-[var(--theme-border)] sm:grid-cols-3">
              {Object.entries({
                ...t.topics,
                reports: { name: m.reports, description: m.reportsBody },
                radio: { name: m.radio, description: m.radioBody },
              }).map(([topic, content]) => (
                <article id={topic} key={topic} className="scroll-mt-4 border-b border-[var(--theme-border)] py-4 sm:border-b-0 sm:px-4 sm:first:pl-0 sm:last:pr-0 sm:not-first:border-l">
                  <h3 className="text-lg font-bold leading-snug tracking-tight">{content.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{content.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="about" className="mt-9 max-w-3xl scroll-mt-4">
            <h2 className="text-lg font-bold">{t.about}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{t.missionBody}</p>
            <h3 className="mt-5 font-bold">{m.how}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{m.howBody}</p>
          </section>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
