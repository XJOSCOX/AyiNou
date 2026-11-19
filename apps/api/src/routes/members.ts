import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { interestCodes, locales, referralCodePattern, type ApiErrorResponse, type UpdateMemberProfile } from "@ayinou/shared";
import type { AuthVerifier } from "../services/auth.js";
import { MemberError, type MemberRepository } from "../services/members.js";

declare module "fastify" {
  interface FastifyRequest { authUserId: string | null; authToken: string | null }
}

const legacyFields = {
  displayName: z.string().trim().min(2).max(80),
  preferredLocale: z.enum(locales),
  residenceCountryCode: z.union([z.string().regex(/^[A-Z]{2}$/), z.null()]),
  residenceDepartmentCode: z.union([z.string().regex(/^HT-[A-Z]{2}$/), z.null()]),
  diasporaDepartmentCode: z.union([z.string().regex(/^HT-[A-Z]{2}$/), z.null()]),
};
const updateProfileSchema = z.object(legacyFields).strict().refine((value) =>
  (value.residenceDepartmentCode === null || value.residenceCountryCode === "HT") &&
  (value.diasporaDepartmentCode === null || value.residenceCountryCode !== "HT"),
);
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{2,23}$/)
  .refine((value) => !["admin", "support", "ayinou", "system", "root", "moderator", "administrator"].includes(value));
const privateName = z.string().trim().min(1).max(80).refine((value) => !/\p{Cc}/u.test(value));
const profileChanges = z.object({
  ...legacyFields,
  firstName: privateName,
  lastName: privateName,
  membershipCategory: z.enum(["haitian", "international_supporter"]),
  onboardingStep: z.number().int().min(1).max(4),
  username,
  biography: z.string().trim().max(320).nullable(),
  discoverable: z.boolean(),
  showMembershipCategory: z.boolean(),
  interests: z.array(z.enum(interestCodes)).max(interestCodes.length)
    .transform((values) => [...new Set(values)]),
}).partial().strict().refine((value) => Object.keys(value).length > 0);
const avatarInput = z.object({ image: z.base64().max(2_796_204) }).strict();
const referralInput = z.object({ code: z.string().max(64).trim().toUpperCase() }).strict();

function error(code: string, message: string): ApiErrorResponse {
  return { error: { code, message } };
}

export async function registerMemberRoutes(
  app: FastifyInstance,
  auth: AuthVerifier | null,
  members: MemberRepository | null,
): Promise<void> {
  const accounts = members?.accounts;
  const validationAttempts = new Map<string, number>();
  let validationWindow = 0;
  let validationTotal = 0;

  app.post("/api/v1/referrals/validate", { bodyLimit: 512 }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const now = Date.now();
    if (now >= validationWindow) {
      validationAttempts.clear();
      validationTotal = 0;
      validationWindow = now + 60_000;
    }
    const attempts = validationAttempts.get(request.ip) ?? 0;
    if (attempts >= 10 || validationTotal >= 300) {
      return reply.header("Retry-After", String(Math.ceil((validationWindow - now) / 1000)))
        .code(429).send(error("RATE_LIMITED", "Try again shortly"));
    }
    validationAttempts.set(request.ip, attempts + 1);
    validationTotal++;
    const input = referralInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send(error("INVALID_REFERRAL", "Referral details are invalid"));
    if (!referralCodePattern.test(input.data.code)) return { valid: false };
    if (!accounts) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Referral service unavailable"));
    return { valid: await accounts.validateReferral(input.data.code) };
  });

  app.get("/api/v1/departments", async (_request, reply) => {
    if (!members) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Database unavailable"));
    return { departments: await members.departments() };
  });
  app.get("/api/v1/profiles/:username", async (request, reply) => {
    const input = z.object({ username }).safeParse(request.params);
    reply.header("Cache-Control", "no-store");
    if (!input.success) return reply.code(404).send(error("NOT_FOUND", "Profile not found"));
    if (!members?.publicProfile) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Profile unavailable"));
    const profile = await members.publicProfile(input.data.username);
    if (!profile) return reply.code(404).send(error("NOT_FOUND", "Profile not found"));
    return { profile };
  });

  app.register(async (protectedApp) => {
    protectedApp.decorateRequest("authUserId", null);
    protectedApp.decorateRequest("authToken", null);
    protectedApp.addHook("preHandler", async (request: FastifyRequest, reply) => {
      reply.header("Cache-Control", "private, no-store");
      if (!auth || !members) {
        return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Account service unavailable"));
      }
      const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "");
      if (!match) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required"));
      const userId = await auth.verify(match[1]);
      if (!userId) return reply.code(401).send(error("UNAUTHORIZED", "Invalid or expired session"));
      request.authUserId = userId;
      request.authToken = match[1];
    });

    protectedApp.get("/api/v1/me/member-code", async (request, reply) => {
      if (!accounts || !request.authUserId) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Account service unavailable"));
      return { memberCode: await accounts.memberCode(request.authUserId) };
    });
    protectedApp.get("/api/v1/me/referral-code", async (request, reply) => {
      if (!accounts || !request.authUserId) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Account service unavailable"));
      return { referralCode: await accounts.referralCode(request.authUserId) };
    });
    protectedApp.get("/api/v1/me/referrals", async (request, reply) => {
      if (!accounts || !request.authUserId) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Account service unavailable"));
      return { summary: await accounts.referralSummary(request.authUserId) };
    });
    protectedApp.post("/api/v1/me/referrals/attribution", { bodyLimit: 512 }, async (request, reply) => {
      if (request.body !== undefined && !z.object({}).strict().safeParse(request.body).success) {
        return reply.code(400).send(error("INVALID_REFERRAL", "Referral attribution is set during registration"));
      }
      if (!accounts || !request.authUserId) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Account service unavailable"));
      return { attributed: await accounts.recordReferral(request.authUserId) };
    });

    protectedApp.get("/api/v1/me/verification-badge", async (request, reply) => {
      if (!members?.hasPersonalVerification || !request.authUserId) {
        return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Verification status unavailable"));
      }
      return { verified: await members.hasPersonalVerification(request.authUserId) };
    });

    protectedApp.get("/api/v1/me/profile", async (request, reply) => {
      if (!members || !request.authUserId || !request.authToken) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required"));
      return { profile: await members.get(request.authUserId, request.authToken) };
    });

    protectedApp.patch("/api/v1/me/profile", async (request, reply) => {
      if (!members || !request.authUserId || !request.authToken) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required"));
      const parsed = updateProfileSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(error("INVALID_PROFILE", "Profile details are invalid"));
      return { profile: await members.update(request.authUserId, request.authToken, parsed.data as UpdateMemberProfile) };
    });

    protectedApp.patch("/api/v1/me/profile/details", async (request, reply) => {
      if (!members?.saveDetails || !request.authUserId || !request.authToken) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Profile unavailable"));
      const parsed = profileChanges.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(error("INVALID_PROFILE", "Profile details are invalid"));
      try {
        return { profile: await members.saveDetails(request.authUserId, request.authToken, parsed.data) };
      } catch (cause) {
        if (cause instanceof MemberError) return reply.code(cause.statusCode).send(error(cause.code, "Profile could not be saved"));
        throw cause;
      }
    });

    protectedApp.post("/api/v1/me/profile/avatar", { bodyLimit: 2_800_000 }, async (request, reply) => {
      if (!members?.saveAvatar || !request.authUserId) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Avatar unavailable"));
      const input = avatarInput.safeParse(request.body);
      const bytes = input.success ? Buffer.from(input.data.image, "base64") : null;
      if (!bytes?.length || bytes.length > 2_097_152) return reply.code(400).send(error("INVALID_AVATAR", "Choose a supported image up to 2 MiB"));
      try {
        return { avatarUrl: await members.saveAvatar(request.authUserId, bytes) };
      } catch (cause) {
        if (cause instanceof MemberError) return reply.code(cause.statusCode).send(error(cause.code, "Avatar could not be saved"));
        throw cause;
      }
    });
  });
}
