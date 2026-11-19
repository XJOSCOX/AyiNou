import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../apps/web/src/messages/", import.meta.url);
const defaultDictionary = "en";
const languages = ["ht", "fr", "en", "es"];

function flatten(object, label, prefix = "") {
  assert.ok(object && typeof object === "object" && !Array.isArray(object), `${label}: expected an object`);
  const entries = Object.entries(object);
  assert.ok(entries.length, `${label}: empty dictionary at ${prefix || "<root>"}`);
  return entries.flatMap(([key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      assert.ok(value.trim(), `${label}: empty translation for ${name}`);
      return [[name, value]];
    }
    return flatten(value, label, name);
  });
}

function placeholders(text) {
  return [...text.matchAll(/\{[a-zA-Z][\w]*\}/g)].map(([value]) => value).sort();
}

function checkDictionary(reference, localized, label) {
  const missing = [...reference.keys()].filter((key) => !localized.has(key));
  const extra = [...localized.keys()].filter((key) => !reference.has(key));
  assert.ok(!missing.length && !extra.length,
    `${label}: missing keys [${missing.join(", ")}]; extra keys [${extra.join(", ")}]`);
  for (const [key, value] of reference) {
    assert.deepEqual(placeholders(localized.get(key)), placeholders(value), `${label}: wrong placeholders for ${key}`);
  }
}

assert.throws(() => checkDictionary(new Map([["required", "{name}"]]), new Map(), "missing-key check"), /missing keys \[required\]/);
assert.throws(() => checkDictionary(new Map([["required", "{name}"]]), new Map([["required", "changed"]]), "placeholder check"), /wrong placeholders/);

const namespaces = ["", ...readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)];
let spanishKeys = 0;
for (const namespace of namespaces) {
  const name = namespace || "general";
  const load = (language) => {
    const file = new URL(join(namespace, `${language}.json`).replaceAll("\\", "/"), root);
    return new Map(flatten(JSON.parse(readFileSync(file, "utf8")), `${name}/${language}`));
  };
  const reference = load(defaultDictionary);
  for (const language of languages) {
    if (language !== defaultDictionary) checkDictionary(reference, load(language), `${name}/${language}`);
  }
  spanishKeys += reference.size;
  console.log(`${name}: ${reference.size} keys in all four languages`);
}
console.log(`${spanishKeys} Spanish keys across ${namespaces.length} namespaces. Missing keys and placeholder changes are rejected.`);
