import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Department, MemberProfile, ProfileChanges, ProfilePreview, UpdateMemberProfile } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";

export interface MemberRepository {
  get(userId: string, token: string): Promise<MemberProfile>;
  update(userId: string, token: string, input: UpdateMemberProfile): Promise<MemberProfile>;
  saveDetails?(userId: string, token: string, input: ProfileChanges): Promise<MemberProfile>;
  saveAvatar?(userId: string, bytes: Buffer): Promise<string>;
  publicProfile?(username: string): Promise<ProfilePreview | null>;
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

export class MemberError extends Error {
  constructor(readonly code: string, readonly statusCode: number) {
    super(code);
  }
}

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

  const avatars = admin.storage.from("member-avatars");

  async function avatarUrl(userId: string, asset: string | null) {
    if (!asset) return null;
    const { data, error } = await avatars.createSignedUrl(`${userId}/${asset}.webp`, 300);
    if (error) return null;
    return data.signedUrl;
  }

  async function readProfile(userId: string, token: string): Promise<MemberProfile> {
      const member = asMember(token);
      const [publicResult, privateResult, settings, interests] = await Promise.all([
        member.from("profiles").select("user_id,display_name,preferred_locale,is_visible,username,biography,avatar_asset").eq("user_id", userId).single(),
        member.from("member_private").select("residence_country_code,residence_department_code,diaspora_department_code,first_name,last_name,membership_category,onboarding_step").eq("user_id", userId).single(),
        member.from("user_settings").select("discoverable,show_membership_category").eq("user_id", userId).maybeSingle(),
        member.from("member_interests").select("interest_code").eq("user_id", userId).order("interest_code"),
      ]);
      if (publicResult.error || privateResult.error || settings.error || interests.error) throw unavailable();
      return {
        ...toProfile({ ...publicResult.data, ...privateResult.data } as ProfileRow),
        firstName: privateResult.data.first_name,
        lastName: privateResult.data.last_name,
        membershipCategory: privateResult.data.membership_category,
        onboardingStep: privateResult.data.onboarding_step,
        username: publicResult.data.username,
        biography: publicResult.data.biography,
        avatarUrl: await avatarUrl(userId, publicResult.data.avatar_asset),
        discoverable: settings.data?.discoverable ?? false,
        showMembershipCategory: settings.data?.show_membership_category ?? false,
        interests: interests.data.map((item) => item.interest_code),
      };
  }

  return {
    async get(userId, token) {
      await initialize(userId);
      const profile = await readProfile(userId, token);
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
    async saveDetails(userId, token, input) {
      await initialize(userId);
      const { error } = await asMember(token).rpc("save_member_profile_v2", { p_changes: input });
      if (error?.code === "23505") throw new MemberError("USERNAME_TAKEN", 409);
      if (error && ["23514", "23503"].includes(error.code)) throw new MemberError("INVALID_PROFILE", 400);
      if (error) throw unavailable();
      await recordActivity(userId);
      return readProfile(userId, token);
    },
    async saveAvatar(userId, bytes) {
      let image: Buffer;
      try {
        const source = sharp(bytes, { limitInputPixels: 16_000_000 });
        const { format, pages } = await source.metadata();
        if (!format || !["jpeg", "png", "webp"].includes(format) || (pages ?? 1) > 1) throw new Error();
        image = await source.autoOrient().resize(384, 384, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
      } catch {
        throw new MemberError("INVALID_AVATAR", 400);
      }
      await initialize(userId);
      const previous = await admin.from("profiles").select("avatar_asset").eq("user_id", userId).single();
      if (previous.error) throw unavailable();
      const asset = randomUUID();
      const path = `${userId}/${asset}.webp`;
      const { error } = await avatars.upload(path, image, { contentType: "image/webp" });
      if (error) throw unavailable();
      const update = admin.from("profiles").update({ avatar_asset: asset }).eq("user_id", userId);
      const saved = await (previous.data.avatar_asset
        ? update.eq("avatar_asset", previous.data.avatar_asset)
        : update.is("avatar_asset", null)).select("user_id").maybeSingle();
      if (saved.error) throw unavailable();
      if (!saved.data) {
        await avatars.remove([path]);
        throw new MemberError("AVATAR_CONFLICT", 409);
      }
      if (previous.data.avatar_asset) await avatars.remove([`${userId}/${previous.data.avatar_asset}.webp`]);
      const signed = await avatarUrl(userId, asset);
      if (!signed) throw unavailable();
      return signed;
    },
    async publicProfile(username) {
      const profile = await admin.rpc("find_public_profile_for_api", { p_username: username }).maybeSingle();
      if (profile.error) throw unavailable();
      if (!profile.data) return null;
      const row = profile.data as { user_id: string; display_name: string; username: string; biography: string | null; avatar_asset: string | null; membership_category: ProfilePreview["membershipCategory"] };
      return { displayName: row.display_name, username: row.username, biography: row.biography, avatarUrl: await avatarUrl(row.user_id, row.avatar_asset), membershipCategory: row.membership_category };
    },
    async departments() {
      const { data, error } = await publicClient.from("departments").select("code,name").order("name");
      if (error || !data) throw new Error("Departments unavailable");
      return data as Department[];
    },
    async close() {},
  };
}
