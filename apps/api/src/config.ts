import { z } from "zod";

const environmentSchema = z.object({
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGINS: z.string().default("http://127.0.0.1:4000,http://localhost:4000")
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .pipe(z.array(z.url()).min(1)),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type ApiConfig = z.infer<typeof environmentSchema>;

export function readConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error("Invalid API environment configuration. Check .env.example.");
  }
  return result.data;
}
