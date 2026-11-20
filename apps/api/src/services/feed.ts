import { createClient } from "@supabase/supabase-js";
import type { FeedAuthor, FeedPost } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";
import { ApiError } from "./api-error.js";

type PostRow = Omit<FeedPost, "author"> & {
  author: (Omit<FeedAuthor, "avatarUrl"> & { avatarPath: string | null }) | null;
};

export interface FeedRepository {
  rpc<T>(token: string | null, name: string, params?: Record<string, unknown>): Promise<T>;
  read(token: string | null, params: Record<string, unknown>): Promise<FeedPost[]>;
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
    switch (error?.code) {
      case undefined: return data as T;
      case "42501": throw new ApiError(403, "FORBIDDEN", "This action is not permitted");
      case "PFR04": throw new ApiError(404, "NOT_FOUND", "Post unavailable");
      case "PFR09": throw new ApiError(409, "CONFLICT", "The post or request has changed");
      case "23505": throw new ApiError(409, "DUPLICATE_REPORT", "A report already exists");
      case "PFR29": throw new ApiError(429, "RATE_LIMITED", "Wait before trying again");
      case "22023": throw new ApiError(400, "INVALID_INPUT", "Check the submitted fields");
      case "23514": throw new ApiError(422, "INVALID_CONTENT", "Content does not meet posting requirements");
      case "PGRST301": case "PGRST303": throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
      default: throw new ApiError(503, "SERVICE_UNAVAILABLE", "The feed service is unavailable");
    }
  }

  return {
    rpc,
    async read(token, params) {
      const posts = await rpc<PostRow[]>(token, "read_feed_for_client", params);
      const paths = [...new Set(posts.flatMap(({ author }) => author?.avatarPath ? [author.avatarPath] : []))];
      const signed = new Map<string, string>();
      if (avatars && paths.length) {
        try {
          const { data } = await avatars.createSignedUrls(paths, 120);
          for (const row of data ?? []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
        } catch { /* A storage outage can omit avatars without affecting posts. */ }
      }
      return posts.map(({ author, ...post }) => {
        if (!author) return { ...post, author: null };
        const { avatarPath, ...publicAuthor } = author;
        return { ...post, author: { ...publicAuthor, avatarUrl: avatarPath ? signed.get(avatarPath) ?? null : null } };
      });
    },
  };
}
