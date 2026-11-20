import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { FeedRepository } from "../../services/feed.js";
import type { ReadBudget } from "../../services/read-budget.js";

export interface ProjectRouteAccess {
  viewer(request: FastifyRequest, required?: boolean): Promise<{ actor: string | null; token: string | null }>;
  repo(): FeedRepository;
  read: ReadBudget;
}

export const projectPath = "/api/v1/projects";
export const id = z.strictObject({ id: z.uuid() });
export const version = z.number().int().positive().max(2147483647);
export const text = (maximum: number) => z.string().trim().max(maximum).refine((value) => !/\p{Cc}/u.test(value.replace(/[\r\n\t]/g, "")));
export const reason = (maximum: number) => text(maximum).refine((value) => value.length >= 10);
