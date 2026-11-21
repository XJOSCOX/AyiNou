import { createHash } from "node:crypto";
import { locales, type Locale } from "@ayinou/shared";
import releases from "./published-releases.json";
import evidence from "./publication-evidence.json";
import { isPolicyId, type PolicyId } from "./paths";
export { isPolicyId } from "./paths";

export type LegalBlock = { kind: "paragraph"; text: string } | { kind: "list"; items: string[] } | { kind: "link"; text: string; href: string };
export type LegalDocument = { title: string; sections: { id: string; title: string; blocks: LegalBlock[] }[] };
export type LegalVariant = { locale: Locale; digest: string; translationDigest: string; reviewId: string; jurisdictionReviewId: string; document: LegalDocument };
export type LegalRelease = {
  policyId: PolicyId; version: string; sourceVersion: string; sourceDigest: string;
  operatorId: string; jurisdiction: string; effectiveDate: string; publishedAt: string;
  legalReviewId: string; productReviewId: string; ownerApprovalId: string;
  publicationAuthorizationId: string; operationalReviewId: string;
  status: "APPROVED"; supersedes?: string; variants: LegalVariant[];
};
export type Evidence = { id: string; kind: "source" | "operator" | "legal" | "linguistic" | "jurisdiction" | "product" | "owner" | "publication" | "operations"; policyId: PolicyId; version: string; locale?: Locale; digest?: string; actor: string; approved: true };
export type TrustedSource = { policyId: PolicyId; version: string; digest: string };

export function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const timestamp = (value: string) => !Number.isNaN(Date.parse(value)) && /T/.test(value);
const unresolved = /\b(TODO|TBD|PLACEHOLDER|DRAFT|COMING SOON|FUTURE FEATURE)\b|\[\[|\{\{/i;
const safeLink = (href: string) => href.startsWith("/") && !href.startsWith("//") && !/[\\\s<>]/.test(href) || /^https:\/\/[a-z0-9.-]+(?:\/[^\s<>]*)?$/i.test(href);

function validDocument(document: LegalDocument): boolean {
  if (!document.title?.trim() || unresolved.test(document.title) || !document.sections?.length) return false;
  const ids = new Set<string>();
  for (const section of document.sections) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.id) || ids.has(section.id) || !section.title?.trim() || unresolved.test(section.title) || !section.blocks?.length) return false;
    ids.add(section.id);
    for (const block of section.blocks) {
      if (block.kind === "paragraph" && (!block.text.trim() || unresolved.test(block.text))) return false;
      if (block.kind === "list" && (!block.items.length || block.items.some((item) => !item.trim() || unresolved.test(item)))) return false;
      if (block.kind === "link" && (!block.text.trim() || unresolved.test(block.text) || !safeLink(block.href))) return false;
      if (!["paragraph", "list", "link"].includes(block.kind)) return false;
    }
  }
  return true;
}

export function validateRelease(release: LegalRelease, trusted: readonly Evidence[], sources: readonly TrustedSource[]): string[] {
  const errors: string[] = [];
  if (!isPolicyId(release.policyId) || !/^\d+\.\d+\.\d+$/.test(release.version)) errors.push("invalid identity");
  if (release.status !== "APPROVED") errors.push("draft status");
  if (!sources.some((source) => source.policyId === release.policyId && source.version === release.sourceVersion && source.digest === release.sourceDigest)) errors.push("stale source");
  if (!release.jurisdiction?.trim() || unresolved.test(release.jurisdiction)) errors.push("unknown jurisdiction");
  if (!date(release.effectiveDate)) errors.push("unapproved effective date");
  if (!timestamp(release.publishedAt)) errors.push("missing publication timestamp");
  const requireEvidence = (id: string, kind: Evidence["kind"], locale?: Locale, requiredDigest?: string) => {
    if (!trusted.some((record) => record.id === id && record.kind === kind && record.policyId === release.policyId && record.version === release.version && record.locale === locale && (requiredDigest === undefined || record.digest === requiredDigest) && record.approved === true && !!record.actor)) errors.push(`missing ${kind} evidence${locale ? `: ${locale}` : ""}`);
  };
  requireEvidence(release.operatorId, "operator");
  requireEvidence(release.legalReviewId, "legal");
  requireEvidence(release.productReviewId, "product");
  requireEvidence(release.ownerApprovalId, "owner");
  requireEvidence(release.publicationAuthorizationId, "publication");
  requireEvidence(release.operationalReviewId, "operations");
  if (new Set(release.variants?.map((variant) => variant.locale)).size !== locales.length || release.variants?.length !== locales.length) errors.push("missing locale");
  for (const locale of locales) {
    const variant = release.variants?.find((item) => item.locale === locale);
    if (!variant) continue;
    if (!validDocument(variant.document)) errors.push(`invalid content: ${locale}`);
    if (variant.digest !== digest(variant.document)) errors.push(`invalid digest: ${locale}`);
    requireEvidence(variant.reviewId, "linguistic", locale, variant.translationDigest);
    requireEvidence(variant.jurisdictionReviewId, "jurisdiction", locale);
  }
  return errors;
}

export function buildRegistry(candidates: readonly LegalRelease[], trusted: readonly Evidence[], sources: readonly TrustedSource[]) {
  const versions = new Map<string, LegalRelease>();
  for (const release of candidates) {
    const errors = validateRelease(release, trusted, sources);
    if (errors.length) throw new Error(`Invalid legal release: ${errors.join(", ")}`);
    const key = `${release.policyId}:${release.version}`;
    if (versions.has(key)) throw new Error("Historical release overwrite");
    if (release.supersedes && !versions.has(`${release.policyId}:${release.supersedes}`)) throw new Error("Unknown superseded release");
    if (!release.supersedes && [...versions.values()].some((item) => item.policyId === release.policyId)) throw new Error("Missing supersession metadata");
    versions.set(key, structuredClone(release));
  }
  const list = (id: PolicyId) => [...versions.values()].filter((item) => item.policyId === id).reverse().map((item) => structuredClone(item));
  return Object.freeze({
    history: list,
    current: (id: PolicyId) => list(id)[0],
    version: (id: PolicyId, version: string) => { const item = versions.get(`${id}:${version}`); return item && structuredClone(item); },
  });
}

// These committed registries start empty. Repository drafts are never imported by runtime code.
export const publishedRegistry = buildRegistry(releases as LegalRelease[], evidence as Evidence[], []);
