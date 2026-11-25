import { z } from "zod";

const environmentSchema = z.object({
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGINS: z.string().default("http://127.0.0.1:4000,http://localhost:4000")
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .pipe(z.array(z.url()).min(1)),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  AYINOU_FOUNDER_BOOTSTRAP_ENABLED: z.enum(["true", "false"]).optional(),
  AYINOU_COMMUNITY_NEEDS: z.enum(["disabled", "synthetic", "pilot"]).default("disabled").optional(),
  AYINOU_COMMUNITY_NEEDS_RELEASE: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  AYINOU_PROJECT_OUTCOME_REVIEW: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PROJECT_OUTCOMES: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PRIVACY_INTAKE: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PRIVACY_EXPORT: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PRIVACY_LIFECYCLE: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PRIVACY_EXPORT_TEST_KEY: z.string().optional(),
});

export type ApiConfig = z.infer<typeof environmentSchema>;

export function readConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error("Invalid API environment configuration. Check .env.example.");
  }
  if (result.data.AYINOU_PRIVACY_INTAKE === "synthetic" &&
      (environment.NODE_ENV === "production" || result.data.SUPABASE_URL !== "http://127.0.0.1:55321")) {
    return { ...result.data, AYINOU_PRIVACY_INTAKE: "disabled", AYINOU_PRIVACY_EXPORT: "disabled", AYINOU_PRIVACY_LIFECYCLE: "disabled" };
  }
  return result.data;
}
