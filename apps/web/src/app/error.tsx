"use client";

import { authMessages } from "@/lib/auth-i18n";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";

export default function PageError({ retry }: { retry: () => void }) {
  const [locale] = useLocale();
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-5 p-6">
      <h1 className="text-3xl font-semibold">{messages[locale].pageError}</h1>
      <button type="button" onClick={retry} className="justify-self-start font-semibold text-[var(--theme-link)] underline">
        {authMessages[locale].retry}
      </button>
    </main>
  );
}
