"use client";

import { usePathname } from "next/navigation";
import { personalClaims, type PersonalClaim } from "@ayinou/shared";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authorizedRequest, fetchMyProfile } from "./api";
import { loadPlatformAccess } from "./admin-api";
import { browserSupabase } from "./supabase/browser";

type Identity = {
  memberId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  setAvatarUrl: (url: string) => void;
  claims: PersonalClaim[];
  administrator: boolean;
  reviewer: boolean;
};
const MemberIdentity = createContext<Identity | null>(null);
const emptyAccess = { administrator: false, reviewer: false };
// The profile endpoint signs avatar URLs for five minutes. Refresh the display data before expiry.
const avatarRefreshInterval = 2 * 60 * 1000;

export function MemberDisplayNameProvider({ memberId = null, name, children }: {
  memberId?: string | null; name?: string | null; children: ReactNode;
}) {
  const pathname = usePathname();
  const [owner, setOwner] = useState(memberId);
  const currentOwner = useRef(memberId);
  const [claims, setClaims] = useState<PersonalClaim[]>([]);
  const [access, setAccess] = useState(emptyAccess);
  const [profile, setProfile] = useState<{ displayName: string | null; avatarUrl: string | null }>({
    displayName: null, avatarUrl: null,
  });
  const avatarRevision = useRef(0);
  const profileUpdatedAt = useRef(0);

  useEffect(() => {
    const { data: { subscription } } = browserSupabase().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const next = session?.user.id ?? null;
      if (currentOwner.current === next) return;
      currentOwner.current = next;
      avatarRevision.current++;
      profileUpdatedAt.current = 0;
      setProfile({ displayName: null, avatarUrl: null });
      setClaims([]);
      setAccess(emptyAccess);
      setOwner(next);
    });
    return () => subscription.unsubscribe();
  }, []);

  const member = owner && (!memberId || memberId === owner) ? owner : null;
  useEffect(() => {
    if (!member) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let pending = false;
    const valid = () => !controller.signal.aborted && currentOwner.current === member;
    const refreshProfile = () => {
      clearTimeout(timer);
      if (!valid() || pending || document.visibilityState === "hidden") return;
      const remaining = profileUpdatedAt.current + avatarRefreshInterval - Date.now();
      if (remaining > 0) {
        timer = setTimeout(refreshProfile, remaining);
        return;
      }
      pending = true;
      const revision = avatarRevision.current;
      void fetchMyProfile(controller.signal).then(({ userId, displayName, avatarUrl }) => {
        if (!valid() || userId !== member) return;
        if (revision === avatarRevision.current) {
          profileUpdatedAt.current = Date.now();
          setProfile({ displayName, avatarUrl: avatarUrl ?? null });
        }
        timer = setTimeout(refreshProfile, avatarRefreshInterval);
      }).catch(() => {
        if (valid() && revision === avatarRevision.current) setProfile((current) => ({ ...current, avatarUrl: null }));
      }).finally(() => { pending = false; });
    };
    refreshProfile();
    document.addEventListener("visibilitychange", refreshProfile);
    authorizedRequest("/api/v1/me/verification-badge", { signal: controller.signal })
      .then((result) => {
        if (valid()) setClaims(personalClaims.filter((claim) => result.personalClaims?.includes(claim)));
      })
      .catch(() => { if (valid()) setClaims([]); });
    loadPlatformAccess(controller.signal)
      .then((next) => { if (valid()) setAccess(next); })
      .catch(() => { if (valid()) setAccess(emptyAccess); });
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshProfile);
    };
  }, [pathname, member]);

  function setAvatarUrl(url: string) {
    if (!member || currentOwner.current !== member) return;
    avatarRevision.current++;
    profileUpdatedAt.current = Date.now();
    setProfile((current) => ({ ...current, avatarUrl: url }));
  }

  return <MemberIdentity.Provider value={{
    memberId: member,
    displayName: member ? name ?? profile.displayName : null, avatarUrl: member ? profile.avatarUrl : null,
    setAvatarUrl, claims: member ? claims : [], administrator: !!member && access.administrator, reviewer: !!member && access.reviewer,
  }}>{children}</MemberIdentity.Provider>;
}

export function MemberIdentityBoundary({ children }: { children: ReactNode }) {
  const identity = useContext(MemberIdentity);
  return identity ? children : <MemberDisplayNameProvider>{children}</MemberDisplayNameProvider>;
}

export function useMemberIdentity() {
  const identity = useContext(MemberIdentity);
  if (!identity) throw new Error("Member identity provider is required");
  return identity;
}
