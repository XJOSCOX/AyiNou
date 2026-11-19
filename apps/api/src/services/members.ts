import { Pool, type PoolClient } from "pg";
import type { Department, MemberProfile, UpdateMemberProfile } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";

export interface MemberRepository {
  get(userId: string): Promise<MemberProfile>;
  update(userId: string, input: UpdateMemberProfile): Promise<MemberProfile>;
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

const profileQuery = `
  select p.user_id, p.display_name, p.preferred_locale, p.is_visible,
    m.residence_country_code, m.residence_department_code, m.diaspora_department_code
  from public.profiles p
  join public.member_private m on m.user_id = p.user_id
  where p.user_id = $1::uuid
`;

export function createMemberRepository(config: ApiConfig): MemberRepository | null {
  if (!config.DATABASE_URL) return null;
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 5 });

  async function withMember<T>(userId: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select private.initialize_member($1::uuid)", [userId]);
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      const result = await action(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async get(userId) {
      return withMember(userId, async (client) => {
        const result = await client.query<ProfileRow>(profileQuery, [userId]);
        if (!result.rows[0]) throw new Error("Profile unavailable");
        return toProfile(result.rows[0]);
      });
    },
    async update(userId, input) {
      return withMember(userId, async (client) => {
        await client.query(
          "update public.profiles set display_name = $2, preferred_locale = $3 where user_id = $1::uuid",
          [userId, input.displayName, input.preferredLocale],
        );
        await client.query(
          `update public.member_private set residence_country_code = $2,
           residence_department_code = $3, diaspora_department_code = $4
           where user_id = $1::uuid`,
          [userId, input.residenceCountryCode, input.residenceDepartmentCode, input.diasporaDepartmentCode],
        );
        const result = await client.query<ProfileRow>(profileQuery, [userId]);
        if (!result.rows[0]) throw new Error("Profile unavailable");
        return toProfile(result.rows[0]);
      });
    },
    async departments() {
      const result = await pool.query<Department>("select code, name from public.departments order by name");
      return result.rows;
    },
    async close() { await pool.end(); },
  };
}
