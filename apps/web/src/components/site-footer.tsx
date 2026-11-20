"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApiStatus } from "@/lib/api";
import { ambassadorMessages } from "@/lib/ambassador-i18n";
import { projectMessages } from "@/lib/project-i18n";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { SiteBrand } from "./site-brand";

type Connection = "checking" | "online" | "offline";

export function SiteFooter() {
  const [locale] = useLocale();
  const t = messages[locale];
  const [connection, setConnection] = useState<Connection>("checking");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    fetchApiStatus(controller.signal)
      .then(() => { if (!cancelled) setConnection("online"); })
      .catch(() => { if (!cancelled) setConnection("offline"); })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <footer className="border-t border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className="mx-auto w-full max-w-[1500px] px-5 sm:px-8 flex flex-wrap items-center justify-between gap-3 py-5 text-sm">
        <SiteBrand href="#top" />
        <p className="text-[var(--theme-body)]">{t.footer}</p>
        <Link href="/ambassadors" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{ambassadorMessages[locale].title}</Link>
        <Link href="/projects" className="font-semibold text-[var(--theme-link)] underline underline-offset-4">{projectMessages[locale].title}</Link>
        <div className="text-[var(--theme-body)]" aria-live="polite">
          <p>{t.statusLabel} · {t[connection]}</p>
          {connection === "offline" && <p className="mt-1">{t.offlineHelp}</p>}
        </div>
      </div>
    </footer>
  );
}
