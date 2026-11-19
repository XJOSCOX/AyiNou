"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authorizedRequest } from "./api";

const MemberIdentity = createContext({ displayName: null as string | null, verified: false });

export function MemberDisplayNameProvider({ name, children }: { name: string | null; children: ReactNode }) {
  const pathname = usePathname();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    authorizedRequest("/api/v1/me/verification-badge", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setVerified(result.verified === true); })
      .catch(() => { if (!controller.signal.aborted) setVerified(false); });
    return () => controller.abort();
  }, [pathname]);

  return <MemberIdentity.Provider value={{ displayName: name, verified }}>{children}</MemberIdentity.Provider>;
}

export function useMemberIdentity() {
  return useContext(MemberIdentity);
}
