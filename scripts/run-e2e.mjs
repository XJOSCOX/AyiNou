import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fromRoot = (...paths) => join(root, ...paths);
const webUrl = "http://127.0.0.1:5400";
const apiUrl = "http://127.0.0.1:5300";
const supabaseUrl = "http://127.0.0.1:55321";
const ports = new Map([[54320, 55320], [54321, 55321], [54322, 55322], [54323, 55323],
  [54324, 55324], [54327, 55327], [54329, 55329], [8083, 8183]]);
const project = "ayinou-e2e-" + randomUUID().slice(0, 12);
const cli = fromRoot("node_modules", "supabase", "dist", "supabase.js");
const playwright = fromRoot("node_modules", "@playwright", "test", "cli.js");
const immediateSignup = process.argv.includes("--without-signup-confirmation");
const deploymentRehearsal = process.argv.includes("--deployment-rehearsal");
const recoveryRehearsal = process.argv.includes("--recovery-rehearsal");
const organizationRollout = recoveryRehearsal || deploymentRehearsal || process.argv.includes("--organization-rollout");
const runnerFlags = new Set(["--organization-rollout", "--deployment-rehearsal", "--recovery-rehearsal", "--without-signup-confirmation"]);
const args = process.argv.slice(2).filter((argument) => !runnerFlags.has(argument));
const organizationBaseline = "20261121010000";
// Source configuration comes from the newly started stack, never from development credentials.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/^(SUPABASE_|NEXT_PUBLIC_|AYINOU_|WEB_ORIGINS$|API_(HOST|PORT)$|NODE_ENV$|NODE_OPTIONS$|DOCKER_HOST$|DOCKER_CONTEXT$)/i.test(name)));

function run(file, argv, options = {}) {
  return new Promise((resolve, reject) => {
    const { capture, timeout, ...spawnOptions } = options;
    const child = spawn(process.execPath, [file, ...argv], {
      cwd: root, env, windowsHide: true, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      ...spawnOptions,
    });
    let output = "";
    child.stdout?.setEncoding("utf8").on("data", (part) => { output += part; });
    const interrupt = () => child.kill();
    process.once("SIGINT", interrupt);
    const deadline = timeout && setTimeout(interrupt, timeout);
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(deadline);
      process.removeListener("SIGINT", interrupt);
      if (status === 0) resolve(output);
      else reject(new Error(`${file.split(/[/\\]/).at(-1)} ${argv[0]} exited with ${status ?? "a signal"}`));
    });
  });
}

function probePort(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

async function available(port) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      await probePort(port);
      return;
    } catch (cause) {
      // Docker can briefly retain a published port after removing its container.
      if (cause.code !== "EADDRINUSE" || Date.now() >= deadline) {
        throw new Error(`E2E port ${port} is unavailable`, { cause });
      }
      await delay(250);
    }
  }
}

async function prepare(directory) {
  const supabase = join(directory, "supabase");
  const web = join(directory, "web");
  await Promise.all([mkdir(supabase), mkdir(web)]);
  let config = (await readFile(fromRoot("supabase", "config.toml"), "utf8"))
    .replace(/^project_id\s*=.*$/m, `project_id = "${project}"`)
    .replaceAll("http://127.0.0.1:4000", webUrl)
    .replace(/^(port|shadow_port|inspector_port)\s*=\s*(\d+)$/gm,
      (line, key, value) => ports.has(Number(value)) ? `${key} = ${ports.get(Number(value))}` : line)
    .replace(/(\[auth.mfa.totp\]\s*\r?\n)enroll_enabled = false\s*\r?\nverify_enabled = false/,
      "$1enroll_enabled = true\nverify_enabled = true");
  if (immediateSignup) {
    const emailConfirmation = /^(\[auth\.email\](?:(?!^\[)[\s\S])*?^enable_confirmations[ \t]*=[ \t]*)true\b/m;
    if (!emailConfirmation.test(config)) throw new Error("Could not configure disposable email auto-confirmation");
    config = config.replace(emailConfirmation, "$1false");
  }
  if (!config.includes(`project_id = "${project}"`) || !config.includes("port = 55321")) {
    throw new Error("Could not isolate Supabase configuration");
  }
  await Promise.all([
    writeFile(join(supabase, "config.toml"), config),
    cp(fromRoot("supabase", "migrations"), join(supabase, "migrations"), {
      recursive: true,
      filter: (path) => !organizationRollout || !/^\d{14}_/.test(basename(path)) || basename(path).slice(0, 14) <= organizationBaseline,
    }),
    ...["src", "public", "next.config.ts", "postcss.config.mjs", "tsconfig.json", "package.json"].map((name) =>
      cp(fromRoot("apps", "web", name), join(web, name), { recursive: true })),
  ]);
  return web;
}

async function rehearsalSql(file) {
  const input = await readFile(fromRoot("scripts", file), "utf8");
  return execFileSync("docker", ["exec", "-i", "supabase_db_" + project, "psql", "-XqAt", "-U", "postgres",
    "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { env, input, encoding: "utf8", timeout: 30_000, windowsHide: true }).trim();
}

async function main() {
  const config = fromRoot("apps", "web", "e2e", "playwright.config.ts");
  if (args.includes("--list")) {
    await run(playwright, ["test", "--config", config, ...args]);
    return;
  }
  await Promise.all([...ports.values(), 5300, 5301, 5400].map(available));
  const directory = await mkdtemp(fromRoot(".e2e-run-"));
  let startAttempted = false;
  try {
    const web = await prepare(directory);
    startAttempted = true;
    console.log(`Starting disposable Supabase project ${project}`);
    await run(cli, ["start", "--workdir", directory, "--output", "json",
      "--exclude", "studio,postgres-meta,edge-runtime,logflare,vector,realtime"],
      { capture: true, timeout: 240_000 });
    if (organizationRollout) {
      const oldCatalog = execFileSync("docker", ["exec", "supabase_db_" + project, "psql", "-U", "postgres",
        "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc",
        "select (to_regprocedure('public.organization_intent_for_api(uuid,uuid,boolean)') is null)::text || ':' || max(version) from supabase_migrations.schema_migrations"],
        { env, encoding: "utf8", timeout: 10_000, windowsHide: true }).trim();
      if (oldCatalog !== "true:" + organizationBaseline) throw new Error("Unexpected organization rehearsal baseline");
      if (deploymentRehearsal) {
        console.log("D1 baseline catalog " + await rehearsalSql("d1-catalog.sql"));
        await rehearsalSql("d1-legacy-fixture.sql");
      }
      await cp(fromRoot("supabase", "migrations"), join(directory, "supabase", "migrations"), { recursive: true });
      // The disposable work directory has no linked project and migration up targets local by default.
      await run(cli, ["migration", "up", "--workdir", directory], { timeout: 120_000 });
      if (deploymentRehearsal) {
        await rehearsalSql("d1-legacy-assertions.sql");
        console.log("D1 legacy owner, old-route denial, audit and closed-gate checks passed");
        console.log("D1 upgraded catalog " + await rehearsalSql("d1-catalog.sql"));
      }
      console.log("Upgraded the disposable L6.2A database before starting the matching API and web applications");
    }
    if (args.includes("--measure-polls")) {
      await run(fromRoot("scripts", "measure-polls.mjs"), [project], { timeout: 300_000 });
      return;
    }
    const credentials = JSON.parse(await run(cli, ["status", "--workdir", directory, "--output", "json"],
      { capture: true, timeout: 30_000 }));
    const publicKey = credentials.PUBLISHABLE_KEY ?? credentials.ANON_KEY;
    const secretKey = credentials.SECRET_KEY ?? credentials.SERVICE_ROLE_KEY;
    if (credentials.API_URL !== supabaseUrl || !publicKey || !secretKey) {
      throw new Error("Disposable Supabase endpoint or credentials did not match");
    }
    const testEnv = { ...env, AYINOU_E2E_PROJECT: project, AYINOU_E2E_WEB_DIR: web, AYINOU_E2E_WEB_URL: webUrl,
      AYINOU_E2E_API_URL: apiUrl, AYINOU_E2E_SUPABASE_URL: supabaseUrl,
      AYINOU_E2E_SUPABASE_PUBLIC: publicKey, AYINOU_E2E_SUPABASE_SECRET: secretKey,
      AYINOU_E2E_EXPORT_KEY: randomBytes(32).toString("hex"),
      AYINOU_E2E_IMMEDIATE_SIGNUP: immediateSignup ? "true" : "false" };
    if (recoveryRehearsal) {
      await run(fromRoot("scripts", "rehearse-d2-recovery.mjs"), [], { env: testEnv, timeout: 240_000 });
      return;
    }
    await run(playwright, ["test", "--config", config, ...args], { env: testEnv });
  } finally {
    if (startAttempted) {
      await run(cli, ["stop", "--workdir", directory, "--no-backup", "--project-id", project],
        { capture: true, timeout: 60_000 });
      for (const resource of [["ps", "-aq"], ["volume", "ls", "-q"]]) {
        const remaining = execFileSync("docker", [...resource, "--filter", "name=" + project], {
          env, encoding: "utf8", timeout: 10_000, windowsHide: true,
        }).trim();
        if (remaining) throw new Error(`Docker cleanup incomplete for ${project}`);
      }
      console.log(`Removed disposable Supabase project ${project}`);
    }
    const resolved = await realpath(directory);
    if (dirname(resolved) !== await realpath(root) || !basename(resolved).startsWith(".e2e-run-")) {
      throw new Error("Refusing to remove an unexpected E2E workspace");
    }
    await rm(resolved, { recursive: true, force: true, maxRetries: 4 });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
