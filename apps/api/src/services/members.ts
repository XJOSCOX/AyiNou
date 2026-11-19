import { createClient } from "@supabase/supabase-js";
import type { Department, MemberProfile, UpdateMemberProfile } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";

export interface MemberRepository {
  get(userId: string, token: string): Promise<MemberProfile>;
  update(userId: string, token: string, input: UpdateMemberProfile): Promise<MemberProfile>;
  departments(): Promise<Department[]>;
  close(): Promise<void>;
}

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  preferred_locale: MemberProfile["preferredLocale"];
  is_visible: boolean;
  residence_country_code: string | null;
  residence_department_code: string | null;
  diaspora_department_code: string | null;
};

function toProfile(row: ProfileRow): MemberProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    preferredLocale: row.preferred_locale,
    isVisible: row.is_visible,
    residenceCountryCode: row.residence_country_code,
    residenceDepartmentCode: row.residence_department_code,
    diasporaDepartmentCode: row.diaspora_department_code,
  };
}

function unavailable() { return new Error("Profile unavailable"); }

export function createMemberRepository(config: ApiConfig): MemberRepository | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY || !config.SUPABASE_SECRET_KEY) return null;
  const url = config.SUPABASE_URL;
  const publicKey = config.SUPABASE_PUBLISHABLE_KEY;
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  // This client never accepts a member session; only the initializer uses it.
  const admin = createClient(url, config.SUPABASE_SECRET_KEY, options);
  const publicClient = createClient(url, publicKey, options);

  function asMember(token: string) {
    return createClient(url, publicKey, {
      ...options,
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  async function initialize(userId: string) {
    const { error } = await admin.rpc("initialize_member_for_api", { p_user_id: userId });
    if (error) throw unavailable();
  }

  async function recordActivity(userId: string) {
    // A successful authenticated profile request counts once per UTC day.
    // Metrics must never make the profile endpoint unavailable.
    try {
      await admin.from("user_activity_daily").upsert(
        { user_id: userId, activity_day: new Date().toISOString().slice(0, 10) },
        { onConflict: "user_id,activity_day", ignoreDuplicates: true },
      );
    } catch { /* Metrics must not block profile use. */ }
  }

  return {
    async get(userId, token) {
      await initialize(userId);
      const member = asMember(token);
      const [publicResult, privateResult] = await Promise.all([
        member.from("profiles").select("user_id,display_name,preferred_locale,is_visible").eq("user_id", userId).single(),
        member.from("member_private").select("residence_country_code,residence_department_code,diaspora_department_code").eq("user_id", userId).single(),
      ]);
      if (publicResult.error || privateResult.error || !publicResult.data || !privateResult.data) throw unavailable();
      const profile = toProfile({ ...publicResult.data, ...privateResult.data } as ProfileRow);
      await recordActivity(userId);
      return profile;
    },
    async update(userId, token, input) {
      await initialize(userId);
      const member = asMember(token);
      const { data, error } = await member.rpc("update_my_profile", {
        p_display_name: input.displayName,
        p_preferred_locale: input.preferredLocale,
        p_residence_country_code: input.residenceCountryCode,
        p_residence_department_code: input.residenceDepartmentCode,
        p_diaspora_department_code: input.diasporaDepartmentCode,
      }).single();
      const row = data as ProfileRow | null;
      if (error || !row || row.user_id !== userId) throw unavailable();
      await recordActivity(userId);
      return toProfile(row);
    },
    async departments() {
      const { data, error } = await publicClient.from("departments").select("code,name").order("name");
      if (error || !data) throw new Error("Departments unavailable");
      return data as Department[];
    },
    async close() {},
  };
}
