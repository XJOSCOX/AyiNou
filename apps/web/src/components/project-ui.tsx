"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ProjectStatus } from "@ayinou/shared";
import { authMessages } from "@/lib/auth-i18n";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import { loadProjectOptions } from "@/lib/project-api";
import { projectMessages } from "@/lib/project-i18n";
import { projectWorkMessages } from "@/lib/project-work-i18n";
import { useInstitutionResource } from "./institution-ui";

export const projectPanel = "min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]";
export const projectLink = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2";
export const projectBadge = "inline-flex w-fit items-center rounded-md bg-[var(--theme-control)] px-2.5 py-1 text-xs font-semibold text-[var(--theme-body)]";
type BadgeStatus = ProjectStatus | "published";

const approvalIcon = "/project-approved.png";
const statusIcons: Partial<Record<BadgeStatus, string[]>> = {
  approved: [approvalIcon],
  published: [approvalIcon, "/project-published.png"],
  rejected: ["/project-rejected.png"],
  changes_requested: ["/project-changes-requested.png"],
};

export function ProjectStatusBadge({ children, status }: { children: ReactNode; status?: BadgeStatus }) {
  const icons = status ? statusIcons[status] : undefined;
  const colors = status === "rejected"
    ? " !bg-[var(--theme-error-bg)] !text-[var(--theme-error-text)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--theme-error-text)_35%,transparent)]"
    : " !bg-[var(--theme-selected)] !text-[var(--theme-link)]";
  return <span className={projectBadge + " gap-1.5" + colors}>
    {icons?.map((icon) => <Image key={icon} src={icon} alt="" width={100} height={100} unoptimized className="size-5 shrink-0" />)}
    {children}
  </span>;
}

export function ProjectPublicationBadge({ previousVersion = false }: { previousVersion?: boolean }) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  return <ProjectStatusBadge status="published">{previousVersion ? t.previousVersionPublished : t.publishedStatus}</ProjectStatusBadge>;
}

function ReviewNavigationLink({ current, label }: { current?: ProjectsArea; label: string }) {
  const options = useInstitutionResource(loadProjectOptions);
  if (!options.data?.canReview) return null;
  return <Link href="/projects/review" aria-current={current === "review" ? "page" : undefined} className={navigationLink}>{label}</Link>;
}

const navigationLink = "inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-body)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-[var(--theme-selected)] aria-[current=page]:text-[var(--theme-link)]";

export function ProjectBackButton({ fallback }: { fallback: string }) {
  const [locale] = useLocale();
  return <Link href={fallback} className={projectLink} onClick={(event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const historyNavigation = (window as Window & {
      navigation?: { currentEntry: { index: number } | null; entries(): { url: string | null }[] };
    }).navigation;
    const index = historyNavigation?.currentEntry?.index ?? -1;
    const previous = index > 0 ? historyNavigation?.entries()[index - 1]?.url : null;
    if (!previous || new URL(previous).origin !== window.location.origin) return;
    event.preventDefault();
    window.history.back();
  }}>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
    {membershipMessages[locale].back}
  </Link>;
}

export function ProjectDisclosure({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <details className={`group min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] ${className}`}>
    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
      <span>{title}</span>
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--theme-control)] group-open:bg-[var(--theme-selected)]">
        <svg className="motion-safe:transition-transform group-open:rotate-180" viewBox="0 0 24 24" width="16" height="16" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </span>
    </summary>
    <div className="grid min-w-0 gap-3 border-t border-[var(--theme-border)] p-3">{children}</div>
  </details>;
}

type ProjectsArea = "directory" | "manage" | "work" | "review";

export function ProjectsHeader({ title, description, meta, current, showNavigation = true, canReview, backHref = "/projects", actions, children }: {
  title: string; description?: string; meta?: ReactNode; current?: ProjectsArea; showNavigation?: boolean; canReview?: boolean;
  backHref?: string; actions?: ReactNode; children?: ReactNode;
}) {
  const [locale] = useLocale();
  const t = projectMessages[locale];
  const links = [
    { area: "directory", href: "/projects", label: t.title },
    { area: "manage", href: "/projects/manage", label: t.manage },
    { area: "work", href: "/projects/team", label: projectWorkMessages[locale].workspace },
  ];
  return <header className={projectPanel}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
      <div className="min-w-0 flex-[1_1_17rem]">
        <h1 dir="auto" className="break-words text-3xl font-bold leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-[var(--theme-body)]">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--theme-body)]">{meta}</div>}
      </div>
      <div className="flex min-w-0 flex-wrap gap-2"><ProjectBackButton fallback={backHref} />{actions}</div>
    </div>
    {showNavigation && <nav aria-label={t.title} className="flex flex-wrap gap-1 border-t border-[var(--theme-border)] px-2 py-2 sm:px-3">
      {links.map(({ area, href, label }) => <Link key={area} href={href} aria-current={current === area ? "page" : undefined}
        className={navigationLink}>{label}</Link>)}
      {canReview === undefined ? <ReviewNavigationLink current={current} label={t.reviewQueue} />
        : canReview && <Link href="/projects/review" aria-current={current === "review" ? "page" : undefined}
          className={navigationLink}>{t.reviewQueue}</Link>}
    </nav>}
    {children}
  </header>;
}

export function ProjectSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <section className={projectPanel}>
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--theme-border)] px-4 py-3 sm:px-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {count !== undefined && <span className={projectBadge}>{count}</span>}
    </div>
    <div className="grid min-w-0 gap-3 p-4 sm:p-5">{children}</div>
  </section>;
}

export function ProjectLoading({ cards = 2, className = "grid gap-3 sm:grid-cols-2" }: { cards?: number; className?: string }) {
  const [locale] = useLocale();
  return <div role="status">
    <span className="sr-only">{authMessages[locale].working}</span>
    <div aria-hidden="true" className={className}>
      {Array.from({ length: cards }, (_, index) => <div key={index} className={projectPanel + " grid gap-3 p-5 motion-safe:animate-pulse"}>
        <div className="h-5 w-2/5 rounded bg-[var(--theme-selected)]" />
        <div className="h-4 w-3/5 rounded bg-[var(--theme-control)]" />
        <div className="h-4 w-1/4 rounded bg-[var(--theme-control)]" />
      </div>)}
    </div>
  </div>;
}
