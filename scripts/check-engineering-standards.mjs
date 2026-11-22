import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const standardRoot = "docs/standards";
const inventory = "apps/api/test/fixtures/route-inventory.txt";
const baseline = "e57d16740a56f2426ee83cc3300d724a7366dc53";
const migrationRoot = "supabase/migrations/";
export const reportSections = [
  "Scope", "Data model and API", "Permissions and audit", "Privacy and lifecycle",
  "Localization and accessibility", "Reliability and recovery", "Validation and CI",
  "Documentation and operations", "Remaining blockers",
];

const list = (value) => Array.isArray(value) ? value : [];
const explanation = (value) => typeof value === "string" && value.trim() !== "" && !/^(?:n\/?a|none|todo|tbd|pass)[.!]?$/i.test(value.trim());
const relativePath = (value) => typeof value === "string" && /^[\w./-]+$/.test(value) &&
  posix.normalize(value) === value && !value.startsWith("/") && !value.split("/").includes("..");

const routeMap = (input) => new Map(input.trim().split(/\r?\n/).filter(Boolean)
  .map((line) => [line.split(" ", 2).join(" "), line]));

export function changedRoutes(original, current) {
  const old = routeMap(original);
  const next = routeMap(current);
  return [...next].filter(([key, line]) => {
    // Fastify generates a HEAD companion for GET. An independent HEAD is reviewed on its own.
    if (key.startsWith("HEAD ") && next.has("GET " + key.slice(5)) && line.endsWith(" onSend")) return false;
    return old.get(key) !== line;
  }).map(([, contract]) => contract);
}

export function verifyDeclarations({ registry, reports, routes, migrations, read, exists }) {
  const errors = [];
  const registered = { reports: new Set(), routes: new Set(), migrations: new Set() };
  const knownIds = new Set();
  if (!Array.isArray(registry?.features)) return ["feature-reviews.json needs a features array"];
  for (const feature of registry.features) {
    const id = feature?.id;
    if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id) || knownIds.has(id)) {
      errors.push("Each feature review needs a unique lowercase ID");
      continue;
    }
    knownIds.add(id);
    const report = feature.report;
    if (!relativePath(report) || !report.startsWith("docs/") || !report.endsWith(".md") || !exists(report)) {
      errors.push(id + ": missing feature report " + String(report));
    } else if (registered.reports.has(report)) {
      errors.push(id + ": duplicate feature report " + report);
    } else {
      registered.reports.add(report);
      const parts = read(report).split(/^## +(.+?) *\r?$/m);
      const sections = new Map();
      for (let index = 1; index < parts.length; index += 2) {
        const heading = parts[index];
        if (reportSections.includes(heading) && sections.has(heading)) errors.push(report + ": duplicate section " + heading);
        sections.set(heading, parts[index + 1]);
      }
      for (const title of reportSections) if (!explanation(sections.get(title))) errors.push(report + ": missing or empty section " + title);
    }
    if (!Array.isArray(feature.routes) || !Array.isArray(feature.migrations)) {
      errors.push(id + ": explicitly declare routes and migrations as arrays");
    }
    for (const review of list(feature.routes)) {
      const key = review?.route;
      const contract = review?.contract;
      if (typeof key !== "string" || !/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS) \/\S+$/.test(key)
          || typeof contract !== "string" || contract.split(" ", 2).join(" ") !== key || registered.routes.has(contract)) {
        errors.push(id + ": invalid or duplicate route contract review " + String(key));
        continue;
      }
      registered.routes.add(contract);
      if (!["durable", "exception"].includes(review.audit?.kind) || !explanation(review.audit?.detail)) {
        errors.push(key + ": declare a durable audit source or an explicit audit exception and reason");
      }
      if (review.access === "public") {
        if (!explanation(review.publicReason)) errors.push(key + ": explain why public access is appropriate");
      } else if (review.access === "restricted") {
        const test = review.authorization?.file;
        if (!relativePath(test) || !/^(apps\/api\/test\/|apps\/web\/e2e\/|supabase\/tests\/|scripts\/)/.test(test)
            || !/\.(?:ts|mjs|js|sql)$/.test(test) || !exists(test) || !explanation(review.authorization?.denialScenario)) {
          errors.push(key + ": link an authorization test and describe its denial scenario");
        }
      } else {
        errors.push(key + ": declare public or restricted access");
      }
    }
    for (const review of list(feature.migrations)) {
      const file = review?.file;
      if (!relativePath(file) || !file.startsWith(migrationRoot) || !file.endsWith(".sql")
          || !exists(file) || registered.migrations.has(file)) {
        errors.push(id + ": missing, invalid or duplicate migration review " + String(file));
        continue;
      }
      registered.migrations.add(file);
      for (const field of ["rlsAndGrants", "authorization", "compatibility", "validation", "rolloutAndRollback"]) {
        if (!explanation(review[field])) errors.push(file + ": migration review needs " + field);
      }
    }
  }
  for (const [category, paths] of Object.entries({ reports, routes, migrations })) {
    for (const path of paths) if (!registered[category].has(path)) {
      errors.push(path + ": add a " + { reports: "feature report", routes: "route audit and access", migrations: "migration security" }[category] + " entry in feature-reviews.json");
    }
  }
  return errors;
}

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("Standards baseline is unavailable. Fetch Git history including " + baseline + ".");
  }
}
const lines = (value) => value.trim().split(/\r?\n/).filter(Boolean);
const read = (path) => readFileSync(join(root, path), "utf8");
const exists = (path) => existsSync(join(root, path));
const tree = (path) => readdirSync(join(root, path), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile()).map((entry) => {
    const parent = entry.parentPath ?? entry.path;
    return relative(root, join(parent, entry.name)).replaceAll("\\", "/");
  });

const auditStatuses = new Set(["covered", "partially covered", "not covered", "intentionally current-state only",
  "gated/not operational", "pending policy"]);

export function verifyAuditIntegration(registry, exists) {
  if (registry?.version !== 1 || !Array.isArray(registry.modules) || registry.modules.length === 0) {
    return ["Audit integration register must declare version 1 and module entries."];
  }
  const errors = [];
  const seen = new Set();
  for (const entry of registry.modules) {
    const name = entry?.module;
    if (typeof name !== "string" || !/^[a-z][a-z0-9_]*$/.test(name) || seen.has(name)) {
      errors.push("Missing, invalid or duplicate audit module " + String(name));
      continue;
    }
    seen.add(name);
    for (const field of ["requiredEvents", "observed", "viewers", "excluded", "remediation"]) {
      if (!explanation(entry[field])) errors.push(name + ": audit integration needs " + field);
    }
    if (!auditStatuses.has(entry.status)) errors.push(name + ": invalid audit coverage status");
    if (!Array.isArray(entry.sources) || entry.sources.some((source) => typeof source !== "string" ||
      !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(source))
      || (entry.status === "covered" && entry.sources.length === 0)) errors.push(name + ": declare native sources");
    if (!Array.isArray(entry.missing) || entry.missing.some((gap) => !explanation(gap))) {
      errors.push(name + ": declare missing event coverage");
    }
    if (!Array.isArray(entry.tests) || entry.tests.some((file) => !relativePath(file) || !exists(file))) {
      errors.push(name + ": link existing audit test evidence");
    }
  }
  return errors;
}

function main() {
  const registry = JSON.parse(read(standardRoot + "/feature-reviews.json"));
  const known = new Set(lines(git("ls-tree", "-r", "--name-only", baseline, "--", "docs", migrationRoot)));
  const reports = tree("docs").filter((path) => /_IMPLEMENTATION_REPORT\.md$/.test(path) && !known.has(path));
  const routes = changedRoutes(git("show", baseline + ":" + inventory), read(inventory));
  const migrations = new Set([
    ...tree(migrationRoot.slice(0, -1)).filter((path) => path.endsWith(".sql") && !known.has(path)),
    ...lines(git("diff", "--name-only", baseline, "--", migrationRoot)).filter((path) => path.endsWith(".sql")),
  ]);
  const errors = verifyDeclarations({ registry, reports, routes, migrations, read, exists });
  errors.push(...verifyAuditIntegration(JSON.parse(read("docs/audit/integration-register.json")), exists));
  for (const file of ["AGENTS.md", ...tree(standardRoot).filter((path) => path.endsWith(".md"))]) {
    for (const [, target] of read(file).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const path = posix.join(dirname(file).replaceAll("\\", "/"), target.split("#")[0]);
      if (!exists(path)) errors.push(file + ": broken local link " + target);
    }
  }
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`Standards passed: ${registry.features.length} review records, ${routes.length} new or changed route contracts, ${migrations.size} migration reviews, and standards links.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
