import { BlockList, isIP } from "node:net";
import { z } from "zod";

const renderSupabaseUrl = "https://hcbxulyfmdmuyccgrujs.supabase.co";

const closedRenderFlags = [
  "AYINOU_COMMUNITY_NEEDS", "AYINOU_MENTORSHIP_PROFILES", "AYINOU_OPPORTUNITY_ACTIVATION",
  "AYINOU_OPPORTUNITY_PUBLICATION", "AYINOU_PROFESSIONAL_OPPORTUNITIES", "AYINOU_VOLUNTEER_ACTIVATION",
  "AYINOU_VOLUNTEER_RECRUITMENT", "AYINOU_VOLUNTEER_MATCHING", "AYINOU_OPPORTUNITY_REQUIREMENTS",
  "AYINOU_VOLUNTEER_PROFILES", "AYINOU_IMPACT_REPORTING", "AYINOU_PROJECT_OUTCOME_PUBLICATION",
  "AYINOU_PROJECT_OUTCOME_REVIEW", "AYINOU_PROJECT_OUTCOMES", "AYINOU_PRIVACY_INTAKE",
  "AYINOU_PRIVACY_EXPORT", "AYINOU_PRIVACY_LIFECYCLE",
] as const;

const environmentSchema = z.object({
  AYINOU_API_MODE: z.enum(["local", "render-dev"]).optional(),
  AYINOU_RENDER_PROXY_CIDRS: z.string().max(400).optional(),
  AYINOU_RENDER_TEST_USER_IDS: z.string().max(600).optional(),
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
  AYINOU_MENTORSHIP_PROFILES: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_OPPORTUNITY_ACTIVATION: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_OPPORTUNITY_PUBLICATION: z.enum(["disabled","synthetic"]).default("disabled").optional(),
  AYINOU_PROFESSIONAL_OPPORTUNITIES: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_VOLUNTEER_ACTIVATION: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_VOLUNTEER_RECRUITMENT: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_VOLUNTEER_MATCHING: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_OPPORTUNITY_REQUIREMENTS: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_VOLUNTEER_PROFILES: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_IMPACT_REPORTING: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PROJECT_OUTCOME_PUBLICATION: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PROJECT_OUTCOME_REVIEW: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PROJECT_OUTCOMES: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PRIVACY_INTAKE: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PRIVACY_EXPORT: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PRIVACY_LIFECYCLE: z.enum(["disabled", "synthetic"]).default("disabled").optional(),
  AYINOU_PRIVACY_EXPORT_TEST_KEY: z.string().optional(),
});

export type ApiConfig = z.infer<typeof environmentSchema> & {
  renderDevelopment?: {
    testUserIds: readonly string[];
    trustProxy(address: string, hop: number): boolean;
  };
};

function renderProxyTrust(value: string | undefined) {
  if (value !== "127.0.0.0/8") return null;
  const allowed = new BlockList();
  allowed.addSubnet("127.0.0.0", 8, "ipv4");
  return (address: string, hop: number) => {
    const family = isIP(address);
    return hop === 0 && family !== 0 && allowed.check(address, family === 6 ? "ipv6" : "ipv4");
  };
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error("Invalid API environment configuration. Check .env.example.");
  }
  const config = result.data;
  if (environment.RENDER === "true" && config.AYINOU_API_MODE !== "render-dev") {
    throw new Error("Invalid API environment configuration. Render requires restricted development mode.");
  }
  if (config.AYINOU_API_MODE === "render-dev") {
    const port = z.string().regex(/^\d{1,5}$/).transform(Number).pipe(z.number().int().min(1).max(65535))
      .safeParse(environment.PORT);
    const trustProxy = renderProxyTrust(config.AYINOU_RENDER_PROXY_CIDRS);
    const ids = z.array(z.uuid()).min(1).max(10).safeParse(
      config.AYINOU_RENDER_TEST_USER_IDS?.split(",").map((value) => value.trim().toLowerCase()),
    );
    if (environment.NODE_ENV !== "production" || !port.success || [18012, 18013, 19099].includes(port.data)
      || !trustProxy || !ids.success || new Set(ids.data).size !== ids.data.length
      || config.SUPABASE_URL !== renderSupabaseUrl
      || !config.SUPABASE_PUBLISHABLE_KEY || !config.SUPABASE_SECRET_KEY
      || config.SUPABASE_PUBLISHABLE_KEY === config.SUPABASE_SECRET_KEY
      || config.AYINOU_FOUNDER_BOOTSTRAP_ENABLED === "true" || config.AYINOU_COMMUNITY_NEEDS_RELEASE
      || config.AYINOU_PRIVACY_EXPORT_TEST_KEY
      || closedRenderFlags.some((key) => config[key] !== "disabled")) {
      throw new Error("Invalid API environment configuration. Check the restricted Render development settings.");
    }
    return { ...config, API_HOST: "0.0.0.0", API_PORT: port.data, WEB_ORIGINS: [],
      renderDevelopment: { testUserIds: ids.data, trustProxy } };
  }
  if (result.data.AYINOU_PRIVACY_INTAKE === "synthetic" &&
      (environment.NODE_ENV === "production" || result.data.SUPABASE_URL !== "http://127.0.0.1:55321")) {
    return { ...result.data, AYINOU_PRIVACY_INTAKE: "disabled", AYINOU_PRIVACY_EXPORT: "disabled", AYINOU_PRIVACY_LIFECYCLE: "disabled" };
  }
  return result.data;
}
