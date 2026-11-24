"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { Institution, Locale, OrganizationKind, PersonalClaim } from "@ayinou/shared";
import { institutionMessages } from "@/lib/institution-i18n";
import { adminMessages } from "@/lib/admin-i18n";
import { useLocale } from "@/lib/locale-store";
import { trustMessages } from "@/lib/trust-i18n";
import { DesignationMark } from "./designation-mark";

export const institutionCard = "min-w-0 rounded-[10px] border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-6";
export const institutionField = "mt-1.5 block min-h-11 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] px-3 py-2 text-[var(--theme-text)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)]";
export const institutionAction = "inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--theme-primary)] px-4 py-2 text-sm font-semibold text-[var(--theme-on-primary)] hover:bg-[var(--theme-primary-hover)] disabled:opacity-60";
export const institutionLink = "text-sm font-semibold text-[var(--theme-link)] underline underline-offset-4 hover:no-underline";
export const institutionErrorBox = "rounded-md bg-[var(--theme-error-bg)] p-3 text-sm text-[var(--theme-error-text)]";

export function useInstitutionResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loader(controller.signal).then((value) => {
      if (!controller.signal.aborted) { setData(value); setError(null); }
    }).catch((cause) => {
      if (!controller.signal.aborted) { setData(null); setError(cause); }
    });
    return () => controller.abort();
  }, [loader, version]);
  return { data, error, refresh: () => setVersion((value) => value + 1) };
}

export function institutionBadgeLabel(locale: Locale, kind: OrganizationKind) {
  const trust = trustMessages[locale];
  return {
    haitian_organization: trust.verifiedHaitian, international_organization: trust.verifiedInternational,
    nonprofit: trust.verifiedNonprofit, ngo: trust.verifiedNGO, foundation: trust.verifiedFoundation,
    business: trust.verifiedBusiness, education: trust.verifiedSchool, media: trust.verifiedMedia,
    municipality: trust.verifiedGovernment, ministry: trust.verifiedGovernment,
    embassy: trust.verifiedGovernment, government_agency: trust.verifiedGovernment,
  }[kind];
}

export function InstitutionStatus({ status, kind }: { status: Institution["verificationStatus"]; kind: OrganizationKind }) {
  const [locale] = useLocale();
  const t = institutionMessages[locale];
  if (status === "verified") return <VerifiedBadge label={institutionBadgeLabel(locale, kind)} />;
  return <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${status === "revoked"
    ? "bg-[var(--theme-error-bg)] text-[var(--theme-error-text)]"
    : "bg-[var(--theme-selected)] text-[var(--theme-link)]"}`}>{t[status]}</span>;
}

export function VerifiedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--theme-verified-bg)] px-2.5 py-1 text-xs font-bold text-[var(--theme-verified-text)]">
      <VerifiedCheck />
      {label}
    </span>
  );
}

export function VerifiedCheck({ label }: { label?: string }) {
  return (
    <Image src="/verified-badge.png" width={18} height={18} alt={label ?? ""} title={label} unoptimized
      className="inline-block size-[18px] shrink-0 align-middle" />
  );
}

export function FounderMark({ compact }: { compact?: boolean }) {
  const [locale] = useLocale();
  return <DesignationMark kind="founder" label={adminMessages[locale].founder} compact={compact} />;
}

export function AdministratorMark({ compact }: { compact?: boolean }) {
  const [locale] = useLocale();
  return <DesignationMark kind="administrator" label={adminMessages[locale].administrator} compact={compact} />;
}

export function PersonalClaimChecks({ claims, compact = true }: { claims: readonly PersonalClaim[]; compact?: boolean }) {
  const [locale] = useLocale();
  return claims.map((claim) => <DesignationMark key={claim} kind="identity" label={trustMessages[locale][claim]} compact={compact} />);
}

export function InstitutionLogo({ organization, large = false }: {
  organization: Pick<Institution, "name" | "logoUrl">;
  large?: boolean;
}) {
  const imageSize = large ? 112 : 68;
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden font-bold text-[var(--theme-link)] ${
      large ? "size-20 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] text-3xl sm:size-28 sm:text-4xl" : "size-17 rounded-lg bg-[var(--theme-hero)] text-2xl"
    }`}>
      {organization.logoUrl
        ? <Image src={organization.logoUrl} width={imageSize} height={imageSize} alt="" unoptimized className="size-full object-cover" />
        : <span aria-hidden="true">{Array.from(organization.name)[0]?.toUpperCase() ?? ""}</span>}
    </span>
  );
}
