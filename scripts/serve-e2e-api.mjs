import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

const { AYINOU_E2E_SUPABASE_URL: url, AYINOU_E2E_PROJECT: project,
  AYINOU_E2E_SUPABASE_PUBLIC: publishable, AYINOU_E2E_SUPABASE_SECRET: secret } = process.env;
if (url !== "http://127.0.0.1:55321" || !/^ayinou-e2e-[a-f0-9-]{12}$/.test(project ?? "") || !publishable || !secret) {
  throw new Error("The E2E API requires the disposable local test project");
}
const config = readConfig({
  API_HOST: "127.0.0.1",
  API_PORT: "5300",
  WEB_ORIGINS: "http://127.0.0.1:5400",
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: publishable,
  SUPABASE_SECRET_KEY: secret,
  LOG_LEVEL: "error",
});
const app = createApp(config);
await app.listen({ host: config.API_HOST, port: config.API_PORT });
