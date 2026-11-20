import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname, join } from "node:path";
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
const args = process.argv.slice(2);
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

function available(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", () => reject(new Error(`E2E port ${port} is unavailable`)));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

async function prepare(directory) {
  const supabase = join(directory, "supabase");
  const web = join(directory, "web");
  await Promise.all([mkdir(supabase), mkdir(web)]);
  const config = (await readFile(fromRoot("supabase", "config.toml"), "utf8"))
    .replace(/^project_id\s*=.*$/m, `project_id = "${project}"`)
    .replace(/^(port|shadow_port|inspector_port)\s*=\s*(\d+)$/gm,
      (line, key, value) => ports.has(Number(value)) ? `${key} = ${ports.get(Number(value))}` : line)
    .replace(/(\[auth.mfa.totp\]\s*\r?\n)enroll_enabled = false\s*\r?\nverify_enabled = false/,
      "$1enroll_enabled = true\nverify_enabled = true");
  if (!config.includes(`project_id = "${project}"`) || !config.includes("port = 55321")) {
    throw new Error("Could not isolate Supabase configuration");
  }
  await Promise.all([
    writeFile(join(supabase, "config.toml"), config),
    cp(fromRoot("supabase", "migrations"), join(supabase, "migrations"), { recursive: true }),
    ...["src", "public", "next.config.ts", "postcss.config.mjs", "tsconfig.json", "package.json"].map((name) =>
      cp(fromRoot("apps", "web", name), join(web, name), { recursive: true })),
  ]);
  return web;
}

async function main() {
  const config = fromRoot("apps", "web", "e2e", "playwright.config.ts");
  if (args.includes("--list")) {
    await run(playwright, ["test", "--config", config, ...args]);
    return;
  }
  await Promise.all([...ports.values(), 5300, 5400].map(available));
  const directory = await mkdtemp(fromRoot(".e2e-run-"));
  let startAttempted = false;
  try {
    const web = await prepare(directory);
    startAttempted = true;
    console.log(`Starting disposable Supabase project ${project}`);
    await run(cli, ["start", "--workdir", directory, "--output", "json",
      "--exclude", "studio,postgres-meta,edge-runtime,logflare,vector,realtime,mailpit"],
      { capture: true, timeout: 240_000 });
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
    await run(playwright, ["test", "--config", config, ...args], {
      env: { ...env, AYINOU_E2E_PROJECT: project, AYINOU_E2E_WEB_DIR: web, AYINOU_E2E_WEB_URL: webUrl,
        AYINOU_E2E_API_URL: apiUrl, AYINOU_E2E_SUPABASE_URL: supabaseUrl,
        AYINOU_E2E_SUPABASE_PUBLIC: publicKey, AYINOU_E2E_SUPABASE_SECRET: secretKey },
    });
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
