"use client";

import Image from "next/image";
import Link from "next/link";
import type { FollowStatus, ProfilePreview } from "@ayinou/shared";
import { discoveryMessages } from "@/lib/discovery-i18n";
import { feedMessages } from "@/lib/feed-i18n";
import { useLocale } from "@/lib/locale-store";
import { DisplayControls } from "./display-controls";
import { ProfileFollowPanel } from "./discovery-accounts";
import { VerifiedCheck, institutionCard, institutionLink } from "./institution-ui";
import { SiteBrand } from "./site-brand";
import { SiteFooter } from "./site-footer";

export function MemberPublic({ profile, username, social, signedIn }: {
  profile: ProfilePreview; username: string; social: FollowStatus; signedIn: boolean;
}) {
  const [locale] = useLocale();
  const t = discoveryMessages[locale];
  return <div id="top" className="flex min-h-dvh flex-col">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 sm:px-8">
      <SiteBrand />
      <DisplayControls />
    </header>
    <main className="grid flex-1 content-start gap-4 px-4 py-5 sm:px-8 sm:py-8">
      {signedIn && <Link className={institutionLink} href="/discover">{t.discover}</Link>}
      <section className={institutionCard}>
        <div className="flex flex-wrap items-center gap-4">
          {profile.avatarUrl && <Image src={profile.avatarUrl} width={64} height={64} alt="" unoptimized
            className="size-16 shrink-0 rounded-full object-cover" />}
          <div className="min-w-0">
            <p className="text-sm text-[var(--theme-body)]">{t.profile}</p>
            <h1 className="break-words text-3xl font-semibold">{profile.displayName}
              {social.verified && <>{" "}<VerifiedCheck label={feedMessages[locale].verified} /></>}
            </h1>
            <p className="break-all text-sm text-[var(--theme-body)]">@{username}</p>
          </div>
        </div>
        {profile.biography && <p className="mt-4 max-w-prose whitespace-pre-line break-words" dir="auto">{profile.biography}</p>}
      </section>
      <ProfileFollowPanel target={{ kind: "member", key: username }} initial={social} signedIn={signedIn} />
    </main>
    <SiteFooter />
  </div>;
}
