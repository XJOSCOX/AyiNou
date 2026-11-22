"use client";

import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { useLocale } from "@/lib/locale-store";
import { sessionSecurityMessages } from "@/lib/session-security-i18n";

export default function PrivateWorkflowUnavailable() {
  const [locale] = useLocale();
  const t = sessionSecurityMessages[locale];
  return <AuthShell>
    <h1 className="text-3xl font-semibold">{t.unavailable}</h1>
    <p className="mt-3">{t.expiredLink}</p>
    <Link href="/settings" className="mt-4 inline-block text-[var(--theme-link)] underline">{t.back}</Link>
  </AuthShell>;
}
