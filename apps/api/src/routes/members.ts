import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { interestCodes, locales, normalizePublicUsername, publicUsernamePattern, referralCodePattern, type ApiErrorResponse, type UpdateMemberProfile } from "@ayinou/shared";
import type { AuthVerifier } from "../services/auth.js";
import { MemberError, type MemberRepository } from "../services/members.js";
import type { ReadBudget } from "../services/read-budget.js";

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
// Legacy handles may begin with a number. PostgreSQL applies the new format only on assignment.
const username = z.string().max(64).transform(normalizePublicUsername).pipe(z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/));
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
  showCountry: z.boolean(), showDepartment: z.boolean(), showInterests: z.boolean(),
  skipOptional: z.boolean(),
  interests: z.array(z.enum(interestCodes)).max(interestCodes.length)
    .transform((values) => [...new Set(values)]),
}).partial().strict().refine((value) => Object.keys(value).length > 0).or(
  z.strictObject({ publishProfile: z.literal(true) }),
);
const usernameReview = z.strictObject({
  requestId: z.uuid(),
  action: z.enum(["hold", "release", "correct", "appeal_reviewed"]),
  username,
  replacement: username.refine((value) => publicUsernamePattern.test(value)).optional(),
  reason: z.enum(["impersonation", "abuse", "false_positive", "safety"]),
}).refine(({ action, replacement }) => (action === "correct") === (replacement !== undefined));

const avatarInput = z.object({ image: z.base64().max(2_796_204) }).strict();
const referralInput = z.object({ code: z.string().max(64).trim().toUpperCase() }).strict();

function error(code: string, message: string): ApiErrorResponse {
  return { error: { code, message } };
}

export async function registerMemberRoutes(
  app: FastifyInstance,
  auth: AuthVerifier | null,
  members: MemberRepository | null,
  read: ReadBudget,
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

  app.get("/api/v1/usernames/availability", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await read("username", null, request.ip);
    const parsed = z.strictObject({ username: z.string().max(64) }).safeParse(request.query);
    const candidate = parsed.success ? normalizePublicUsername(parsed.data.username) : "";
    if (!publicUsernamePattern.test(candidate)) return { status: "invalid" };
    if (!members?.usernameAvailability) return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Username check unavailable"));
    try {
      return { status: await members.usernameAvailability(candidate) };
    } catch (cause) {
      if (cause instanceof MemberError) return reply.code(cause.statusCode).send(error(cause.code, "Username check unavailable"));
      throw cause;
    }
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
    const header = request.headers.authorization;
    const token = /^Bearer ([^\s]+)$/.exec(header ?? "")?.[1];
    const actor = token && auth ? await auth.verify(token) : null;
    if (header !== undefined && (!token || !actor)) return reply.code(401).send(error("UNAUTHORIZED", "Invalid or expired session"));
    await read("profile", actor, request.ip);
    const profile = await members.publicProfile(input.data.username, token);
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

    protectedApp.post("/api/v1/admin/usernames/review", { bodyLimit: 512 }, async (request, reply) => {
      if (!members?.reviewUsername || !request.authToken) {
        return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Username review unavailable"));
      }
      const proof = await auth?.verifySession?.(request.authToken, true);
      if (!proof || proof.actor !== request.authUserId || proof.totpAt === undefined) {
        return reply.code(403).send(error("MFA_REQUIRED", "Recent authenticator verification required"));
      }
      const details = usernameReview.parse(request.body);
      try {
        return await members.reviewUsername({ ...details, actor: proof.actor, session: proof.session, totpAt: proof.totpAt });
      } catch (cause) {
        if (cause instanceof MemberError) return reply.code(cause.statusCode).send(error(cause.code, "Username review could not be completed"));
        throw cause;
      }
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
      if (!request.authUserId || (!members?.personalVerification && !members?.hasPersonalVerification)) {
        return reply.code(503).send(error("SERVICE_UNAVAILABLE", "Verification status unavailable"));
      }
      if (members.personalVerification) {
        const personalClaims = await members.personalVerification(request.authUserId);
        return { verified: personalClaims.length > 0, personalClaims };
      }
      return { verified: await members.hasPersonalVerification!(request.authUserId) };
    });

    protectedApp.get("/api/v1/me/profile", async (request, reply) => {
      if (!members || !request.authUserId || !request.authToken) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required"));
      return { profile: await members.get(request.authUserId, request.authToken) };
    });

    protectedApp.patch("/api/v1/me/profile", async (request, reply) => {
      if (!members || !request.authUserId || !request.authToken) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required"));
      const parsed = updateProfileSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(error("INVALID_PROFILE", "Profile details are invalid"));
      try {
        return { profile: await members.update(request.authUserId, request.authToken, parsed.data as UpdateMemberProfile) };
      } catch (cause) {
        if (cause instanceof MemberError) return reply.code(cause.statusCode).send(error(cause.code, "Profile could not be saved"));
        throw cause;
      }
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
