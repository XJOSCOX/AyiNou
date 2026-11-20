import { createClient } from "@supabase/supabase-js";
import type { FeedAuthor, FeedPost, InterestCode, PostAttachment, ReactionSummary } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";
import { ApiError } from "./api-error.js";

type PostRow = Omit<FeedPost, "author"> & {
  author: (Omit<FeedAuthor, "avatarUrl"> & { avatarPath: string | null }) | null;
};

export interface FeedRepository {
  rpc<T>(token: string | null, name: string, params?: Record<string, unknown>): Promise<T>;
  signAvatars?(paths: string[]): Promise<Map<string, string>>;
  read(token: string | null, params: Record<string, unknown>): Promise<FeedPost[]>;
  recommendations(token: string | null, params: Record<string, unknown>): Promise<{
    snapshotId: string; algorithmVersion: string; rows: { position: number; post: FeedPost }[];
  }>;
}

export function feedDatabaseError(code: string): ApiError {
  switch (code) {
    case "42501": return new ApiError(403, "FORBIDDEN", "This action is not permitted");
    case "PFR04": return new ApiError(404, "NOT_FOUND", "Content unavailable");
    case "PFR09": return new ApiError(409, "CONFLICT", "The content or request has changed");
    case "23505": return new ApiError(409, "DUPLICATE_REPORT", "A report already exists");
    case "PFR29": return new ApiError(429, "RATE_LIMITED", "Wait before trying again");
    case "PFD12": return new ApiError(409, "FOLLOW_CAP", "The following limit has been reached");
    case "PFD30": return new ApiError(409, "FEED_REFRESH_REQUIRED", "Refresh your recommendations");
    case "PMD04": return new ApiError(404, "ATTACHMENT_UNAVAILABLE", "Image unavailable");
    case "PMD12": return new ApiError(409, "MEDIA_CAP", "Image storage limit reached");
    case "PSF01": return new ApiError(422, "SELF_SAFETY_ACTION", "Action unavailable for your own account");
    case "PSF03": return new ApiError(403, "APPEAL_REVIEW_CONFLICT", "An independent reviewer is required");
    case "PSF04": return new ApiError(404, "APPEAL_INELIGIBLE", "Appeal unavailable");
    case "PSF09": return new ApiError(409, "APPEAL_EXISTS", "An appeal already exists");
    case "PSF12": return new ApiError(409, "SAFETY_CAP", "Member safety list limit reached");
    case "PSF14": return new ApiError(410, "APPEAL_EXPIRED", "The appeal window has ended");
    case "PCM03": return new ApiError(403, "COMMUNITY_MEMBERSHIP_REQUIRED", "Join this community to continue");
    case "PCM04": return new ApiError(404, "COMMUNITY_UNAVAILABLE", "Community unavailable");
    case "PCG01": return new ApiError(422, "GROUP_RESERVED", "This community name or slug is reserved");
    case "PCG02": return new ApiError(409, "GROUP_CREATION_LIMIT", "Community creation limit reached");
    case "PCG03": return new ApiError(409, "GROUP_NAME_IN_USE", "This community name or slug is unavailable");
    case "PCG04": return new ApiError(410, "GROUP_INVITATION_UNAVAILABLE", "Invitation unavailable");
    case "PCG05": return new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification is required");
    case "PCG06": return new ApiError(409, "GROUP_POLICY_CHANGED", "Community settings changed");
    case "PCG07": return new ApiError(409, "GROUP_OWNER_REQUIRED", "Transfer ownership before leaving");
    case "PCR12": return new ApiError(409, "COMMUNITY_FEEDBACK_LIMIT", "Community feedback limit reached");
    case "PCR30": return new ApiError(409, "COMMUNITY_RECOMMENDATIONS_EXPIRED", "Refresh community recommendations");
    case "PVT04": return new ApiError(404, "TRUST_CASE_UNAVAILABLE", "This case or review action is unavailable");
    case "PVT09": return new ApiError(409, "VERIFICATION_APPEAL_EXISTS", "An appeal already exists for this decision");
    case "PVT14": return new ApiError(410, "VERIFICATION_APPEAL_EXPIRED", "The verification appeal window has ended");
    case "PAB04": return new ApiError(404, "AMBASSADOR_UNAVAILABLE", "Program case unavailable");
    case "PAB09": return new ApiError(409, "AMBASSADOR_CASE_CHANGED", "Program case changed or action unavailable");
    case "PAB11": return new ApiError(409, "AMBASSADOR_PUBLIC_ELIGIBILITY", "Public eligibility is required");
    case "POR04": return new ApiError(404, "ORGANIZATION_ROLE_UNAVAILABLE", "Organization or role unavailable");
    case "POR09": return new ApiError(409, "ORGANIZATION_ROLE_CHANGED", "Role or assignment has changed");
    case "POR11": return new ApiError(422, "ORGANIZATION_PERMISSION_PROTECTED", "Permission cannot be assigned");
    case "POR12": return new ApiError(409, "ORGANIZATION_ROLE_NAME_CONFLICT", "Role name is already in use");
    case "POR13": return new ApiError(403, "ORGANIZATION_GRANT_DENIED", "Assignment is outside delegated authority");
    case "POR14": return new ApiError(409, "ORGANIZATION_RELATIONSHIP_UNAVAILABLE", "A current organization relationship is required");
    case "PJP03": return new ApiError(422, "PROJECT_INVALID", "Check the proposal fields");
    case "PJP04": return new ApiError(404, "PROJECT_UNAVAILABLE", "Project unavailable");
    case "PJP09": return new ApiError(409, "PROJECT_CHANGED", "The proposal or submission has changed");
    case "PJP13": return new ApiError(403, "PROJECT_OWNER_UNAVAILABLE", "Current authority for this owner is required");
    case "PJP14": return new ApiError(403, "PROJECT_REVIEW_UNAVAILABLE", "Independent project review is required");
    case "PJP20": return new ApiError(403, "PROJECT_IDENTITY_REQUIRED", "Reviewed identity verification is required");
    case "PJP21": return new ApiError(403, "PROJECT_IDENTITY_PENDING", "Identity verification is awaiting review");
    case "PJP22": return new ApiError(403, "PROJECT_IDENTITY_REVOKED", "Identity verification is unavailable");
    case "PJP23": return new ApiError(403, "PROJECT_INSTITUTION_AUTHORITY_UNAVAILABLE", "Current institutional authority is required");
    case "PJP24": return new ApiError(403, "PROJECT_COMMUNITY_AUTHORITY_UNAVAILABLE", "Current community authority is required");
    case "PJB01": return new ApiError(409, "PROJECT_WORK_INACTIVE", "Project is not active");
    case "PJB02": return new ApiError(409, "PROJECT_INVITATION_EXPIRED", "Invitation expired");
    case "PJB03": return new ApiError(404, "PROJECT_TEAM_UNAVAILABLE", "Team member or invitation unavailable");
    case "PJB04": return new ApiError(409, "PROJECT_VOLUNTEER_UNAVAILABLE", "Opportunity or application unavailable");
    case "PJB05": return new ApiError(404, "PROJECT_TASK_UNAVAILABLE", "Task unavailable");
    case "PJB06": return new ApiError(409, "PROJECT_TASK_CHANGED", "Task changed");
    case "PJB09": return new ApiError(409, "PROJECT_WORK_CONFLICT", "Project action unavailable in its current state");
    case "PJC03": return new ApiError(403, "PROJECT_PROGRESS_REVIEW_CONFLICT", "Independent project review is required");
    case "PJC04": return new ApiError(404, "PROJECT_PROGRESS_UNAVAILABLE", "Milestone or progress entry unavailable");
    case "PJC05": return new ApiError(422, "PROJECT_METRIC_INVALID", "Invalid or overlapping project measurement");
    case "PJC06": return new ApiError(404, "PROJECT_EVIDENCE_UNAVAILABLE", "Evidence unavailable");
    case "PJC08": return new ApiError(409, "PROJECT_REPORT_UNAVAILABLE", "Recorded project completion is required");
    case "PJC09": return new ApiError(409, "PROJECT_PROGRESS_CHANGED", "Project progress changed");
    case "22023": return new ApiError(400, "INVALID_INPUT", "Check the submitted fields");
    case "23514": return new ApiError(422, "INVALID_CONTENT", "Content does not meet posting requirements");
    case "PGRST301": case "PGRST303": return new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
    default: return new ApiError(503, "SERVICE_UNAVAILABLE", "The feed service is unavailable");
  }
}

export function createFeedRepository(config: ApiConfig): FeedRepository | null {
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_SECRET_KEY: secret } = config;
  if (!url || !key) return null;
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const publicClient = createClient(url, key, options);
  const avatars = secret ? createClient(url, secret, options).storage.from("member-avatars") : null;

  async function rpc<T>(token: string | null, name: string, params: Record<string, unknown> = {}) {
    const client = token ? createClient(url!, key!, {
      ...options, global: { headers: { Authorization: `Bearer ${token}` } },
    }) : publicClient;
    const { data, error } = await client.rpc(name, params);
    if (error) throw feedDatabaseError(error.code);
    return data as T;
  }

  async function signAvatars(paths: string[]) {
    const signed = new Map<string, string>();
    if (avatars && paths.length) {
      try {
        const { data } = await avatars.createSignedUrls([...new Set(paths)], 120);
        for (const row of data ?? []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
      } catch { /* A storage outage can omit avatars without affecting the response. */ }
    }
    return signed;
  }

  async function hydrate<T extends PostRow>(token: string | null, posts: T[]) {
    const eligible = posts.filter(({ status }) => status === "published").map(({ id }) => id);
    const ids = posts.map(({ id }) => id);
    const paths = posts.flatMap(({ author }) => author?.avatarPath ? [author.avatarPath] : []);
    const [summaries, tags, media, signed] = await Promise.all([
      eligible.length ? rpc<Partial<Record<string, ReactionSummary>>>(token, "post_reactions_for_client", { p_ids: eligible }) : undefined,
      ids.length ? rpc<Partial<Record<string, InterestCode[]>>>(token, "post_topics_for_client", { p_ids: ids }) : undefined,
      ids.length ? rpc<Partial<Record<string, PostAttachment[]>>>(token, "post_attachments_for_client", { p_ids: ids }) : undefined,
      signAvatars(paths),
    ]);
    return posts.map(({ author, ...post }) => {
      const reactions = summaries?.[post.id];
      const topics = tags?.[post.id];
      const attachments = media?.[post.id] ?? [];
      if (!author) return { ...post, reactions, topics, attachments, author: null };
      const { avatarPath, ...publicAuthor } = author;
      return { ...post, reactions, topics, attachments, author: { ...publicAuthor, avatarUrl: avatarPath ? signed.get(avatarPath) ?? null : null } };
    });
  }

  return {
    rpc,
    signAvatars,
    async read(token, params) {
      const { p_scope, p_id, p_community, ...page } = params;
      const posts = p_scope === "community"
        ? await rpc<PostRow[]>(token, "read_department_posts_for_client", { ...page, p_key: p_community })
        : p_scope === "following"
        ? await rpc<PostRow[]>(token, "read_following_feed_for_client", page)
        : await rpc<PostRow[]>(token, "read_feed_for_client", { ...page, p_scope, p_id });
      return hydrate(token, posts);
    },
    async recommendations(token, params) {
      const { rows, ...snapshot } = await rpc<{
        snapshotId: string; algorithmVersion: string; rows: (PostRow & { rankPosition: number })[];
      }>(token, "read_for_you_for_client", params);
      const hydrated = await hydrate(token, rows);
      return { ...snapshot, rows: hydrated.map(({ rankPosition, ...post }) => ({ position: rankPosition, post })) };
    },
  };
}
