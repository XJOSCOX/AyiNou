"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { Institution, Locale, OrganizationKind, PersonalClaim } from "@ayinou/shared";
import { institutionMessages } from "@/lib/institution-i18n";
import { adminMessages } from "@/lib/admin-i18n";
import { useLocale } from "@/lib/locale-store";
import { trustMessages } from "@/lib/trust-i18n";

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

export function FounderMark() {
  const [locale] = useLocale();
  return <span className="inline-flex w-fit items-center rounded-md border border-[var(--theme-border)] bg-[var(--theme-selected)] px-2 py-0.5 align-middle text-xs font-semibold text-[var(--theme-text)]">
    {adminMessages[locale].founder}
  </span>;
}

export function AdministratorMark() {
  const [locale] = useLocale();
  const label = adminMessages[locale].administrator;
  return <Image src="/admin-verified.png" width={18} height={18} alt={label} title={label} unoptimized
    className="inline-block size-[18px] shrink-0 align-middle" />;
}

export function PersonalClaimChecks({ claims }: { claims: readonly PersonalClaim[] }) {
  const [locale] = useLocale();
  return claims.map((claim) => <VerifiedCheck key={claim} label={trustMessages[locale][claim]} />);
}

export function InstitutionLogo({ organization }: { organization: Pick<Institution, "name" | "logoUrl"> }) {
  return (
    <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--theme-hero)] text-xl font-bold text-[var(--theme-link)]">
      {organization.logoUrl
        ? <Image src={organization.logoUrl} width={56} height={56} alt="" unoptimized className="size-full object-cover" />
        : <span aria-hidden="true">{Array.from(organization.name)[0]?.toUpperCase() ?? ""}</span>}
    </span>
  );
}
