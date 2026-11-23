"use client";

import Image from "next/image";
import Link from "next/link";
import type { FollowStatus, ProfilePreview, PublicAmbassador, RecognitionBadge } from "@ayinou/shared";
import { authMessages } from "@/lib/auth-i18n";
import { membershipMessages } from "@/lib/membership-i18n";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { trustMessages } from "@/lib/trust-i18n";
import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";
import { AmbassadorRecognition } from "./ambassador-public";
import { FounderVerifiedBadge } from "./founder-verified-badge";
import { ProfileFollowPanel } from "./discovery-accounts";
import { MemberSafetyControls } from "./member-safety";
import { AdministratorMark, FounderMark, PersonalClaimChecks, institutionCard, institutionLink } from "./institution-ui";
import { ImpersonationReportForm } from "./trust-workspace";
import { MemberShell } from "./member-shell";
import { RecognitionMark } from "./recognition-mark";
import { useVerificationPresentation } from "./verification-presentation";
import { verificationCopy } from "@/lib/verification-policy-i18n";

export function MemberPublic({ profile, username, social, ambassador, recognition, signedIn }: {
  profile: ProfilePreview; username: string; social: FollowStatus; signedIn: boolean;
  recognition: RecognitionBadge[];
  ambassador: Pick<PublicAmbassador, "category" | "statement"> | null;
}) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  const trust = trustMessages[locale];
  const presentation = useVerificationPresentation();
  const membership = membershipMessages[locale];
  const country = profile.countryCode && new Intl.DisplayNames([locale === "ht" ? "ht-HT" : locale], { type: "region" }).of(profile.countryCode);
  return <MemberShell signedIn={signedIn}>
    <div className="grid min-w-0 gap-4">
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
        {presentation.showBlue && !!social.personalClaims?.length && <p className="mt-2 text-sm text-[var(--theme-body)]">{trust.noEndorsement}</p>}
        {presentation.showGold && profile.founderVerified && (presentation.showBlue && social.personalClaims?.includes("identity") ?
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">{founderMessages[locale].verificationDetails}</summary>
            <FounderVerifiedBadge />
          </details> : <FounderVerifiedBadge />)}
        {profile.biography && <p className="mt-4 max-w-prose whitespace-pre-line break-words" dir="auto">{profile.biography}</p>}
        {(country || profile.departmentName || !!profile.interests?.length) && <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          {country && <div><dt className="font-semibold">{authMessages[locale].country}</dt><dd>{country}</dd></div>}
          {profile.departmentName && <div><dt className="font-semibold">{authMessages[locale].departmentConnection}</dt><dd>{profile.departmentName}</dd></div>}
          {!!profile.interests?.length && <div><dt className="font-semibold">{membership.interests}</dt>
            <dd>{profile.interests.map((code) => membership[code]).join(", ")}</dd></div>}
        </dl>}
        {!!recognition.length && <section className="mt-4 grid gap-2">
          <h2 className="font-semibold">{verificationCopy[locale].copy.decorative}</h2>
          <ul className="flex flex-wrap gap-2">{recognition.map((badge) => <li key={badge.id}><RecognitionMark badge={badge} /></li>)}</ul>
        </section>}
        {ambassador && <AmbassadorRecognition ambassador={ambassador} />}
      </section>
      <ProfileFollowPanel target={{ kind: "member", key: username }} initial={social} signedIn={signedIn} />
      {signedIn && social.canFollow && <MemberSafetyControls username={username} />}
      {signedIn && social.canFollow && <ImpersonationReportForm username={username} />}
    </div>
  </MemberShell>;
}
