"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { DisplayControls } from "./display-controls";
import { SiteBrand } from "./site-brand";
import { HomeSlideshow } from "./home-slideshow";
import styles from "./auth-shell.module.css";

export function AuthShell({ children }: { children: ReactNode }) {
  const [locale] = useLocale();
  const t = authMessages[locale];

  return (
    <main className="grid min-h-dvh items-center p-3 text-[var(--theme-text)] sm:p-6 lg:p-10">
      <div className={`${styles.splitPanel} ${styles.entryPanel} mx-auto grid w-full overflow-hidden rounded-[14px] border border-[var(--theme-border)]`}>
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--theme-hero)]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 md:py-4">
            <SiteBrand href="/" />
            <Link href="/" className="rounded-md bg-[var(--theme-surface)] px-3 py-2 text-xs font-semibold text-[var(--theme-link)] hover:underline sm:text-sm">
              {t.backHome} <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className={styles.gallerySlot}><HomeSlideshow locale={locale} /></div>
          <div className="px-4 py-3 sm:px-6 md:py-6">
            <p className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-link)] md:block">{t.brandEyebrow}</p>
            <p className="text-xl font-semibold leading-tight tracking-tight md:mt-2 md:text-3xl">{t.brandTitle}</p>
          </div>
        </div>
        <div className={`flex min-h-0 min-w-0 flex-col ${styles.entryForm}`}>
          <div className={`flex items-center justify-end gap-2 ${styles.entryControls}`}>
            <DisplayControls />
          </div>
          <div className={styles.formScroll}>
            <div className="my-auto w-full">{children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
