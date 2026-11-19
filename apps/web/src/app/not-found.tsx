"use client";

import Link from "next/link";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";

export default function NotFound() {
  const [locale] = useLocale();
  const t = messages[locale];
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-5 p-6">
      <h1 className="text-3xl font-semibold">{t.notFound}</h1>
      <Link href="/" className="font-semibold text-[var(--theme-link)] underline">{t.home}</Link>
    </main>
  );
}
