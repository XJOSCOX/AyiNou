import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "./api-error.js";
import type { AuthVerifier } from "./auth.js";
import type { InstitutionRepository } from "./institutions.js";

const memberReads = new Set([
  "/api/v1/status",
  "/api/v1/me/profile", "/api/v1/me/dashboard", "/api/v1/me/platform-access", "/api/v1/me/verification-badge",
  "/api/v1/me/sessions", "/api/v1/me/notifications", "/api/v1/me/notifications/unread-count",
  "/api/v1/me/communities", "/api/v1/me/projects", "/api/v1/me/project-work", "/api/v1/me/following",
  "/api/v1/me/affiliations", "/api/v1/me/institution-accounts", "/api/v1/feed", "/api/v1/feed/social",
  "/api/v1/posts/:id", "/api/v1/posts/:id/attachments/:attachmentId/image",
  "/api/v1/posts/:id/comments", "/api/v1/posts/:id/comments/:commentId", "/api/v1/posts/:id/reaction",
  "/api/v1/comments/:id/reaction", "/api/v1/communities", "/api/v1/communities/:key",
  "/api/v1/communities/:key/posts", "/api/v1/communities/:key/members",
  "/api/v1/projects", "/api/v1/projects/:id", "/api/v1/projects/:id/image",
  "/api/v1/events", "/api/v1/events/:id", "/api/v1/polls", "/api/v1/polls/:id",
  "/api/v1/polls/:id/ballot", "/api/v1/polls/:id/results", "/api/v1/institutions/by-handle/:handle",
]);
const registration = z.object({ enabled: z.boolean(), mode: z.enum(["closed", "invitation_only", "public"]) });
const developmentHost = "api-dev.ayinou.com";
const windowMs = 60_000;

export function registerRenderDevelopment(
  app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null, testUserIds: readonly string[],
) {
  const allowedUsers = new Set(testUserIds);
  const perAddress = new Map<string, number>();
  const perMember = new Map<string, number>();
  const active = new WeakSet<object>();
  let pending = 0;
  let total = 0;
  let windowEnd = 0;

  function limited() {
    return new ApiError(429, "RATE_LIMITED", "Wait before trying again");
  }

  function release(request: object) {
    if (active.delete(request)) pending--;
  }

  app.addHook("onResponse", async (request) => release(request));
  app.addHook("onRequestAbort", async (request) => release(request));
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (request.protocol === "https") reply.header("Strict-Transport-Security", "max-age=31536000");

    const read = request.method === "GET" || request.method === "HEAD";
    if (request.url.length > 2048) throw new ApiError(414, "INVALID_INPUT", "Request URL is too long");
    if (request.headers["transfer-encoding"] || (request.headers["content-length"] && request.headers["content-length"] !== "0")) {
      throw new ApiError(400, "INVALID_INPUT", "Request body is not allowed");
    }
    // The Render health probe uses the internal HTTP listener. Only its exact process check is public.
    if (read && request.routeOptions.url === "/health" && request.url === "/health") return;

    if (!read || !memberReads.has(request.routeOptions.url ?? "") || request.headers.host !== developmentHost) {
      throw new ApiError(404, "NOT_FOUND", "Route not found");
    }
    if (request.protocol !== "https") throw new ApiError(403, "FORBIDDEN", "HTTPS required");
    const query = new URLSearchParams(request.url.split("?").slice(1).join("?"));
    if (query.has("review") || query.has("preview")) throw new ApiError(404, "NOT_FOUND", "Route not found");

    const now = Date.now();
    if (now >= windowEnd) {
      windowEnd = now + windowMs;
      perAddress.clear();
      perMember.clear();
      total = 0;
    }
    const addressCount = perAddress.get(request.ip) ?? 0;
    if (total >= 300 || addressCount >= 60 || pending >= 12) throw limited();
    total++;
    perAddress.set(request.ip, addressCount + 1);
    pending++;
    active.add(request);

    const raw = request.headers.authorization;
    const token = raw && raw.length <= 8192 ? /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(raw)?.[1] : null;
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign-in required");
    if (!auth || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Development access unavailable");
    const actor = await auth.verify(token);
    if (!actor) throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
    if (!allowedUsers.has(actor.toLowerCase())) throw new ApiError(403, "FORBIDDEN", "Development access required");
    const memberCount = perMember.get(actor) ?? 0;
    if (memberCount >= 90) throw limited();
    perMember.set(actor, memberCount + 1);

    // The native client signs in directly with Supabase. Its direct signup policy must also fail closed.
    const policy = await repo.rpc<unknown>("registration_policy_for_api", {}).catch(() => null);
    const parsed = registration.safeParse(policy);
    if (!parsed.success || (parsed.data.enabled && parsed.data.mode !== "closed")) {
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Development access unavailable");
    }
  });
}
