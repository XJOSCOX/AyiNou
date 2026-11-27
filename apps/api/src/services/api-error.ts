import { randomUUID } from "node:crypto";
import { LogController, type FastifyInstance } from "fastify";
import type { ApiErrorResponse } from "@ayinou/shared";
import { z } from "zod";

export function requestIdentification() {
  return { requestIdHeader: false, genReqId: () => randomUUID(), logController: new LogController({ disableRequestLogging: true }) } as const;
}

export class ApiError extends Error {
  constructor(readonly statusCode: number, readonly code: string, readonly publicMessage: string) {
    super(code);
  }
}

const safeEnvelope = z.object({ error: z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  message: z.string().min(1).max(200),
}) });

function fallbackCode(status: number) {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409: return "CONFLICT";
    case 413: return "PAYLOAD_TOO_LARGE";
    case 422: return "INVALID_CONTENT";
    case 429: return "RATE_LIMITED";
    case 503: return "SERVICE_UNAVAILABLE";
    default: return status < 500 ? "BAD_REQUEST" : "INTERNAL_ERROR";
  }
}

export function registerErrorHandling(app: FastifyInstance, quietHealth = false) {
  app.addHook("onRequest", async (request, reply) => { reply.header("X-Request-ID", request.id); });
  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.statusCode < 400) return payload;
    let parsed: unknown;
    if (typeof payload === "string" && String(reply.getHeader("content-type")).includes("application/json")) {
      try { parsed = JSON.parse(payload); } catch { /* The safe fallback applies. */ }
    }
    const original = safeEnvelope.safeParse(parsed);
    const status = reply.statusCode;
    const error: ApiErrorResponse["error"] = original.success ? original.data.error
      : { code: fallbackCode(status), message: status >= 500 ? "Service unavailable" : "Request could not be processed" };
    if (status === 413) error.code = "PAYLOAD_TOO_LARGE";
    reply.type("application/json");
    return JSON.stringify({ error: { ...error, requestId: request.id, retryable: status === 429 || status === 503 } });
  });
  app.addHook("onResponse", async (request, reply) => {
    if (quietHealth && request.routeOptions.url === "/health" && reply.statusCode < 400) return;
    const metadata = { method: request.method, route: request.routeOptions.url ?? "unmatched", status: reply.statusCode };
    if (reply.statusCode >= 500) request.log.error(metadata, "Request finished");
    else request.log.info(metadata, "Request finished");
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } }));
  app.setErrorHandler((cause, request, reply) => {
    if (cause instanceof ApiError) {
      if (cause.statusCode === 429) reply.header("Retry-After", "60");
      return reply.code(cause.statusCode).send({ error: { code: cause.code, message: cause.publicMessage } });
    }
    if (cause instanceof z.ZodError) {
      return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "Check the submitted fields" } });
    }
    const code = typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : "";
    const hint = typeof cause === "object" && cause !== null && "statusCode" in cause ? cause.statusCode : undefined;
    const status = ["23503", "23514", "22001"].includes(code) ? 400
      : typeof hint === "number" && hint >= 400 && hint < 500 ? hint : 500;
    if (status === 500) request.log.error({ kind: cause instanceof Error ? cause.name : "unknown" }, "Request failed");
    return reply.code(status).send({
      error: { code: fallbackCode(status), message: status === 500 ? "An unexpected error occurred" : "Request could not be processed" },
    });
  });
}
