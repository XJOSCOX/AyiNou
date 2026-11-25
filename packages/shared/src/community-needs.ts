export const communityNeedCategories = ["education", "healthcare", "infrastructure", "sanitation", "environment", "other"] as const;
export const communityNeedStatuses = ["draft", "submitted", "withdrawn"] as const;

export type CommunityNeedCategory = (typeof communityNeedCategories)[number];
export type CommunityNeedStatus = (typeof communityNeedStatuses)[number];

export interface CommunityNeedContent {
  title: string;
  description: string;
  category: CommunityNeedCategory;
  area: string | null;
  beneficiaries: string;
  references: { url: string; description: string }[];
}

export interface CommunityNeedSummary {
  id: string;
  communityId: string;
  communitySlug: string;
  title: string;
  category: CommunityNeedCategory;
  status: CommunityNeedStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityNeed extends CommunityNeedSummary {
  content: CommunityNeedContent;
  history: { revision: number; status: CommunityNeedStatus; occurredAt: string }[];
}

export interface CommunityNeedList {
  needs: CommunityNeedSummary[];
  communities: { id: string; slug: string; name: string }[];
  nextCursor: string | null;
}
