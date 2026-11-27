import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { ApiConfig } from "../config.js";
import { ApiError } from "./api-error.js";
import { supabaseDatabaseOptions, supabaseFetch } from "./supabase-transport.js";

const thresholds = {
  feed: [90, 120], media: [120, 240], discovery: [30, 60], profile: [60, 120], notifications: [90, 90], username: [30, 30], audit: [15, 30], registration: [90, 90],
} as const;

export type ReadCategory = keyof typeof thresholds;
export type ReadBudget = (category: ReadCategory, actor: string | null, ip: string) => Promise<void>;

export function createReadBudget(config: ApiConfig): ReadBudget {
  const secret = config.SUPABASE_SECRET_KEY;
  const client = config.SUPABASE_URL && secret ? createClient(config.SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: supabaseDatabaseOptions,
    global: { fetch: supabaseFetch(5_000) },
  }) : null;
  const counts = new Map<string, number>();
  let windowEnds = 0;
  const limited = () => new ApiError(429, "RATE_LIMITED", "Wait before trying again");

  return async (category, actor, ip) => {
    const now = Date.now();
    if (now >= windowEnds) { counts.clear(); windowEnds = now + 60_000; }
    // Match the shared pre-authentication quota when Render client IP is unverified.
    const address = config.renderDevelopment ? "render-unverified-client" : ip;
    const key = `${category}:${actor ? `member:${actor}` : `guest:${address}`}`;
    const count = counts.get(key) ?? 0;
    if (count >= thresholds[category][actor ? 1 : 0] || (!counts.has(key) && counts.size >= 10_000)) throw limited();
    counts.set(key, count + 1);
    if (!config.SUPABASE_URL) return;
    if (!client || !secret) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Read service unavailable");

    const bucket = actor ? null : createHmac("sha256", secret).update(`read-budget:${address}`).digest().readUInt16BE(0) % 4096;
    const { data, error } = await client.rpc("consume_safety_read_for_api", { p_actor: actor, p_bucket: bucket, p_category: category });
    if (error) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Read service unavailable");
    if (data !== true) throw limited();
  };
}
