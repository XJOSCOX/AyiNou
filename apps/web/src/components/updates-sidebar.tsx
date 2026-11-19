"use client";

import Link from "next/link";
import { authMessages } from "@/lib/auth-i18n";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";

export function UpdatesSidebar() {
  const [locale] = useLocale();
  const t = messages[locale];
  const auth = authMessages[locale];
  return (
    <aside aria-labelledby="updates-heading" className="self-start rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-hero)] p-5">
      <h2 id="updates-heading" className="text-lg font-extrabold tracking-tight">{t.updates}</h2>
      <div className="mt-4 border-y border-[var(--theme-border)] py-4">
        <h3 className="font-bold">{t.memberAccess}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-body)]">{t.memberUpdate}</p>
        <Link href="/login" className="mt-3 inline-block text-sm font-bold text-[var(--theme-link)] hover:underline">{auth.login}</Link>
      </div>
      <nav aria-label={t.building} className="mt-6">
        <h3 className="font-bold">{t.building}</h3>
        <ul className="mt-2 divide-y divide-[var(--theme-border)]">
          {Object.entries(t.topics).map(([topic, { name }]) => (
            <li key={topic}><a href={`#${topic}`} className="block py-3 text-sm font-semibold text-[var(--theme-link)] hover:underline">{name}</a></li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
