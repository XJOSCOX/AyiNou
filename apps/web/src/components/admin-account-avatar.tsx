"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { AdminAccount, FollowStatus, PersonalClaim, ProfilePreview } from "@ayinou/shared";
import { authorizedRequest } from "@/lib/api";
import { FeedAvatar } from "./feed-avatar";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { AdministratorMark, FounderMark, PersonalClaimChecks } from "./institution-ui";
import { useVerificationPresentation } from "./verification-presentation";

type Identity = { username: string; profile: ProfilePreview | null; claims: readonly PersonalClaim[] };

function useAdminIdentity(element: RefObject<HTMLSpanElement | null>, username: string | null, withAvatar: boolean, knownClaims?: readonly PersonalClaim[]) {
  const [identity, setIdentity] = useState<Identity>();
  const { showBlue, showGold } = useVerificationPresentation();
  const fetchProfile = withAvatar || showGold;
  const fetchClaims = showBlue && knownClaims === undefined;

  useEffect(() => {
    if (!username || !element.current || (!fetchProfile && !fetchClaims)) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
      const handle = encodeURIComponent(username.toLowerCase());
      const profile: Promise<ProfilePreview | null> = fetchProfile
        ? authorizedRequest("/api/v1/profiles/" + handle, { signal }).then(({ profile }) => profile).catch(() => null)
        : Promise.resolve(null);
      const claims: Promise<readonly PersonalClaim[]> = fetchClaims
        ? authorizedRequest("/api/v1/members/" + handle + "/follow", { signal }).then((status: FollowStatus) => status.personalClaims ?? []).catch(() => [])
        : Promise.resolve([]);
      void Promise.all([profile, claims]).then(([profile, claims]) => {
        if (!controller.signal.aborted) setIdentity({ username, profile, claims });
      });
    }, { rootMargin: "120px" });
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [element, username, fetchProfile, fetchClaims]);

  const current = identity?.username === username ? identity : undefined;
  return {
    avatar: current?.profile?.avatarUrl,
    marks: <>
      <PersonalClaimChecks claims={knownClaims ?? current?.claims ?? []} />
      {current?.profile?.founderVerified && <FounderVerifiedMark compact />}
    </>,
  };
}

export function AdminMemberBadges({ username, claims }: { username: string | null; claims?: readonly PersonalClaim[] }) {
  const element = useRef<HTMLSpanElement>(null);
  const identity = useAdminIdentity(element, username, false, claims);
  return <span ref={element} className="inline-flex min-h-px min-w-px flex-wrap items-center gap-1 align-middle">{identity.marks}</span>;
}

export function AdminAccountIdentity({ account, fallback }: { account: AdminAccount; fallback: string }) {
  const element = useRef<HTMLSpanElement>(null);
  const identity = useAdminIdentity(element, account.username, true, account.personalClaims);
  return <>
    <span ref={element} className="shrink-0">
      <FeedAvatar name={account.displayName || account.username || fallback} url={identity.avatar} />
    </span>
    <div className="min-w-0">
      <h2 className="flex flex-wrap items-center gap-1 break-words text-sm font-semibold">
        <span className="min-w-0">{account.displayName ?? fallback}</span>
        {identity.marks}
        {account.founder ? <FounderMark compact /> : account.roles.includes("administrator") && <AdministratorMark compact />}
      </h2>
      {account.username && <p className="break-all text-xs text-[var(--theme-body)]">@{account.username}</p>}
    </div>
  </>;
}
