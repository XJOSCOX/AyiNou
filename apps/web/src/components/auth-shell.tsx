"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { DisplayControls } from "./display-controls";
import { SiteBrand } from "./site-brand";
import styles from "./auth-shell.module.css";

export function AuthShell({ children }: { children: ReactNode }) {
  const [locale] = useLocale();
  const t = authMessages[locale];

  return (
    <main className="grid min-h-dvh items-center p-3 text-[var(--theme-text)] sm:p-6 lg:p-10">
      <div className={`${styles.splitPanel} mx-auto grid w-full max-w-[1120px] gap-1 rounded-[14px] border border-[var(--theme-border)] p-2 sm:p-3 md:min-h-[610px] md:grid-cols-[1.05fr_1fr]`}>
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-hero)]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 md:py-4">
            <SiteBrand href="/" />
            <Link href="/" className="rounded-md bg-[var(--theme-surface)] px-3 py-2 text-xs font-semibold text-[var(--theme-link)] hover:underline sm:text-sm">
              {t.backHome} <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div aria-hidden="true" className="min-h-28 flex-1 bg-[url('/ayinou-coast.webp')] bg-cover bg-[center_58%] sm:min-h-40 md:min-h-0" />
          <div className="px-4 py-3 sm:px-6 md:py-6">
            <p className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-link)] md:block">{t.brandEyebrow}</p>
            <p className="text-xl font-semibold leading-tight tracking-tight md:mt-2 md:text-3xl">{t.brandTitle}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col px-4 pb-7 pt-3 sm:px-8 md:px-9 lg:px-14">
          <div className="flex items-center justify-end gap-2 md:pt-4">
            <DisplayControls />
          </div>
          <div className="my-auto w-full py-5 md:py-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
