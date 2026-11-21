import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import publishedReleases from "../../../web/src/lib/legal/published-releases.json";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";

const policyIds = ["terms", "privacy", "community-guidelines", "organizations", "projects-and-volunteers",
  "voting", "verification", "cookies", "data-rights"] as const;
const actionInput = z.strictObject({
  scope: z.enum(["global", "policy"]),
  policyId: z.enum(policyIds).nullable(),
  action: z.enum(["enable", "disable", "suspend", "restore"]),
  expectedRevision: z.number().int().min(0),
  reason: z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value)),
  requestId: z.uuid(),
  confirm: z.literal("CHANGE LEGAL AVAILABILITY"),
}).refine((value) => (value.scope === "global") === (value.policyId === null));

type ReleaseKey = { policyId: string; version: string };
const releases = publishedReleases as ReleaseKey[];
const immutableRelease = (policyId: string, version: string | null, digest: string | null) =>
  version !== null && digest !== null && releases.some((release) => release.policyId === policyId &&
    release.version === version && createHash("sha256").update(JSON.stringify(release)).digest("hex") === digest);

type PolicySetting = { policyId: string; enabled: boolean; state: string; releaseVersion: string | null; releaseDigest: string | null; eligible: boolean; revision: number };
type AdminSettings = { global: { enabled: boolean; suspended: boolean; revision: number }; policies: PolicySetting[] };
type PublicAvailability = { enabled: boolean; revision: number; policies: { policyId: string; version: string; digest: string }[] };

export function registerPublicLegalRoutes(app: FastifyInstance, repo: InstitutionRepository | null) {
  app.get("/api/v1/legal/availability", async (_request, reply) => {
    reply.header("Cache-Control", "public, no-store");
    if (!repo) return { enabled: false, policies: [] };
    try {
      const data = await repo.rpc<PublicAvailability>("legal_availability_for_api", {});
      const authorized = Array.isArray(data.policies) ? data.policies.filter((item) =>
        immutableRelease(item.policyId, item.version, item.digest)) : [];
      const enabled = data.enabled === true && authorized.length > 0;
      return { enabled, policies: enabled ? authorized.map(({ policyId, version }) => ({ policyId, version })) : [] };
    } catch {
      return { enabled: false, policies: [] };
    }
  });
}

export function registerAdminLegalRoutes(app: FastifyInstance, repo: InstitutionRepository) {
  app.get("/api/v1/admin/legal", async (request) => {
    const data = await repo.rpc<AdminSettings>("admin_legal_settings_for_api", { p_actor: request.authUserId });
    const policies = data.policies.map((policy) => ({ ...policy,
      eligible: ["approved", "published", "suspended"].includes(policy.state) &&
        immutableRelease(policy.policyId, policy.releaseVersion, policy.releaseDigest) && policy.eligible === true,
    }));
    const current = policies.filter((policy) => policy.enabled && policy.state === "published" && policy.eligible)
      .map((policy) => ({ policyId: policy.policyId, version: policy.releaseVersion! }));
    const historical = releases.filter((release) => !current.some((item) =>
      item.policyId === release.policyId && item.version === release.version))
      .map((release) => ({ policyId: release.policyId, version: release.version }));
    return { ...data, policies, current, historical,
      acceptance: { terms: false, privacyAcknowledgment: false, optionalConsent: false, materialNotices: false } };
  });
  app.get("/api/v1/admin/legal/audit", async (request) => ({
    events: await repo.rpc("admin_legal_audit_for_api", { p_actor: request.authUserId }),
  }));
  app.post("/api/v1/admin/legal/actions", { bodyLimit: 4096 }, async (request) => {
    const input = actionInput.parse(request.body);
    if (input.action === "enable" || input.action === "restore") {
      const status = await repo.rpc<AdminSettings>("admin_legal_settings_for_api", { p_actor: request.authUserId });
      const eligible = input.scope === "global" ? status.policies.some((policy) => policy.enabled &&
        policy.state === "published" && policy.eligible && immutableRelease(policy.policyId, policy.releaseVersion, policy.releaseDigest))
        : status.policies.some((policy) => policy.policyId === input.policyId &&
          policy.eligible && immutableRelease(policy.policyId, policy.releaseVersion, policy.releaseDigest));
      if (!eligible) throw new InstitutionError("LEGAL_APPROVAL_REQUIRED", 409);
    }
    return repo.rpc("admin_legal_action_for_api", {
      p_actor: request.authUserId, p_scope: input.scope, p_policy: input.policyId,
      p_action: input.action, p_expected: input.expectedRevision,
      p_reason: input.reason, p_request: input.requestId,
    });
  });
}
