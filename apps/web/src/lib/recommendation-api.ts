import type { InterestCode, RecommendationAction, RecommendationSettings } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

const settings = "/api/v1/recommendations/settings";

export const loadRecommendationSettings = (signal: AbortSignal): Promise<RecommendationSettings> =>
  authorizedSocialRequest(settings, { signal });

export const saveRecommendationTopics = (topics: InterestCode[]): Promise<RecommendationSettings> =>
  authorizedSocialRequest(settings, { method: "PUT", body: JSON.stringify({ topics }) });

export const submitRecommendationFeedback = (id: string, action: RecommendationAction): Promise<void> =>
  authorizedSocialRequest(`/api/v1/posts/${id}/recommendation-feedback`, { method: "POST", body: JSON.stringify({ action }) });

export const clearRecommendationFeedback = (): Promise<RecommendationSettings> =>
  authorizedSocialRequest("/api/v1/recommendations/feedback", { method: "DELETE" });
