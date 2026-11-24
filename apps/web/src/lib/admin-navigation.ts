export const adminSections = [
  { label: "navigationPlatform", pages: ["overview", "governance", "legal", "audit"] },
  { label: "navigationSettings", pages: ["homepage", "eventFeedSettings", "registration", "memberExperience", "verificationSettings", "rolesAssignments", "officialBadges", "recognitionBadges", "recognitionHistory"] },
  { label: "navigationMembers", pages: ["accounts", "trust", "founder", "corrections"] },
  { label: "navigationPrograms", pages: ["ambassadors", "partners"] },
] as const;

export type AdminTab = (typeof adminSections)[number]["pages"][number];
const tabs: readonly AdminTab[] = adminSections.flatMap(({ pages }) => [...pages]);

export function adminTab(value: unknown): AdminTab {
  return tabs.find((tab) => tab === value) ?? "overview";
}

export function adminEntryPath(tab: AdminTab, verify = false) {
  const search = new URLSearchParams();
  if (verify) search.set("verify", "1");
  if (tab !== "overview") search.set("section", tab);
  return search.size ? "/admin?" + search.toString() : "/admin";
}
