"use client";

import { useLocale } from "@/lib/locale-store";
import { publicContactEmail } from "@/lib/public-contact";
import en from "@/messages/about/en.json";
import es from "@/messages/about/es.json";
import fr from "@/messages/about/fr.json";
import ht from "@/messages/about/ht.json";

const copy = { en, es, fr, ht };
const sections = ["what", "mission", "vision", "why", "members", "organizations", "values", "trust", "future"] as const;

export function AboutContent() {
  const [locale] = useLocale();
  const t = copy[locale];
  return (
    <div className="public-container grid gap-4 py-6 sm:gap-6 sm:py-10">
      <header className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-9">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{t.intro.title}</h1>
        <p className="mt-4 max-w-[68ch] text-lg leading-relaxed text-[var(--theme-body)]">{t.intro.body}</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <section key={section} className="min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-6">
            <h2 className="text-xl font-semibold">{t[section].title}</h2>
            <p className="mt-2 max-w-[65ch] leading-relaxed text-[var(--theme-body)]">{t[section].body}</p>
          </section>
        ))}
      </div>
      <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-6">
        <h2 className="text-xl font-semibold">{t.contact.title}</h2>
        <p className="mt-2 max-w-[68ch] leading-relaxed text-[var(--theme-body)]">{t.contact.body}</p>
        <a href={`mailto:${publicContactEmail}`} className="mt-2 inline-flex min-h-11 items-center font-semibold text-[var(--theme-link)] underline underline-offset-4">
          {publicContactEmail}
        </a>
      </section>
    </div>
  );
}
