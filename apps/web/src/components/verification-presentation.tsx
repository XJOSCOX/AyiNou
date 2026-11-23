"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { VerificationPolicy } from "@ayinou/shared";

type Presentation = Pick<VerificationPolicy, "showBlue" | "showGold" | "personalIntake" | "organizationIntake" | "publicFigureIntake">;
const closed: Presentation = { showBlue: false, showGold: false, personalIntake: false, organizationIntake: false, publicFigureIntake: false };
const VerificationPresentation = createContext(closed);

export function VerificationPresentationProvider({ value, children }: { value: Presentation | null; children: ReactNode }) {
  return <VerificationPresentation.Provider value={value ?? closed}>{children}</VerificationPresentation.Provider>;
}

export function useVerificationPresentation() { return useContext(VerificationPresentation); }
