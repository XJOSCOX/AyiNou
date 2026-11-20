import { createClient } from "@supabase/supabase-js";
import type { FeedAuthor, FeedPost, InterestCode, PostAttachment, ReactionSummary } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";
import { ApiError } from "./api-error.js";

type PostRow = Omit<FeedPost, "author"> & {
  author: (Omit<FeedAuthor, "avatarUrl"> & { avatarPath: string | null }) | null;
};

export interface FeedRepository {
  rpc<T>(token: string | null, name: string, params?: Record<string, unknown>): Promise<T>;
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

  async function hydrate<T extends PostRow>(token: string | null, posts: T[]) {
    const eligible = posts.filter(({ status }) => status === "published").map(({ id }) => id);
    const ids = posts.map(({ id }) => id);
    const paths = [...new Set(posts.flatMap(({ author }) => author?.avatarPath ? [author.avatarPath] : []))];
    const signed = new Map<string, string>();
    async function signAvatars() {
      if (!avatars || !paths.length) return;
      try {
        const { data } = await avatars.createSignedUrls(paths, 120);
        for (const row of data ?? []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
      } catch { /* A storage outage can omit avatars without affecting posts. */ }
    }
    const [summaries, tags, media] = await Promise.all([
      eligible.length ? rpc<Partial<Record<string, ReactionSummary>>>(token, "post_reactions_for_client", { p_ids: eligible }) : undefined,
      ids.length ? rpc<Partial<Record<string, InterestCode[]>>>(token, "post_topics_for_client", { p_ids: ids }) : undefined,
      ids.length ? rpc<Partial<Record<string, PostAttachment[]>>>(token, "post_attachments_for_client", { p_ids: ids }) : undefined,
      signAvatars(),
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
    async read(token, params) {
      const { p_scope, p_id, ...page } = params;
      const posts = p_scope === "following"
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
