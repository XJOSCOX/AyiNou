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
import styles from "./home-page.module.css";

export function HomePage() {
  const [locale] = useLocale();
  const t = messages[locale];
  const auth = authMessages[locale];
  const m = membershipMessages[locale];

  return (
    <div id="top" className="flex min-h-screen flex-col text-[var(--theme-text)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-[var(--theme-surface)] focus:p-4">{t.skip}</a>
      <Navbar />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1500px] flex-1 px-5 pb-14 pt-6 sm:px-8 sm:pt-9 lg:scroll-mt-18">
        <section className={`${styles.hero} grid overflow-hidden rounded-[14px] border border-[var(--theme-border)] bg-[var(--theme-surface)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
          <div className="grid content-center px-6 py-9 sm:px-10 lg:px-12 xl:px-16">
            <h1 className="max-w-[15ch] text-balance text-[clamp(2.35rem,4.4vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.048em]">{t.heroTitle}</h1>
            <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-[var(--theme-body)] lg:text-lg">{t.heroBody}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-md bg-[var(--theme-primary)] px-5 py-3 text-sm font-semibold text-[var(--theme-on-primary)] transition-colors hover:bg-[var(--theme-primary-hover)]">
                {auth.register}
                <span aria-hidden="true">→</span>
              </Link>
              <a href="#building" className="rounded-md border border-[var(--theme-border)] px-4 py-3 text-sm font-semibold text-[var(--theme-link)] transition-colors hover:bg-[var(--theme-control)]">{t.building}</a>
            </div>
          </div>
          <div className="relative m-2 aspect-[16/9] overflow-hidden rounded-lg bg-[var(--theme-hero)] md:aspect-auto md:min-h-[424px]">
            <Image src="/ayinou-coast.webp" alt="" fill sizes="(min-width: 1500px) 720px, (min-width: 768px) 50vw, 100vw" className="object-cover object-[center_62%]" preload />
          </div>
        </section>

        <WelcomeStats />

        <div className="mt-10 grid gap-7 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-10">
          <div className="min-w-0">
            <section id="building" className="scroll-mt-4 lg:scroll-mt-22">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.building}</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Object.entries({
                  ...t.topics,
                  reports: { name: m.reports, description: m.reportsBody },
                  radio: { name: m.radio, description: m.radioBody },
                }).map(([topic, content]) => (
                  <article id={topic} key={topic} className="scroll-mt-4 rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 first:bg-[var(--theme-hero)] sm:first:col-span-2 lg:scroll-mt-22">
                    <h3 className="text-lg font-semibold leading-snug tracking-tight">{content.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{content.description}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <UpdatesSidebar />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
