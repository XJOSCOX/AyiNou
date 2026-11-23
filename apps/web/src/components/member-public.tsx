"use client";

import Image from "next/image";
import Link from "next/link";
import type { FollowStatus, ProfilePreview, PublicAmbassador, RecognitionBadge } from "@ayinou/shared";
import { f24Messages } from "@/lib/f24-i18n";
import { founderMessages } from "@/lib/founder-i18n";
import { useLocale } from "@/lib/locale-store";
import { membershipMessages } from "@/lib/membership-i18n";
import { trustMessages } from "@/lib/trust-i18n";
import { verificationCopy } from "@/lib/verification-policy-i18n";
import { AmbassadorRecognition } from "./ambassador-public";
import { ProfileFollowPanel } from "./discovery-accounts";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { AdministratorMark, FounderMark, PersonalClaimChecks, institutionAction, institutionCard } from "./institution-ui";
import { MemberSafetyControls } from "./member-safety";
import { MemberShell } from "./member-shell";
import { RecognitionMark } from "./recognition-mark";
import { MemberActivity } from "./social-activity";
import { ImpersonationReportForm } from "./trust-workspace";
import { useVerificationPresentation } from "./verification-presentation";

type MemberPublicProps = {
  profile: ProfilePreview;
  username: string;
  social: FollowStatus;
  signedIn: boolean;
  recognition: RecognitionBadge[];
  ambassador: Pick<PublicAmbassador, "category" | "statement"> | null;
};

export function MemberPublic({ profile, username, social, ambassador, recognition, signedIn }: MemberPublicProps) {
  const [locale] = useLocale();
  const t = f24Messages[locale];
  const membership = membershipMessages[locale];
  const presentation = useVerificationPresentation();
  const displayName = profile.displayName || username;
  const initials = displayName.trim().split(/\s+/).slice(0, 2)
    .map((word) => Array.from(word)[0]).join("").toLocaleUpperCase(locale);
  const showClaims = presentation.showBlue && !!social.personalClaims?.length;
  const founderVerified = presentation.showGold && profile.founderVerified;
  const showDetails = profile.detailsVisible !== false;
  const country = profile.countryCode && new Intl.DisplayNames([locale === "ht" ? "ht-HT" : locale], { type: "region" }).of(profile.countryCode);
  const category = profile.membershipCategory === "haitian" ? membership.haitianCount
    : profile.membershipCategory === "international_supporter" ? membership.supporterCount : null;
  const interests = profile.interests ?? [];
  const hasAbout = showDetails && !!(profile.biography || category || country || profile.departmentName || interests.length);
  const hasRecognition = showDetails && !!(recognition.length || ambassador);
  const memberTools = signedIn && !social.self;
  const showFollowPanel = social.showFollowers !== false || social.showFollowing !== false || signedIn && social.canFollow;

  return <MemberShell signedIn={signedIn}>
    <div className="grid min-w-0 max-w-6xl gap-5">
      <section aria-labelledby="member-name" className="overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-sm">
        <div aria-hidden="true" className="relative h-24 overflow-hidden border-b border-[var(--theme-border)] bg-gradient-to-br from-[var(--theme-hero)] to-[var(--theme-selected)] sm:h-32">
          <div className="absolute -end-8 -top-32 size-80 rounded-full border-[28px] border-[var(--theme-link)] opacity-[0.08]" />
          <div className="absolute end-14 -top-28 size-72 rounded-full border border-[var(--theme-link)] opacity-20" />
        </div>
        <div className="relative px-5 pb-5 sm:px-7 sm:pb-6">
          <div className="-mt-12 flex flex-wrap items-start justify-between gap-4">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-[var(--theme-surface)] bg-[var(--theme-selected)] text-3xl font-semibold text-[var(--theme-link)] shadow-sm sm:size-28">
              {profile.avatarUrl ? <Image src={profile.avatarUrl} width={112} height={112} alt=""
                unoptimized className="size-full object-cover" /> : <span aria-hidden="true">{initials}</span>}
            </div>
            {signedIn && social.self && <Link href="/profile" className={`${institutionAction} mt-14`}>{t.editMemberProfile}</Link>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 id="member-name" dir="auto" className="min-w-0 break-words text-3xl font-bold tracking-tight sm:text-4xl">{displayName}</h1>
            {profile.platformLeadership === "founder" && <FounderMark />}
            {profile.platformLeadership === "administrator" && <AdministratorMark />}
            {showClaims && <PersonalClaimChecks claims={social.personalClaims ?? []} compact={false} />}
            {founderVerified && <FounderVerifiedMark />}
          </div>
          <p className="mt-1 break-all text-sm text-[var(--theme-body)]">@{username}</p>
          {(showClaims || founderVerified) && <details className="mt-3 max-w-prose text-sm text-[var(--theme-body)]">
            <summary className="w-fit cursor-pointer rounded-sm font-semibold text-[var(--theme-link)]">
              {founderMessages[locale].verificationDetails}
            </summary>
            <div className="mt-2 space-y-2">
              {founderVerified && <p>{founderMessages[locale].badgeMeaning}</p>}
              {showClaims && <p>{trustMessages[locale].noEndorsement}</p>}
            </div>
          </details>}
        </div>
        {showFollowPanel && <div className="border-t border-[var(--theme-border)] bg-[var(--theme-control)] px-5 py-4 sm:px-7">
          <ProfileFollowPanel target={{ kind: "member", key: username }} initial={social} signedIn={signedIn} inline featured />
        </div>}
      </section>

      <div className={`grid min-w-0 items-start gap-5 ${hasAbout || hasRecognition || memberTools ? "lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]" : ""}`}>
        <section aria-labelledby="member-activity" className="grid min-w-0 gap-3">
          <h2 id="member-activity" className="text-xl font-semibold">{t.memberActivity}</h2>
          {showDetails && profile.activityVisible
            ? <MemberActivity username={username} signedIn={signedIn} />
            : <p className={`${institutionCard} text-sm text-[var(--theme-body)]`}>{showDetails ? t.memberActivityHidden : t.privateProfile}</p>}
        </section>

        {(hasAbout || hasRecognition || memberTools) && <div className="grid min-w-0 gap-4">
          {hasAbout && <section className={institutionCard}>
            <h2 className="text-lg font-semibold">{t.aboutMember}</h2>
            {profile.biography && <p dir="auto" className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed">{profile.biography}</p>}
            <dl className="mt-3 grid gap-3 text-sm">
              {category && <div><dt className="font-semibold">{membership.membership}</dt><dd className="mt-1">{category}</dd></div>}
              {(country || profile.departmentName) && <div><dt className="font-semibold">{membership.location}</dt>
                <dd className="mt-1">{[profile.departmentName, country].filter(Boolean).join(" · ")}</dd>
              </div>}
              {!!interests.length && <div><dt className="font-semibold">{membership.interests}</dt><dd>
                <ul className="mt-2 flex flex-wrap gap-2">{interests.map((code) => <li key={code}
                  className="rounded-full bg-[var(--theme-control)] px-3 py-1 text-xs">{membership[code]}</li>)}</ul>
              </dd></div>}
            </dl>
          </section>}
          {hasRecognition && <div className={institutionCard}>
            {!!recognition.length && <section className="grid gap-3">
              <h2 className="text-lg font-semibold">{verificationCopy[locale].copy.decorative}</h2>
              <ul className="flex flex-wrap gap-2">{recognition.map((badge) => <li key={badge.id}><RecognitionMark badge={badge} /></li>)}</ul>
            </section>}
            {ambassador && <AmbassadorRecognition ambassador={ambassador} />}
          </div>}
          {memberTools && <>
            <MemberSafetyControls username={username} collapsible />
            <ImpersonationReportForm username={username} />
          </>}
        </div>}
      </div>
    </div>
  </MemberShell>;
}
