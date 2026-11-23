"use client";

import { createContext, useContext } from "react";
import { adminEntryPath, type AdminTab } from "@/lib/admin-navigation";

export const AdminSectionContext = createContext<AdminTab>("overview");

export function useAdminRenewalPath() {
  return adminEntryPath(useContext(AdminSectionContext), true);
}
