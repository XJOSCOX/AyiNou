import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { digest, validateRelease, buildRegistry, publishedRegistry } from "../apps/web/src/lib/legal/publication.ts";
import { LegalContentBlock } from "../apps/web/src/components/legal-content.tsx";

const root = fileURLToPath(new URL("..", import.meta.url));
const locales = ["ht", "fr", "en", "es"];
const document = (locale, text = `Fictional example ${locale}. No Ayinou policy.`) => ({ title: `Imaginary Lantern Rules ${locale}`, sections: [{ id: "sample", title: "Sample section", blocks: [{ kind: "paragraph", text }] }] });
const variants = locales.map((locale) => ({ locale, document: document(locale), digest: digest(document(locale)), translationDigest: `fictional-${locale}`, reviewId: `ling-${locale}`, jurisdictionReviewId: `jur-${locale}` }));
const candidate = {
  policyId: "terms", version: "1.0.0", sourceVersion: "fictional-1", sourceDigest: "fictional-source-digest",
  operatorId: "operator", jurisdiction: "Fictionland", effectiveDate: "2030-01-01", publishedAt: "2030-01-02T00:00:00Z",
  legalReviewId: "legal", productReviewId: "product", ownerApprovalId: "owner", publicationAuthorizationId: "publication", operationalReviewId: "operations",
  status: "APPROVED", variants,
};
const sources = [{ policyId: "terms", version: "fictional-1", digest: "fictional-source-digest" }];
const evidence = [
  ["operator", "operator"], ["legal", "legal"], ["product", "product"], ["owner", "owner"], ["publication", "publication"], ["operations", "operations"],
  ...locales.flatMap((locale) => [[`ling-${locale}`, "linguistic", locale, `fictional-${locale}`], [`jur-${locale}`, "jurisdiction", locale]]),
].map(([id, kind, locale, value]) => ({ id, kind, policyId: "terms", version: "1.0.0", locale, digest: value, actor: "fictional-reviewer", approved: true }));
const copy = (value) => structuredClone(value);

assert.equal(publishedRegistry.current("terms"), undefined);
assert.deepEqual(JSON.parse(readFileSync(join(root, "apps/web/src/lib/legal/published-releases.json"), "utf8")), []);
assert.deepEqual(JSON.parse(readFileSync(join(root, "apps/web/src/lib/legal/publication-evidence.json"), "utf8")), []);
assert.deepEqual(validateRelease(candidate, evidence, sources), []);
const registry = buildRegistry([candidate], evidence, sources);
assert.equal(registry.current("terms").variants.length, 4);
assert.equal(registry.current("terms").variants.find((item) => item.locale === "fr").document.title, "Imaginary Lantern Rules fr");
const second = copy(candidate);
second.version = "1.1.0";
second.supersedes = "1.0.0";
second.variants = second.variants.map((item) => ({ ...item, reviewId: `new-${item.reviewId}`, jurisdictionReviewId: `new-${item.jurisdictionReviewId}` }));
for (const field of ["operatorId", "legalReviewId", "productReviewId", "ownerApprovalId", "publicationAuthorizationId", "operationalReviewId"]) second[field] = `new-${second[field]}`;
const evidence2 = evidence.map((item) => ({ ...item, id: `new-${item.id}`, version: "1.1.0" }));
const archived = buildRegistry([candidate, second], [...evidence, ...evidence2], sources);
assert.equal(archived.current("terms").version, "1.1.0");
assert.equal(archived.version("terms", "1.0.0").version, "1.0.0");
assert.deepEqual(archived.history("terms").map((item) => item.version), ["1.1.0", "1.0.0"]);
assert.throws(() => buildRegistry([candidate, candidate], evidence, sources), /overwrite/);
const changed = copy(candidate); changed.sourceDigest = "wrong";
assert.ok(validateRelease(changed, evidence, sources).includes("stale source"));
const fake = copy(candidate); fake.ownerApprovalId = "invented";
assert.ok(validateRelease(fake, evidence, sources).includes("missing owner evidence"));
assert.ok(validateRelease(candidate, [], sources).some((item) => item.includes("publication")));
assert.ok(validateRelease(candidate, evidence, []).includes("stale source"));
for (const value of ["TODO", "DRAFT", "FUTURE FEATURE", "[[operator]]"]) {
  const invalid = copy(candidate); invalid.variants[0].document.sections[0].blocks[0].text = value;
  invalid.variants[0].digest = digest(invalid.variants[0].document);
  assert.ok(validateRelease(invalid, evidence, sources).includes("invalid content: ht"));
}
for (const href of ["javascript:alert(1)", "//evil.example", "http://evil.example", "/bad path"]) {
  const invalid = copy(candidate); invalid.variants[0].document.sections[0].blocks = [{ kind: "link", text: "Sample", href }];
  invalid.variants[0].digest = digest(invalid.variants[0].document);
  assert.ok(validateRelease(invalid, evidence, sources).includes("invalid content: ht"));
}
const invalid = copy(candidate); invalid.variants.pop();
assert.ok(validateRelease(invalid, evidence, sources).includes("missing locale"));
const withoutAuthority = copy(candidate); withoutAuthority.publicationAuthorizationId = "self-claimed";
assert.ok(validateRelease(withoutAuthority, evidence, sources).includes("missing publication evidence"));
const escaped = renderToStaticMarkup(createElement(LegalContentBlock, { block: { kind: "paragraph", text: "<script>alert('x')</script> [unsafe](javascript:alert(1))" } }));
assert.ok(escaped.includes("&lt;script&gt;"));
assert.ok(!escaped.includes("<script>"));
assert.ok(!escaped.includes("href="));

// Deployment boundary: raw legal drafts and test samples may never enter public/runtime trees.
const forbidden = ["apps/web/public", "apps/web/src/app", "apps/web/src/components", "apps/web/src/lib/legal"];
for (const location of forbidden) {
  const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]);
  for (const path of walk(join(root, location))) {
    const body = readFileSync(path).toString();
    assert.ok(!body.includes("docs/legal/locales") && !body.includes("docs/legal/drafts") && !body.includes("Imaginary Lantern Rules"), `Draft or fixture import: ${path}`);
  }
}
console.log("Legal Center: empty registry, fictional releases, evidence gates, immutable history, locale integrity and draft isolation passed.");
