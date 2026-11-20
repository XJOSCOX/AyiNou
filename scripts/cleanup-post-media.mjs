import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { readConfig } from "../apps/api/src/config.ts";
import { createPostMediaService } from "../apps/api/src/services/post-media.ts";

const [mode, ...other] = process.argv.slice(2);
assert.ok(other.length === 0 && (mode === undefined || mode === "--apply"), "Unsupported cleanup mode.");
if (mode === undefined) {
  const preview = spawnSync(process.execPath, ["--import", "tsx", "scripts/cleanup-safety.mjs", "post_media"], { stdio: "inherit" });
  process.exit(preview.status ?? 1);
}

dotenv.config({ path: "apps/api/.env", quiet: true });
const config = readConfig();
const project = process.env.AYINOU_MEDIA_PROJECT_REF;
assert.match(project ?? "", /^[a-z0-9]{20}$/);
assert.equal(new URL(config.SUPABASE_URL).hostname, `${project}.supabase.co`);
const media = createPostMediaService(config);
assert.ok(media, "Server storage credentials are required.");
let removed = 0;
try {
  for (let batch = 0; batch < 10; batch++) {
    const count = await media.cleanup();
    removed += count;
    if (count < 16) break;
  }
  console.log(`Cleaned up ${removed} discarded or expired attachment records.`);
} catch {
  console.error("Post media cleanup stopped. Retry later; unfinished records remain eligible for retry.");
  process.exitCode = 1;
}
