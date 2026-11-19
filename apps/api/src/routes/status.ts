import type { FastifyInstance } from "fastify";
import { getHealth, getStatus } from "../services/status.js";

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => getHealth());
  app.get("/api/v1/status", async () => getStatus());
}
