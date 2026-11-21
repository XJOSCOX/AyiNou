import { createHash, randomBytes } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const { AYINOU_FOUNDER_BOOTSTRAP_ENABLED, AYINOU_FOUNDER_EMAIL, AYINOU_FOUNDER_USERNAME,
  SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const destination = process.argv[2];
const email = AYINOU_FOUNDER_EMAIL?.trim().toLowerCase();
const username = AYINOU_FOUNDER_USERNAME?.trim().toLowerCase();
if (AYINOU_FOUNDER_BOOTSTRAP_ENABLED !== "true" || !SUPABASE_URL || !SUPABASE_SECRET_KEY ||
    !email || !/^[^@\s]+@[^@\s]+$/.test(email) || !username || !/^[a-z0-9][a-z0-9_]{2,23}$/.test(username) ||
    !destination || process.argv.length !== 3) {
  throw new Error("Configure the Founder enrollment settings and supply one new private destination file.");
}

const client = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const credential = randomBytes(32).toString("base64url");
await writeFile(destination, credential + "\n", { mode: 0o600, flag: "wx" });
let prepared = false;
try {
  const result = await client.rpc("prepare_founder_registration_for_api", {
    p_email: email, p_username: username,
    p_credential_hash: createHash("sha256").update(credential, "utf8").digest("hex"),
  });
  prepared = !result.error && result.data === true;
  if (!prepared) throw new Error("Founder enrollment could not be prepared. Check migration state, existing reservation and bootstrap history.");
} finally {
  if (!prepared) await unlink(destination);
}
console.log("Founder enrollment prepared. The credential is in the private file and expires after 30 minutes.");
