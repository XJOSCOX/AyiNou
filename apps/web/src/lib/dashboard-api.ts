import type { CommunityEvent, ImpactResponse, OpportunityDiscoveryPage, ProjectCard } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";
import { loadEvents } from "./events-api";
import { loadImpact } from "./impact-api";
import { loadProjects } from "./project-api";

export const dashboardSections = ["events", "projects", "communities", "opportunities", "impact", "statistics"] as const;
export type DashboardSection = typeof dashboardSections[number];
export type DashboardSummary = {
  settings: { revision: number; available: DashboardSection[]; defaultOrder: DashboardSection[];
    defaultHidden: DashboardSection[]; itemLimit: number; announcementsEnabled: boolean; statisticsEnabled: boolean };
  preferences: { version: number; order: DashboardSection[]; hidden: DashboardSection[] } | null;
  counts: { followers: number; following: number; communities: number; groups: number; savedPosts: number };
  joined: { slug: string; name: string; kind: string }[];
  announcements: { id: string; category: string; title: Record<string, string>; body: Record<string, string>;
    publishedAt: string; expiresAt: string }[];
};

export const loadDashboardSummary = (signal: AbortSignal): Promise<DashboardSummary> =>
  authorizedSocialRequest("/api/v1/me/dashboard", { signal, cache: "no-store" });
export const saveDashboardPreferences = (version: number, order: DashboardSection[], hidden: DashboardSection[], requestId: string): Promise<DashboardSummary["preferences"]> =>
  authorizedSocialRequest("/api/v1/me/dashboard/preferences", { method: "PATCH", cache: "no-store",
    body: JSON.stringify({ expectedVersion: version, requestId, order, hidden }) });
export const loadDashboardEvents = (signal: AbortSignal): Promise<CommunityEvent[]> =>
  loadEvents("scope=upcoming", null, signal).then((result) => result.rows.filter((event) => event.status === "published"));
export const loadDashboardProjects = (signal: AbortSignal): Promise<ProjectCard[]> =>
  loadProjects(true, {}, null, signal).then((result) => result.projects.filter((project) => project.publishedAt));
export const loadDashboardOpportunities = (signal: AbortSignal): Promise<OpportunityDiscoveryPage> =>
  authorizedSocialRequest("/api/v1/me/opportunity-discovery?view=latest&sort=latest", { signal, cache: "no-store" });
export const loadDashboardImpact = (signal: AbortSignal): Promise<ImpactResponse> => loadImpact({}, signal);
