import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReferralSummary } from "@ayinou/shared";

export interface AccountRepository {
  memberCode(userId: string): Promise<string>;
  referralCode(userId: string): Promise<string>;
  validateReferral(code: string): Promise<boolean>;
  recordReferral(userId: string): Promise<boolean>;
  referralSummary(userId: string): Promise<ReferralSummary>;
}

export function accountRepository(admin: SupabaseClient): AccountRepository {
  async function rpc<T>(name: string, input: Record<string, string>): Promise<T> {
    const { data, error } = await admin.rpc(name, input);
    if (error || data === null) throw new Error("Account service unavailable");
    return data as T;
  }

  return {
    memberCode: (userId) => rpc<string>("account_member_code_for_api", { p_user_id: userId }),
    referralCode: (userId) => rpc<string>("account_referral_code_for_api", { p_user_id: userId }),
    validateReferral: (code) => rpc<boolean>("validate_referral_for_api", { p_code: code }),
    recordReferral: (userId) => rpc<boolean>("record_signup_referral_for_api", { p_user_id: userId }),
    async referralSummary(userId) {
      return { confirmedCount: await rpc<number>("account_referral_summary_for_api", { p_user_id: userId }) };
    },
  };
}
