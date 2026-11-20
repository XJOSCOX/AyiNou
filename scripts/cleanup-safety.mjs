import assert from "node:assert/strict";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readConfig } from "../apps/api/src/config.ts";

const [category, mode, ...other] = process.argv.slice(2);
assert.ok(["read_limits", "write_limits", "snapshots", "notifications", "post_media"].includes(category),
  "Choose one cleanup category.");
assert.ok(other.length === 0 && (mode === undefined || mode === "--apply"), "Unsupported cleanup mode.");
assert.ok(category !== "post_media" || mode === undefined, "Use db:cleanup:post-media -- --apply for private objects.");
dotenv.config({ path: "apps/api/.env", quiet: true });
const config = readConfig();
const project = process.env.AYINOU_MEDIA_PROJECT_REF;
assert.match(project ?? "", /^[a-z0-9]{20}$/);
assert.equal(new URL(config.SUPABASE_URL).hostname, `${project}.supabase.co`);
assert.ok(config.SUPABASE_SECRET_KEY, "API service credentials required.");
const client = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = mode === "--apply";
const { data, error } = await client.rpc("safety_cleanup_for_api", { p_category: category, p_apply: apply, p_limit: 1000 });
if (error || typeof data !== "number") {
  console.error("Safety maintenance could not complete.");
  process.exitCode = 1;
} else console.log(`${apply ? "Removed" : "Eligible in the next batch"} for ${category}: ${data} (maximum 1000).`);
