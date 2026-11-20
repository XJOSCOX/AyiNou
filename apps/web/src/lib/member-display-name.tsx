"use client";

import { usePathname } from "next/navigation";
import { personalClaims, type PersonalClaim } from "@ayinou/shared";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authorizedRequest } from "./api";
import { loadPlatformAccess } from "./admin-api";

const MemberIdentity = createContext({ displayName: null as string | null, claims: [] as PersonalClaim[], administrator: false });

export function MemberDisplayNameProvider({ name, children }: { name: string | null; children: ReactNode }) {
  const pathname = usePathname();
  const [claims, setClaims] = useState<PersonalClaim[]>([]);
  const [administrator, setAdministrator] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    authorizedRequest("/api/v1/me/verification-badge", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setClaims(personalClaims.filter((claim) => result.personalClaims?.includes(claim)));
      })
      .catch(() => { if (!controller.signal.aborted) setClaims([]); });
    loadPlatformAccess(controller.signal)
      .then((access) => { if (!controller.signal.aborted) setAdministrator(access.administrator); })
      .catch(() => { if (!controller.signal.aborted) setAdministrator(false); });
    return () => controller.abort();
  }, [pathname]);

  return <MemberIdentity.Provider value={{ displayName: name, claims, administrator }}>{children}</MemberIdentity.Provider>;
}

export function useMemberIdentity() {
  return useContext(MemberIdentity);
}
