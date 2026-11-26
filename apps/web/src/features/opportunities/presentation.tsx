import Link from "next/link";
import type { ReactNode } from "react";
import { FeedIcon } from "@/components/feed-actions";
import { institutionCard } from "@/components/institution-ui";

export const opportunitySecondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--theme-border)] px-4 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2";
export const opportunityTag = "inline-flex w-fit items-center gap-1.5 rounded-md bg-[var(--theme-control)] px-2.5 py-1 text-xs font-semibold text-[var(--theme-body)]";

export function OpportunityPageHeader({ title, description, back }: {
  title: string;
  description: ReactNode;
  back: { href: string; label: string };
}) {
  return <header className={institutionCard + " flex flex-wrap items-start justify-between gap-x-6 gap-y-4 sm:items-center"}>
    <div className="min-w-0 flex-1 basis-60 border-s-2 border-[var(--theme-primary)] ps-4">
      <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--theme-body)]">{description}</p>
    </div>
    <Link href={back.href} className={opportunitySecondary + " ms-auto"}>
      <span aria-hidden="true">←</span>{back.label}
    </Link>
  </header>;
}

export function OpportunityState({ children, tone = "neutral" }: {
  children: ReactNode;
  tone?: "neutral" | "attention";
}) {
  return <div role={tone === "attention" ? "alert" : "status"}
    className={"flex min-w-0 items-start gap-3 rounded-lg px-4 py-3 text-sm leading-relaxed " +
      (tone === "attention" ? "bg-[var(--theme-control)] text-[var(--theme-link)]" : "bg-[var(--theme-control)] text-[var(--theme-body)]")}>
    <span className="mt-0.5"><FeedIcon name="info" /></span>
    <p className="min-w-0 break-words">{children}</p>
  </div>;
}
