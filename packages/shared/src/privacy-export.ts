export const exportCategories = [
  "profile", "residence", "preferences", "interests", "posts", "comments", "affiliations", "privacyRequests", "pollParticipation",
] as const;
export type ExportCategory = typeof exportCategories[number];
export type ExportState = "queued" | "generating" | "available" | "failed_retryable" | "expired" | "revoked" | "cleaned";
export type ExportStatus = { state: "none"; canDownload: false } | {
  id: string;
  state: ExportState;
  expiresAt: string;
  canDownload: boolean;
  counts: Record<ExportCategory, number> | null;
};
