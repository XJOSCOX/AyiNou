import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { AuditPerson, Institution, InstitutionAccounts, InstitutionManagement } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";
import { safeProfileImage } from "./profile-image.js";
import { supabaseDatabaseOptions, supabaseFetch } from "./supabase-transport.js";

export class InstitutionError extends Error {
  constructor(readonly code: string, readonly statusCode: number) { super(code); }
}

type DbInstitution = Omit<Institution, "logoUrl"> & { logoAsset: string | null };
type DbManagement = Omit<InstitutionManagement, "organization"> & { organization: DbInstitution };
type DbAccounts = Omit<InstitutionAccounts, "organizations"> & {
  organizations: (Omit<InstitutionAccounts["organizations"][number], "logoUrl"> & { logoAsset?: string | null })[];
};

export interface InstitutionRepository {
  rpc<T>(name: string, input: Record<string, unknown>): Promise<T>;
  auditPeople?(ids: readonly (string | null)[]): Promise<Map<string, AuditPerson>>;
  publicProfile(handle: string): Promise<Institution | null>;
  accounts(actor: string): Promise<InstitutionAccounts>;
  manage(actor: string, org: string): Promise<InstitutionManagement>;
  logo(actor: string, org: string, bytes: Buffer): Promise<void>;
}

export function createInstitutionRepository(config: ApiConfig): InstitutionRepository | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) return null;
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: supabaseDatabaseOptions,
    global: { fetch: supabaseFetch() },
  });
  const logos = client.storage.from("institution-logos");

  async function rpc<T>(name: string, input: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, input);
    if (error) {
      if (error.code === "PGRST202" && ["founder_identity_read_for_api", "founder_identity_workspace_for_api"].includes(name)) {
        throw new InstitutionError("FOUNDER_IDENTITY_NOT_DEPLOYED", 503);
      }
      if (["PSF04", "PSF14", "22023"].includes(error.code) && name.startsWith("m24_"))
        throw new InstitutionError(error.code === "22023" ? "INVALID_INPUT" : "APPEAL_INELIGIBLE", error.code === "22023" ? 400 : 404);
      if (error.code === "C1602") throw new InstitutionError("COMMUNITY_NEEDS_PILOT_CLOSED", 409);
      if (error.code === "C1603") throw new InstitutionError("COMMUNITY_NEEDS_PILOT_CAPACITY", 409);
      if (name === "c14_links_for_api") {
        if (["C1401", "PGRST202"].includes(error.code)) throw new InstitutionError("NEED_PROJECT_LINKS_DISABLED",404);
        if (error.code === "C1402") throw new InstitutionError("NOT_FOUND",404);
        if (error.code === "C1403") throw new InstitutionError("STALE_VERSION",409);
      }
      if (name === "c13_publication_for_api") {
        if (["C1301", "PGRST202"].includes(error.code)) throw new InstitutionError("COMMUNITY_NEED_PUBLICATION_DISABLED", 404);
        if (error.code === "C1302") throw new InstitutionError("NOT_FOUND", 404);
        if (error.code === "C1303") throw new InstitutionError("STALE_VERSION", 409);
      }
      if (name === "c12_needs_for_api" && ["C1201", "PGRST202"].includes(error.code)) {
        throw new InstitutionError("COMMUNITY_NEEDS_REVIEW_DISABLED", 404);
      }
      if (name === "c11_needs_for_api") {
        if (["C1101", "PGRST202"].includes(error.code)) throw new InstitutionError("COMMUNITY_NEEDS_DISABLED", 404);
        if (error.code === "C1102") throw new InstitutionError("COMMUNITY_MEMBERSHIP_REQUIRED", 403);
      }
      if (error.code === "O2001") throw new InstitutionError("UNAUTHORIZED", 401);
      if (error.code === "O2002") throw new InstitutionError("IDEMPOTENCY_CONFLICT", 409);
      if (error.code === "O2003") throw new InstitutionError("NOT_FOUND", 404);
      if (error.code === "O2004") throw new InstitutionError("STALE_VERSION", 409);
      if (error.code === "O2005") throw new InstitutionError("DEPENDENCY_BLOCKED", 409);
      if (error.code === "O4001") throw new InstitutionError("ORG_SETUP_REQUIRED", 409);
      if (error.code === "O4002") throw new InstitutionError("ORG_SETUP_IDENTITY_REQUIRED", 403);
      if (error.code === "O4003") throw new InstitutionError("ORG_SETUP_AUTHORITY_REQUIRED", 409);
      if (error.code === "O4004") throw new InstitutionError("ORG_SETUP_PROTECTED", 403);
      if (error.code === "O4005") throw new InstitutionError("ORG_SETUP_HANDLE_UNAVAILABLE", 409);
      if (error.code === "O4006") throw new InstitutionError("ORG_SETUP_PROFILE_REQUIRED", 409);
      if (error.code === "O5001") throw new InstitutionError("MFA_REQUIRED", 403);
      if (error.code === "M2301") throw new InstitutionError("FEATURE_RESTRICTED", 403);
      if (error.code === "M2302") throw new InstitutionError("FEATURE_RESTRICTION_LIMIT", 409);
      if (error.code === "M2201") throw new InstitutionError("ACCOUNT_ENFORCEMENT_LIMIT", 409);
      if (error.code === "O5002") throw new InstitutionError("GOVERNANCE_REQUIRED", 409);
      if (error.code === "O5003") throw new InstitutionError("CLAIM_APPROVAL_HELD", 409);
      if (error.code === "O6001") throw new InstitutionError("EARLY_PARTNER_CLOSED", 409);
      if (error.code === "O6002") throw new InstitutionError("EARLY_PARTNER_INELIGIBLE", 409);
      if (error.code === "O6003") throw new InstitutionError("EARLY_PARTNER_FULL", 409);
      if (error.code === "42501") throw new InstitutionError("FORBIDDEN", 403);
      if (error.code === "PVE01") throw new InstitutionError("VERIFICATION_REQUIRED", 409);
      if (error.code === "PVT05") throw new InstitutionError("VERIFICATION_ASSIGNMENT_REQUIRED", 403);
      if (error.code === "PV120") throw new InstitutionError("VERIFICATION_REQUEST_PENDING", 409);
      if (error.code === "RV250") throw new InstitutionError("POLICY_PAUSED", 409);
      if (error.code === "PV121") throw new InstitutionError("VERIFICATION_ALREADY_VERIFIED", 409);
      if (error.code === "PVT11") throw new InstitutionError("INSTITUTION_EVIDENCE_REQUIRED", 400);
      if (error.code === "23505" || error.code === "55000") throw new InstitutionError("CONFLICT", 409);
      if (["23502", "23503", "23514", "22P02"].includes(error.code)) throw new InstitutionError("INVALID_INPUT", 400);
      if (name === "a1a_audit_for_api" && error.code === "22023") throw new InstitutionError("INVALID_INPUT", 400);
      if (error.code === "54000") throw new InstitutionError("LIMIT_REACHED", 429);
      throw new Error("Institution service unavailable");
    }
    return data as T;
  }

  function readManagement(actor: string, org: string) {
    return rpc<DbManagement>("institution_manage_for_api", { p_actor: actor, p_org: org });
  }

  async function publishedProfile(row: DbInstitution): Promise<Institution> {
    const { logoAsset, ...data } = row;
    const result = logoAsset ? await logos.createSignedUrl(`${row.id}/${logoAsset}.webp`, 300) : null;
    return { ...data, logoUrl: result?.data?.signedUrl ?? null };
  }

  return {
    rpc,
    async auditPeople(ids) {
      const unique = [...new Set(ids.filter((id): id is string => !!id))];
      const people = new Map<string, AuditPerson>();
      for (let offset = 0; offset < unique.length; offset += 100) {
        const { data, error } = await client.from("profiles").select("user_id,display_name,username")
          .in("user_id", unique.slice(offset, offset + 100));
        if (error) continue;
        for (const { user_id, display_name, username } of data) {
          if (display_name || username) people.set(user_id, { displayName: display_name, username });
        }
      }
      return people;
    },
    async publicProfile(handle) {
      const row = await rpc<DbInstitution | null>("institution_public_for_api", { p_handle: handle });
      return row ? publishedProfile(row) : null;
    },
    async accounts(actor) {
      const result = await rpc<DbAccounts>("institution_accounts_for_api", { p_actor: actor });
      const organizations = result.organizations.map(({ logoAsset, ...org }) => ({
        org,
        logoPath: logoAsset ? `${org.id}/${logoAsset}.webp` : null,
      }));
      const paths = organizations.flatMap(({ logoPath }) => logoPath ? [logoPath] : []);
      const signed = new Map<string, string>();
      if (paths.length) {
        try {
          const { data } = await logos.createSignedUrls(paths, 300);
          for (const row of data ?? []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
        } catch { /* Unavailable logos fall back to initials without blocking the account list. */ }
      }
      return {
        ...result,
        organizations: organizations.map(({ org, logoPath }) => ({
          ...org,
          logoUrl: logoPath ? signed.get(logoPath) ?? null : null,
        })),
      };
    },
    async manage(actor, org) {
      const result = await readManagement(actor, org);
      return { ...result, organization: await publishedProfile(result.organization) };
    },
    async logo(actor, org, bytes) {
      const existing = await readManagement(actor, org);
      if (existing.role === "viewer") throw new InstitutionError("FORBIDDEN", 403);
      let data: Buffer;
      try { data = await safeProfileImage(bytes); }
      catch { throw new InstitutionError("INVALID_IMAGE", 400); }
      const asset = randomUUID();
      const path = `${org}/${asset}.webp`;
      const uploaded = await logos.upload(path, data, { contentType: "image/webp" });
      if (uploaded.error) throw new Error("Institution logo unavailable");
      try {
        await rpc("institution_logo_for_api", { p_actor: actor, p_org: org, p_asset: asset, p_expected: existing.organization.logoAsset });
      } catch (error) {
        // A known rollback permits deleting the new derivative. An ambiguous
        // network result is left for reconciliation so it cannot break a committed logo.
        if (error instanceof InstitutionError) await logos.remove([path]);
        throw error;
      }
      if (existing.organization.logoAsset) await logos.remove([`${org}/${existing.organization.logoAsset}.webp`]);
    },
  };
}
