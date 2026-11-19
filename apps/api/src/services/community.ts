import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CommunityStats } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";

const count = z.number().int().nonnegative();
const statsSchema = z.object({
  updatedAt: z.iso.datetime({ offset: true }),
  minimumCohort: z.literal(10),
  registered: count.nullable(),
  active: count.nullable(),
  verified: count.nullable(),
  geographyAvailable: z.boolean(),
  haiti: count.nullable(),
  diaspora: count.nullable(),
  unknown: count.nullable(),
  representedDepartments: count.nullable(),
  departments: z.array(z.object({ code: z.string(), name: z.string(), members: count })).nullable(),
  diasporaCountries: z.array(z.object({ code: z.string(), members: count })).nullable(),
  membership: z.object({ haitian: count, internationalSupporter: count, unspecified: count }).nullable(),
}).strict();

export interface CommunityRepository { stats(): Promise<CommunityStats> }

export function createCommunityRepository(config: ApiConfig): CommunityRepository | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) return null;
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async stats() {
      const { data, error } = await client.rpc("community_stats_v2_for_api");
      if (error) throw new Error("Community statistics unavailable");
      return statsSchema.parse(data);
    },
  };
}
