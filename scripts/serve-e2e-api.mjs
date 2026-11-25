import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

const { AYINOU_E2E_SUPABASE_URL: url, AYINOU_E2E_PROJECT: project,
  AYINOU_E2E_SUPABASE_PUBLIC: publishable, AYINOU_E2E_SUPABASE_SECRET: secret } = process.env;
if (url !== "http://127.0.0.1:55321" || !/^ayinou-e2e-[a-f0-9-]{12}$/.test(project ?? "") || !publishable || !secret) {
  throw new Error("The E2E API requires the disposable local test project");
}
const config = readConfig({
  API_HOST: "127.0.0.1",
  API_PORT: process.argv.includes("--secondary") ? "5301" : "5300",
  WEB_ORIGINS: "http://127.0.0.1:5400",
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: publishable,
  SUPABASE_SECRET_KEY: secret,
  LOG_LEVEL: "error",
  AYINOU_FOUNDER_BOOTSTRAP_ENABLED: "true",
  AYINOU_COMMUNITY_NEEDS: "synthetic",
  AYINOU_PROJECT_OUTCOME_REVIEW: "synthetic",
  AYINOU_PROJECT_OUTCOME_PUBLICATION: "synthetic",
  AYINOU_VOLUNTEER_PROFILES: "synthetic",
  AYINOU_IMPACT_REPORTING: "synthetic",
  AYINOU_PROJECT_OUTCOMES: process.argv.includes("--secondary") ? "disabled" : "synthetic",
  AYINOU_COMMUNITY_NEEDS_RELEASE: "0000000000000000000000000000000000000016",
  AYINOU_PRIVACY_INTAKE: "synthetic",
  AYINOU_PRIVACY_EXPORT: "synthetic",
  AYINOU_PRIVACY_LIFECYCLE: "synthetic",
  AYINOU_PRIVACY_EXPORT_TEST_KEY: process.env.AYINOU_E2E_EXPORT_KEY,
});
const app = createApp(config);
await app.listen({ host: config.API_HOST, port: config.API_PORT });
