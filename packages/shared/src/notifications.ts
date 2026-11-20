import type { FeedAuthor } from "./feed.js";
import type { ProjectOperationEvent, ProjectProgressEvent } from "./project-work.js";
import type { PollNotice } from "./voting.js";

export const notificationPreferenceKeys = ["reactions", "comments", "replies", "followers"] as const;
export type NotificationPreferences = Record<(typeof notificationPreferenceKeys)[number], boolean>;
export interface MemberNotification {
  id: string;
  createdAt: string;
  readAt: string | null;
  available: boolean;
  kind: "post_reaction" | "post_comment" | "comment_reply" | "new_follower" | "appeal_decided" |
    "verification_decided" | "verification_appeal_decided" | "representative_access_changed" |
    "ambassador_invited" | "ambassador_updated" | "organization_access_changed" |
    "project_submitted" | "project_assigned" | "project_changes" | "project_approved" | "project_rejected" | "project_operation" | "poll_event" | null;
  pollEvent?: { pollId: string; action: PollNotice } | null;
  projectOperation?: { projectId: string; action: ProjectOperationEvent | ProjectProgressEvent } | null;
  appealId?: string | null;
  postId: string | null;
  commentId: string | null;
  actor: Omit<FeedAuthor, "avatarUrl"> | null;
}
export type NotificationPage = { notifications: MemberNotification[]; nextCursor: string | null };
