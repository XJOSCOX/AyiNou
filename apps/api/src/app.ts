import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import type { ApiErrorResponse } from "@ayinou/shared";
import type { ApiConfig } from "./config.js";
import { statusRoutes } from "./routes/status.js";

export function createApp(config: ApiConfig) {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });

  app.register(cors, {
    origin: config.WEB_ORIGINS,
    methods: ["GET"],
  });
  app.register(statusRoutes);

  app.setNotFoundHandler((_request, reply) => {
    const body: ApiErrorResponse = { error: { code: "NOT_FOUND", message: "Route not found" } };
    reply.code(404).send(body);
  });
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "Request failed");
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    const body: ApiErrorResponse = {
      error: {
        code: status === 500 ? "INTERNAL_ERROR" : "BAD_REQUEST",
        message: status === 500 ? "An unexpected error occurred" : "Request could not be processed",
      },
    };
    reply.code(status).send(body);
  });

  return app;
}
