import { createClient } from "@supabase/supabase-js";
import type { ExportStatus } from "@ayinou/shared";
import type { ApiConfig } from "../config.js";
import { ApiError } from "./api-error.js";
import type { VerifiedSession } from "./auth.js";
import { makeExportPackage, sealExport, unsealExport } from "./privacy-export-package.js";
import { supabaseDatabaseOptions, supabaseFetch } from "./supabase-transport.js";

const unavailable = () => new ApiError(503, "EXPORT_RETRY", "Export temporarily unavailable");
const errors: Record<string, [number, string]> = {
  PRIVACY_DISABLED: [404, "Privacy export unavailable"],
  PRIVACY_EXPORT_DISABLED: [404, "Privacy export unavailable"],
  NOT_FOUND: [404, "Privacy export unavailable"],
  UNAUTHORIZED: [401, "Sign in to continue"],
  MFA_REQUIRED: [403, "Recent authenticator verification is required"],
  EXPORT_CONFLICT: [409, "Export request conflicts with its current state"],
  EXPORT_CHANGED: [409, "Export source changed"],
  EXPORT_EXPIRED: [410, "Export has expired"],
  INVALID_INPUT: [400, "Check the submitted fields"],
};

export function createPrivacyExport(config: ApiConfig, intakeEnabled: boolean) {
  if (!intakeEnabled || config.AYINOU_PRIVACY_EXPORT !== "synthetic") return null;
  const suppliedKey = config.AYINOU_PRIVACY_EXPORT_TEST_KEY;
  const master = suppliedKey && /^[a-fA-F0-9]{64}$/.test(suppliedKey) ? Buffer.from(suppliedKey, "hex") : null;
  const client = config.SUPABASE_URL && config.SUPABASE_SECRET_KEY
    ? createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: supabaseDatabaseOptions, global: { fetch: supabaseFetch(8_000) },
    }) : null;

  const identityArgs = (identity: VerifiedSession) => ({
    p_actor: identity.actor, p_session: identity.session, p_aal2: identity.aal2,
  });

  async function call<T>(identity: VerifiedSession, action: string, params: Record<string, unknown> = {}) {
    if (!client || !master) throw unavailable();
    const { data, error } = await client.rpc("privacy_export_for_api", {
      ...identityArgs(identity), p_totp: identity.totpAt ?? null, p_action: action, ...params,
    });
    if (!error && data !== null) return data as T;
    // PostgreSQL details, plaintext projections, ciphertext and keys never reach the HTTP error envelope.
    const code = error?.message ?? "";
    if (error?.code.startsWith("PT") && Object.hasOwn(errors, code)) {
      const [status, message] = errors[code];
      throw new ApiError(status, code, message);
    }
    throw unavailable();
  }

  async function cleanup(identity: VerifiedSession) {
    await client?.rpc("privacy_export_cleanup_for_api", identityArgs(identity));
    // Atomic cleanup is idempotent. A failed call is retried on a subsequent scoped status or revoke.
  }

  return {
    availability: (identity: VerifiedSession) => call<{ enabled: true }>(identity, "availability"),
    async status(identity: VerifiedSession, reference: { p_case: string } | { p_id: string }) {
      const status = await call<ExportStatus>(identity, "status", reference);
      await cleanup(identity);
      return status;
    },
    async generate(identity: VerifiedSession, caseId: string, version: number, key: string) {
      const start = await call<ExportStatus | { id: string; projection: unknown; generatedAt: string; fence: string }>(
        identity, "start", { p_case: caseId, p_version: version, p_policy: 1, p_key: key },
      );
      if (!("projection" in start)) return start;
      const run = { p_id: start.id, p_fence: start.fence };
      let plaintext: Buffer | undefined;
      try {
        plaintext = makeExportPackage(start.projection, start.generatedAt);
        const envelope = sealExport(master!, { subject: identity.actor, caseId, artifact: start.id }, plaintext);
        return await call<ExportStatus>(identity, "finish", { ...run, p_envelope: envelope });
      } catch (cause) {
        // If a commit succeeded but its response was lost, the available state cannot be downgraded.
        await call<ExportStatus>(identity, "fail", run).catch(() => undefined);
        if (cause instanceof ApiError) throw cause;
        throw unavailable();
      } finally { plaintext?.fill(0); }
    },
    async download(identity: VerifiedSession, artifact: string) {
      const reference = { p_id: artifact };
      const protectedArtifact = await call<{ caseId: string; keyVersion: number; envelope: string } | { corrupt: true }>(
        identity, "read", reference,
      );
      if ("corrupt" in protectedArtifact) throw unavailable();
      let plaintext: Buffer | undefined;
      try {
        plaintext = unsealExport(master!, { subject: identity.actor, caseId: protectedArtifact.caseId, artifact },
          protectedArtifact.keyVersion, protectedArtifact.envelope);
        // Recheck case, session, proof, revision, current projection and usage after authenticating the bytes.
        await call(identity, "release", reference);
        return plaintext;
      } catch (cause) {
        plaintext?.fill(0);
        if (cause instanceof ApiError) throw cause;
        throw unavailable();
      }
    },
    async revoke(identity: VerifiedSession, id: string, key: string) {
      const status = await call<ExportStatus>(identity, "revoke", { p_id: id, p_key: key });
      await cleanup(identity);
      return status;
    },
  };
}

export type PrivacyExportService = NonNullable<ReturnType<typeof createPrivacyExport>>;
