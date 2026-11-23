import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseDatabaseOptions, supabaseFetch } from "./supabase-transport.js";
import type { Department, MemberExperience, MemberProfile, PersonalClaim, ProfileChanges, ProfilePreview, UpdateMemberProfile, UsernameAvailability } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";
import { accountRepository, type AccountRepository } from "./accounts.js";
import { safeProfileImage } from "./profile-image.js";

export interface MemberRepository {
  accounts?: AccountRepository;
  usernameAvailability?(username: string): Promise<UsernameAvailability>;
  reviewUsername?(input: {
    actor: string; session: string; totpAt: number; requestId: string; action: string;
    username: string; replacement?: string; reason: string;
  }): Promise<{ receiptId: string; event: string }>;
  hasPersonalVerification?(userId: string): Promise<boolean>;
  personalVerification?(userId: string): Promise<PersonalClaim[]>;
  get(userId: string, token: string): Promise<MemberProfile>;
  update(userId: string, token: string, input: UpdateMemberProfile): Promise<MemberProfile>;
  saveDetails?(userId: string, token: string, input: ProfileChanges): Promise<MemberProfile>;
  saveAvatar?(userId: string, bytes: Buffer): Promise<string>;
  publicProfile?(username: string, token?: string): Promise<ProfilePreview | null>;
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
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: supabaseDatabaseOptions,
    global: { fetch: supabaseFetch() },
  };
  // This client never accepts a member session.
  const admin = createClient(url, config.SUPABASE_SECRET_KEY, options);
  const publicClient = createClient(url, publicKey, options);

  function asMember(token: string) {
    return createClient(url, publicKey, {
      ...options,
      global: { ...options.global, headers: { Authorization: `Bearer ${token}` } },
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
      const [publicResult, privateResult, settings, interests, experience] = await Promise.all([
        member.from("profiles").select("user_id,display_name,preferred_locale,is_visible,username,biography,avatar_asset").eq("user_id", userId).single(),
        member.from("member_private").select("residence_country_code,residence_department_code,diaspora_department_code,first_name,last_name,membership_category,onboarding_step").eq("user_id", userId).single(),
        member.from("user_settings").select("discoverable,show_membership_category,show_country,show_department,show_interests").eq("user_id", userId).maybeSingle(),
        member.from("member_interests").select("interest_code").eq("user_id", userId).order("interest_code"),
        member.rpc("member_experience_for_member"),
      ]);
      if (publicResult.error || privateResult.error || settings.error || interests.error || experience.error || !experience.data) throw unavailable();
      const membershipExperience = experience.data as MemberExperience;
      return {
        ...toProfile({ ...publicResult.data, ...privateResult.data } as ProfileRow),
        firstName: privateResult.data.first_name,
        lastName: privateResult.data.last_name,
        membershipCategory: privateResult.data.membership_category,
        onboardingStep: privateResult.data.onboarding_step,
        username: publicResult.data.username,
        biography: publicResult.data.biography,
        avatarUrl: membershipExperience.policy.profilePictures && membershipExperience.policy.profilesEnabled &&
          (membershipExperience.policy.privateProfiles || (membershipExperience.policy.publicProfiles && settings.data?.discoverable))
          ? await avatarUrl(userId, publicResult.data.avatar_asset) : null,
        discoverable: settings.data?.discoverable ?? false,
        showMembershipCategory: settings.data?.show_membership_category ?? false,
        showCountry: settings.data?.show_country ?? false,
        showDepartment: settings.data?.show_department ?? false,
        showInterests: settings.data?.show_interests ?? false,
        experience: membershipExperience,
        interests: interests.data.map((item) => item.interest_code),
      };
  }

  return {
    accounts: accountRepository(admin),
    async personalVerification(userId) {
      const { data, error } = await admin.rpc("personal_verification_for_api", { p_user: userId });
      if (error) throw new Error("Verification status unavailable");
      return data as PersonalClaim[];
    },
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
      if (error?.code === "R2302") throw new MemberError("PROFILE_POLICY_DISABLED", 403);
      if (error || !row || row.user_id !== userId) throw unavailable();
      await recordActivity(userId);
      return toProfile(row);
    },
    async saveDetails(userId, token, input) {
      await initialize(userId);
      const { error } = await asMember(token).rpc("save_member_profile_v2", { p_changes: input });
      if (error?.code === "23505") throw new MemberError("USERNAME_TAKEN", 409);
      if (error?.code === "U1001") throw new MemberError("USERNAME_NOT_PERMITTED", 400);
      if (error?.code === "U1002") throw new MemberError("USERNAME_CHANGE_LIMIT", 429);
      if (error?.code === "42501") throw new MemberError("FORBIDDEN", 403);
      if (error?.code === "R2301") throw new MemberError("ONBOARDING_DETAILS_REQUIRED", 400);
      if (error?.code === "R2302") throw new MemberError("PROFILE_POLICY_DISABLED", 403);
      if (error && ["23514", "23503"].includes(error.code)) throw new MemberError("INVALID_PROFILE", 400);
      if (error) throw unavailable();
      await recordActivity(userId);
      return readProfile(userId, token);
    },
    async saveAvatar(userId, bytes) {
      let image: Buffer;
      try {
        image = await safeProfileImage(bytes);
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
      if (saved.error) {
        await avatars.remove([path]);
        if (saved.error.code === "R2302") throw new MemberError("PROFILE_POLICY_DISABLED", 403);
        throw unavailable();
      }
      if (!saved.data) {
        await avatars.remove([path]);
        throw new MemberError("AVATAR_CONFLICT", 409);
      }
      if (previous.data.avatar_asset) await avatars.remove([`${userId}/${previous.data.avatar_asset}.webp`]);
      const signed = await avatarUrl(userId, asset);
      if (!signed) throw unavailable();
      return signed;
    },
    async usernameAvailability(username) {
      const { data, error } = await admin.rpc("username_availability_for_api", { p_username: username });
      if (error || !["available", "taken", "invalid", "reserved", "blocked", "unavailable"].includes(data)) {
        throw new MemberError("SERVICE_UNAVAILABLE", 503);
      }
      return data as UsernameAvailability;
    },
    async reviewUsername(input) {
      const { data, error } = await admin.rpc("review_username_for_api", {
        p_actor: input.actor, p_session: input.session, p_totp: input.totpAt, p_request: input.requestId,
        p_action: input.action, p_username: input.username, p_new_username: input.replacement ?? null, p_reason: input.reason,
      });
      if (error?.code === "42501") throw new MemberError("FORBIDDEN", 403);
      if (error && ["U1003", "23505"].includes(error.code)) throw new MemberError("USERNAME_REVIEW_CONFLICT", 409);
      if (error && ["23514", "U1001"].includes(error.code)) throw new MemberError("USERNAME_NOT_PERMITTED", 400);
      if (error || typeof data?.receiptId !== "string" || typeof data?.event !== "string") throw unavailable();
      return data;
    },
    async publicProfile(username, token) {
      const client = token ? asMember(token) : publicClient;
      const profile = await client.rpc("social_profile_for_client", { p_username: username });
      if (profile.error) throw unavailable();
      if (!profile.data) return null;
      const { userId, avatarAsset, ...publicFields } = profile.data as Omit<ProfilePreview, "avatarUrl"> & {
        userId: string | null; avatarAsset: string | null;
      };
      if (!userId) return { ...publicFields, avatarUrl: null };
      const [avatar, designation, leadership] = await Promise.all([
        avatarUrl(userId, avatarAsset),
        admin.rpc("founder_identity_public_for_api", { p_subject: userId }),
        admin.rpc("platform_leadership_for_api", { p_subject: userId }),
      ]);
      return {
        ...publicFields, avatarUrl: avatar,
        ...(!designation.error && designation.data === true ? { founderVerified: true as const } : {}),
        ...(!leadership.error && (leadership.data === "founder" || leadership.data === "administrator")
          ? { platformLeadership: leadership.data } : {}),
      };
    },
    async departments() {
      const { data, error } = await publicClient.from("departments").select("code,name").order("name");
      if (error || !data) throw new Error("Departments unavailable");
      return data as Department[];
    },
    async close() {},
  };
}
