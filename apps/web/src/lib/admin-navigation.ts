export const adminSections = [
  { label: "navigationPlatform", pages: ["overview", "governance", "legal", "audit"] },
  { label: "navigationSettings", pages: ["homepage", "eventFeedSettings", "registration", "memberExperience", "verificationSettings", "rolesAssignments", "officialBadges", "recognitionBadges", "recognitionHistory", "moderationPolicies", "communityNeedsPilot", "impactSettings", "volunteerSettings", "opportunitySettings"] },
  { label: "navigationModeration", pages: ["moderationOverview", "communityNeeds", "moderationReports", "moderationContent", "accounts", "featureRestrictions", "moderatorDelegation", "moderationRestrictions", "moderationAppeals", "moderationHistory"] },
  { label: "navigationMembers", pages: ["trust", "founder", "corrections"] },
  { label: "navigationPrograms", pages: ["ambassadors", "partners"] },
] as const;

export type AdminTab = (typeof adminSections)[number]["pages"][number];
const tabs: readonly AdminTab[] = adminSections.flatMap(({ pages }) => [...pages]);

export function adminTab(value: unknown): AdminTab {
  return tabs.find((tab) => tab === value) ?? "overview";
}

const impactReviewAnchors = ["#staffing", "#evidence", "#publication", "#governance"] as const;
export const impactSettingsSections = ["reporting", "measurements", "reviewers", "history"] as const;

export function carryImpactSettingsPath(destination: string, section: AdminTab, current: URL) {
  if (section !== "impactSettings") return destination;

  const next = new URL(destination, current.origin);
  const reviewAnchor = impactReviewAnchors.find((anchor) => anchor === current.hash);
  const selected = impactSettingsSections.find((item) => item === current.searchParams.get("impactSection"));
  if (reviewAnchor) {
    next.searchParams.set("impactSection", "reviewers");
    next.hash = reviewAnchor;
  } else if (selected) {
    next.searchParams.set("impactSection", selected);
  }
  return next.pathname + next.search + next.hash;
}

export function adminEntryPath(tab: AdminTab, verify = false) {
  const search = new URLSearchParams();
  if (verify) search.set("verify", "1");
  if (tab !== "overview") search.set("section", tab);
  return search.size ? "/admin?" + search.toString() : "/admin";
}
