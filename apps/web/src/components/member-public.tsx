"use client";

import Image from "next/image";
import Link from "next/link";
import type { FollowStatus, ProfilePreview, PublicAmbassador } from "@ayinou/shared";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { trustMessages } from "@/lib/trust-i18n";
import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";
import { DisplayControls } from "./display-controls";
import { AmbassadorRecognition } from "./ambassador-public";
import { FounderVerifiedBadge } from "./founder-verified-badge";
import { ProfileFollowPanel } from "./discovery-accounts";
import { MemberSafetyControls } from "./member-safety";
import { AdministratorMark, FounderMark, PersonalClaimChecks, institutionCard, institutionLink } from "./institution-ui";
import { ImpersonationReportForm } from "./trust-workspace";
import { SiteBrand } from "./site-brand";
import { SiteFooter } from "./site-footer";

export function MemberPublic({ profile, username, social, ambassador, signedIn }: {
  profile: ProfilePreview; username: string; social: FollowStatus; signedIn: boolean;
  ambassador: Pick<PublicAmbassador, "category" | "statement"> | null;
}) {
  const layout = signedIn ? "w-full px-4 sm:px-8" : "public-container";
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const trust = trustMessages[locale];
  return <div id="top" className="flex min-h-dvh flex-col">
    <header className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className={`flex flex-wrap items-center justify-between gap-3 py-3 ${layout}`}>
        <SiteBrand />
        <DisplayControls />
      </div>
    </header>
    <main className={`grid flex-1 content-start gap-4 py-5 sm:py-8 ${layout}`}>
      {signedIn && <Link className={institutionLink} href="/discover">{t.discover}</Link>}
      <section className={institutionCard}>
        <div className="flex flex-wrap items-center gap-4">
          {profile.avatarUrl && <Image src={profile.avatarUrl} width={64} height={64} alt="" unoptimized
            className="size-16 shrink-0 rounded-full object-cover" />}
          <div className="min-w-0">
            <p className="text-sm text-[var(--theme-body)]">{t.profile}</p>
            <h1 className="break-words text-3xl font-semibold">{profile.displayName}</h1>
            <p className="break-all text-sm text-[var(--theme-body)]">@{username}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {profile.platformLeadership === "founder" && <FounderMark />}
          {profile.platformLeadership === "administrator" && <AdministratorMark />}
          {!!social.personalClaims?.length && <PersonalClaimChecks claims={social.personalClaims} compact={false} />}
        </div>
        {!!social.personalClaims?.length && <p className="mt-2 text-sm text-[var(--theme-body)]">{trust.noEndorsement}</p>}
        {profile.founderVerified && (social.personalClaims?.includes("identity") ?
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">{founderMessages[locale].verificationDetails}</summary>
            <FounderVerifiedBadge />
          </details> : <FounderVerifiedBadge />)}
        {profile.biography && <p className="mt-4 max-w-prose whitespace-pre-line break-words" dir="auto">{profile.biography}</p>}
        {ambassador && <AmbassadorRecognition ambassador={ambassador} />}
      </section>
      <ProfileFollowPanel target={{ kind: "member", key: username }} initial={social} signedIn={signedIn} />
      {signedIn && social.canFollow && <MemberSafetyControls username={username} />}
      {signedIn && social.canFollow && <ImpersonationReportForm username={username} />}
    </main>
    <SiteFooter member={signedIn} />
  </div>;
}
