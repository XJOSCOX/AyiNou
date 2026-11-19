"use client";

import { useEffect, useState } from "react";
import { fetchApiStatus } from "@/lib/api";
import { locales, messages, type Locale } from "@/lib/i18n";

type Connection = "checking" | "online" | "offline";

const cardMarks = ["01", "02", "03", "04"];

export function HomePage() {
  const [locale, setLocale] = useState<Locale>("ht");
  const [connection, setConnection] = useState<Connection>("checking");
  const t = messages[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    fetchApiStatus(controller.signal)
      .then(() => setConnection("online"))
      .catch(() => setConnection("offline"))
      .finally(() => window.clearTimeout(timeout));
    return () => controller.abort();
  }, []);

  function chooseLocale(nextLocale: Locale) {
    setLocale(nextLocale);
  }

  return (
    <div className="min-h-screen overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4">{t.skip}</a>
      <header className="relative z-10 border-b border-[#174e41]/10 bg-[#f8f6ef]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
          <a href="#top" className="flex items-center gap-3" aria-label="AYINOU">
            <span className="flex size-10 items-center justify-center rounded-full bg-[#155746] text-lg font-black text-[#f5d184]" aria-hidden="true">A</span>
            <span className="text-xl font-black tracking-[0.2em] text-[#143e36]">AYINOU</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-[#365e54] md:flex" aria-label="Main navigation">
            <a href="#mission" className="hover:text-[#a6642e]">{t.nav.mission}</a>
            <a href="#spaces" className="hover:text-[#a6642e]">{t.nav.spaces}</a>
            <a href="#about" className="hover:text-[#a6642e]">{t.nav.about}</a>
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold uppercase tracking-widest text-[#58756b] sm:block">{t.languageLabel}</span>
            <div className="flex rounded-full border border-[#b8c8b9] bg-white/80 p-1" role="group" aria-label={t.languageLabel}>
              {locales.map((option) => (
                <button key={option} type="button" onClick={() => chooseLocale(option)} aria-pressed={locale === option}
                  className={`rounded-full px-2.5 py-1.5 text-xs font-bold uppercase transition sm:px-3 ${locale === option ? "bg-[#155746] text-white" : "text-[#42675b] hover:bg-[#eaf0e8]"}`}>
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main id="main">
        <section id="top" className="relative isolate bg-[#f4f1e6]">
          <div className="absolute -right-24 top-12 -z-10 size-[430px] rounded-full border-[70px] border-[#e4e8d6] opacity-80 md:right-[5%] md:top-14 md:size-[620px] md:border-[95px]" aria-hidden="true" />
          <div className="absolute -right-14 top-56 -z-10 size-64 rounded-full bg-[#efc984]/45 blur-3xl md:right-[13%]" aria-hidden="true" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-16 sm:px-8 md:grid-cols-[1.1fr_0.9fr] md:pb-24 md:pt-24 lg:px-12">
            <div className="max-w-2xl">
              <p className="mb-6 inline-flex items-center gap-3 text-xs font-extrabold tracking-[0.22em] text-[#a3622a]"><span className="h-px w-8 bg-[#bc7f3d]" />{t.eyebrow}</p>
              <h1 className="max-w-[750px] font-serif text-[clamp(3.4rem,7vw,6.5rem)] leading-[1.02] tracking-[-0.055em] text-[#143d35]">{t.heroTitle}</h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-[#48665c] sm:text-lg">{t.heroBody}</p>
              <div className="mt-9 flex flex-wrap items-center gap-5">
                <a href="#spaces" className="rounded-full bg-[#155746] px-7 py-4 text-sm font-bold text-white shadow-lg shadow-[#155746]/15 transition hover:bg-[#0c3d31]">{t.explore} <span aria-hidden="true">↗</span></a>
                <a href="#mission" className="border-b border-[#b7783a] pb-1 text-sm font-bold text-[#184b3e] hover:text-[#a6642e]">{t.missionLink}</a>
              </div>
            </div>
            <div className="relative mx-auto flex min-h-[330px] w-full max-w-[470px] items-center justify-center md:min-h-[510px]" aria-hidden="true">
              <div className="absolute size-[290px] rounded-full bg-[#e1a64d] shadow-[0_20px_100px_#cb9c5066] sm:size-[380px]" />
              <div className="absolute size-[246px] rounded-full border border-[#f9e8c2]/80 sm:size-[326px]" />
              <div className="absolute size-[190px] rounded-full border border-[#f9e8c2]/80 sm:size-[260px]" />
              <div className="absolute top-[22%] left-[6%] h-20 w-20 rounded-full bg-[#174f40] shadow-xl sm:h-24 sm:w-24" />
              <div className="absolute right-[7%] bottom-[23%] h-16 w-16 rounded-full bg-[#f2e5ca] shadow-xl sm:h-20 sm:w-20" />
              <span className="relative -rotate-6 font-serif text-[9rem] leading-none text-[#fff4d7] drop-shadow-lg sm:text-[12rem]">A</span>
              <div className="absolute bottom-2 left-2 right-2 rounded-2xl border border-white/60 bg-white/80 px-5 py-4 text-center text-sm font-semibold text-[#275648] shadow-lg backdrop-blur-sm sm:bottom-0">{t.heroNote}</div>
            </div>
          </div>
        </section>

        <section id="mission" className="bg-[#174e41] px-5 py-20 text-white sm:px-8 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-7 md:grid-cols-[0.7fr_1.3fr] md:gap-16">
            <p className="text-xs font-extrabold tracking-[0.22em] text-[#e8be75]">{t.missionEyebrow}</p>
            <div>
              <h2 className="max-w-3xl font-serif text-4xl leading-tight tracking-tight sm:text-5xl">{t.missionTitle}</h2>
              <p className="mt-6 max-w-2xl text-base leading-8 text-[#d5e4db]">{t.missionBody}</p>
            </div>
          </div>
        </section>

        <section id="spaces" className="px-5 py-20 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-extrabold tracking-[0.22em] text-[#a3622a]">{t.spacesEyebrow}</p>
            <div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <h2 className="max-w-xl font-serif text-4xl leading-tight tracking-tight text-[#153e35] sm:text-5xl">{t.spacesTitle}</h2>
              <p className="max-w-md text-sm leading-7 text-[#587067]">{t.spacesBody}</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {t.cards.map((card, index) => (
                <article key={cardMarks[index]} className="min-h-64 rounded-[1.5rem] border border-[#d8dfd1] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                  <div className="flex items-start justify-between"><span className="text-sm font-bold text-[#b37a3d]">{cardMarks[index]}</span><span className="text-2xl text-[#b5c7b3]" aria-hidden="true">✳</span></div>
                  <h3 className="mt-12 font-serif text-2xl text-[#164a3d]">{card.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#60746b]">{card.description}</p>
                  <p className="mt-5 text-xs font-bold uppercase tracking-widest text-[#a66a35]">{t.comingSoon}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer id="about" className="border-t border-[#d7dfd3] bg-[#edf0e7] px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 text-sm text-[#46665b] sm:flex-row sm:items-center">
          <div><span className="font-black tracking-[0.18em] text-[#164b3d]">AYINOU</span><span className="ml-4">{t.footer}</span></div>
          <div aria-live="polite" className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${connection === "online" ? "bg-emerald-600" : connection === "offline" ? "bg-amber-600" : "bg-slate-400"}`} aria-hidden="true" />
            <span className="font-semibold">{t.statusLabel}:</span>
            <span>{connection === "online" ? t.online : connection === "offline" ? t.offline : t.checking}</span>
            {connection === "offline" && <span className="sr-only">{t.offlineHelp}</span>}
          </div>
        </div>
        {connection === "offline" && <p className="mx-auto mt-3 max-w-7xl text-sm text-[#8a592a]">{t.offlineHelp}</p>}
      </footer>
    </div>
  );
}
