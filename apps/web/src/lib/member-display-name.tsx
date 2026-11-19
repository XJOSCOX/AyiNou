"use client";

import { createContext, useContext, type ReactNode } from "react";

const MemberDisplayName = createContext<string | null>(null);

export function MemberDisplayNameProvider({ name, children }: { name: string | null; children: ReactNode }) {
  return <MemberDisplayName.Provider value={name}>{children}</MemberDisplayName.Provider>;
}

export function useMemberDisplayName() {
  return useContext(MemberDisplayName);
}
