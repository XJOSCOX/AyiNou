import type { InterestCode } from "./accounts.js";
import type { Locale } from "./core.js";
import type { PersonalClaim } from "./trust.js";

export const postVisibilities = ["public", "members_only", "followers", "private"] as const;
export const reportCategories = ["harassment", "hate", "spam", "privacy", "other"] as const;
export const moderationActions = ["hide", "restore", "remove", "dismiss"] as const;
export const postBodyLimit = 2_000;
export const commentBodyLimit = 1_000;
export const reactionKinds = ["like", "love", "support", "celebrate"] as const;
export type ReactionKind = (typeof reactionKinds)[number];
export type ReactionSummary = { counts: Record<ReactionKind, number>; mine: ReactionKind | null };
export type PostVisibility = (typeof postVisibilities)[number];
export type ReportCategory = (typeof reportCategories)[number];
export type ModerationAction = (typeof moderationActions)[number];
export type PostStatus = "draft" | "published" | "hidden" | "removed";
export type FeedScope = "feed" | "mine" | "following" | "for_you";
export type ModerationScope = "reports" | "hidden";
export const recommendationReasons = ["topic", "follow", "language", "recent"] as const;
export type RecommendationReason = (typeof recommendationReasons)[number];
export const recommendationActions = ["not_interested", "less_author", "hide_author"] as const;
export type RecommendationAction = (typeof recommendationActions)[number];
export type RecommendationSettings = { topics: InterestCode[]; feedbackCount: number };
export type AttachmentInput = { id: string; alt?: string | null };
export type PostAttachment = { id: string; alt: string | null; width: number; height: number };
export type PostInput = {
  body: string; language: Locale; visibility: PostVisibility; topics?: InterestCode[]; attachments?: AttachmentInput[];
};
export interface FeedAuthor {
  founderVerified?: true;
  personalClaims?: PersonalClaim[];
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  verified: boolean;
}
export interface SocialPostInfo {
  shareable: boolean;
  quotable: boolean;
  bookmarked: boolean;
  reposted: boolean;
  repostCount: number;
  quote: { unavailable: true } | { id: string; body: string; language: Locale; author: Omit<FeedAuthor, "avatarUrl"> | null;
    organization: { handle: string; name: string } | null } | null;
  organization: { handle: string; name: string; verified?: boolean } | null;
  announcement?: boolean;
  pinned?: boolean;
  canPin?: boolean;
  project?: { id: string; title: string; summary: string; opportunities?: { id: string; title: string }[] } | null;
  hashtags: string[];
  mentions: Record<string, string>;
}
export interface FeedPost extends PostInput {
  social?: SocialPostInfo;
  timelineId?: string;
  timelineAt?: string;
  repostBy?: Omit<FeedAuthor, "avatarUrl"> | null;
  unavailable?: true;
  attachments?: PostAttachment[];
  community?: { id: string; slug: string } | null;
  id: string;
  status: PostStatus;
  createdAt: string;
  publishedAt: string | null;
  editedAt: string | null;
  version: number;
  own: boolean;
  author: FeedAuthor | null;
  reactions?: ReactionSummary;
  recommendationReason?: RecommendationReason;
}
export interface FeedPage {
  posts: FeedPost[];
  nextCursor: string | null;
  algorithmVersion?: string;
}
export interface FeedReport {
  attachments?: PostAttachment[];
  id: string;
  postId: string;
  commentId?: string;
  body: string;
  language: Locale;
  status: PostStatus;
  deleted: boolean;
  own: boolean;
  version: number;
  category: ReportCategory | null;
  note: string | null;
  createdAt: string;
  lastAction: { action: ModerationAction; reason: string; createdAt: string } | null;
}
export type CommentInput = Pick<PostInput, "body" | "language">;

export const appealOutcomes = ["upheld", "overturned", "closed"] as const;
export type AppealOutcome = (typeof appealOutcomes)[number];
export type AppealKind = "post" | "comment";
export type MemberSafetyEntry = { id: string; username: string | null; name: string | null; createdAt: string };
export type MemberSafetyPage = { accounts: MemberSafetyEntry[]; nextCursor: string | null };
export interface ModerationAppeal {
  id: string;
  reason: string;
  outcome: "pending" | AppealOutcome;
  explanation: string | null;
  createdAt: string;
  decidedAt: string | null;
}
export type MemberAppealDecision = {
  id: string; kind: AppealKind; createdAt: string; deadline: string; eligible: boolean; appeal: ModerationAppeal | null;
};
export type AppealReview = ModerationAppeal & {
  kind: AppealKind; postId: string; commentId: string | null; body: string; language: Locale;
  originalReason: string; originalAt: string; conflict: boolean; canRestore: boolean;
  attachments?: PostAttachment[];
};
export type AppealPage<T> = { decisions: T[]; nextCursor: string | null };
export type SafetyOverview = {
  pendingPostReports: number; pendingCommentReports: number; pendingAppeals: number;
  restrictedAccounts: number; moderationActions30Days: number; cleanupBacklog: number;
};
export type CommentTarget = { id: string; body: string; language: Locale; createdAt: string; mentions?: Record<string, string> };

type CommentPosition = { id: string; parentId: string | null; createdAt: string; hasReplies: boolean };
export type FeedComment = CommentPosition & (
  { available: true; body: string; language: Locale; editedAt: string | null; version: number;
    own: boolean; author: Omit<FeedAuthor, "avatarUrl"> | null; reactions: ReactionSummary; mentions?: Record<string, string> }
  | { available: false; body: null; language: null; editedAt: null; version: null;
    own: false; author: null; reactions: null }
);
export type ProfileReply = { id: string; postId: string; body: string; createdAt: string; language: Locale; mentions?: Record<string, string> };

export interface CommentPage {
  comments: FeedComment[];
  nextCursor: string | null;
}
export interface FeedReportPage {
  reports: FeedReport[];
  nextCursor: string | null;
}
