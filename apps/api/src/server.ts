import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

const config = readConfig();
const app = createApp(config);

try {
  if (config.AYINOU_BOOTSTRAP_ADMIN_USER_ID) {
    if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) throw new Error("The first-account bootstrap requires hosted Supabase API credentials.");
    const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.rpc("bootstrap_first_platform_admin_for_api", { p_user: config.AYINOU_BOOTSTRAP_ADMIN_USER_ID });
    if (error || typeof data !== "boolean") throw new Error("First-account bootstrap rejected. Check the configured account and hosted migration.");
    if (data) app.log.info("First platform administrator bootstrap completed");
  }
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error({ err: error }, "API startup failed");
  process.exitCode = 1;
}
