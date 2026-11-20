import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const listing = process.argv.includes("--list");
const { AYINOU_E2E_PROJECT: project, AYINOU_E2E_WEB_DIR: webDirectory,
  AYINOU_E2E_WEB_URL: web, AYINOU_E2E_API_URL: api, AYINOU_E2E_SUPABASE_URL: supabase,
  AYINOU_E2E_SUPABASE_PUBLIC: publishable } = process.env;
if (!listing && (!/^ayinou-e2e-[a-f0-9-]{12}$/.test(project ?? "") || !webDirectory || !publishable ||
  web !== "http://127.0.0.1:5400" || api !== "http://127.0.0.1:5300" || supabase !== "http://127.0.0.1:55321")) {
  throw new Error("Start the disposable environment with npm run test:e2e");
}
const root = resolve(__dirname, "../../..");

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "../e2e-results",
  workers: 1,
  retries: 0,
  timeout: 55_000,
  expect: { timeout: 10_000 },
  forbidOnly: true,
  reporter: [["list"], ["json", { outputFile: resolve(__dirname, "../e2e-results/report.json") }]],
  use: {
    baseURL: web,
    browserName: "chromium",
    locale: "en-US",
    timezoneId: "UTC",
    actionTimeout: 10_000,
    navigationTimeout: 25_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: listing ? undefined : [{
    command: "node --import tsx scripts/serve-e2e-api.mjs",
    cwd: root,
    url: api + "/api/v1/status",
    reuseExistingServer: false,
  }, {
    command: "node --import tsx scripts/serve-e2e-api.mjs --secondary",
    cwd: root,
    url: "http://127.0.0.1:5301/api/v1/status",
    reuseExistingServer: false,
  }, {
    command: "node ../../node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 5400",
    cwd: webDirectory,
    url: web + "/login",
    timeout: 90_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabase!,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable!,
      NEXT_PUBLIC_API_URL: api!,
      NEXT_TELEMETRY_DISABLED: "1",
      AYINOU_E2E_SUPABASE_SECRET: "",
      AYINOU_E2E_EXPORT_KEY: "",
    },
  }],
});
