export const policyPaths = {
  terms: "/terms",
  privacy: "/privacy",
  "community-guidelines": "/community-guidelines",
  organizations: "/legal/organizations",
  "projects-and-volunteers": "/legal/projects-and-volunteers",
  voting: "/legal/voting",
  verification: "/legal/verification",
  cookies: "/legal/cookies",
  "data-rights": "/legal/data-rights",
} as const;
export type PolicyId = keyof typeof policyPaths;
export function isPolicyId(value: string): value is PolicyId { return value in policyPaths; }
