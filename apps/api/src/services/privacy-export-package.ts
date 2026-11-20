import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { exportCategories, privacyRequestKinds } from "@ayinou/shared";
import { z } from "zod";

const policy = "synthetic-v1";
const maximumRecords = 100;
const maximumBytes = 262_144;
const time = z.iso.datetime({ offset: true });
const locale = z.enum(["en", "ht", "fr", "es"]);
const country = z.string().regex(/^[A-Z]{2}$/).nullable();
const department = z.string().regex(/^[a-zA-Z0-9-]{1,8}$/).nullable();
const projection = z.strictObject({
  profile: z.array(z.strictObject({ locale, publicProfile: z.boolean() })).max(1),
  residence: z.array(z.strictObject({ countryCode: country, departmentCode: department, diasporaDepartmentCode: department })).max(1),
  preferences: z.array(z.strictObject({ discoverable: z.boolean(), showMembershipCategory: z.boolean() })).max(1),
  interests: z.array(z.string().regex(/^[a-z]{1,32}$/)).max(101),
  posts: z.array(z.strictObject({ language: locale, visibility: z.enum(["public", "members_only", "private"]),
    status: z.enum(["draft", "published"]), createdAt: time })).max(101),
  comments: z.array(z.strictObject({ language: locale, createdAt: time })).max(101),
  affiliations: z.array(z.strictObject({ type: z.enum(["member", "volunteer", "staff", "supporter"]), directoryOptIn: z.boolean() })).max(101),
  privacyRequests: z.array(z.strictObject({ kind: z.enum(privacyRequestKinds), state: z.enum(["received", "withdrawn"]), createdAt: time })).max(101),
  pollParticipation: z.array(z.strictObject({ hasParticipated: z.boolean() })).length(1),
});

const omissions = {
  pending_review: ["names and free-text profile fields", "member and referral codes", "auth account metadata", "post and comment text",
    "following and community membership", "notification metadata", "recommendation feedback", "poll-specific participation receipts"],
  additional_proof: ["verification and appeal status", "private case records", "private organization data", "blocked and muted accounts"],
  provider_dependent: ["avatars, attachments and media bytes", "provider records", "device-local state"],
  excluded: ["passwords, tokens, MFA and security records", "other participants' identities or content", "raw evidence and reviewer notes",
    "volunteer applications and hidden project evidence", "project tasks, reports and ownership records", "individual ballot selections and electorates"],
} as const;

export function makeExportPackage(raw: unknown, generatedAt: string) {
  const source = projection.parse(raw);
  const data = Object.fromEntries(exportCategories.map((category) => [category, source[category].slice(0, maximumRecords)]));
  const categories = exportCategories.map((category) => ({
    category, count: data[category].length, truncated: source[category].length > maximumRecords,
    sha256: createHash("sha256").update(JSON.stringify(data[category])).digest("hex"),
  }));
  const manifest = { schemaVersion: 1, projectionVersion: 1, policy, generatedAt: time.parse(generatedAt),
    scope: "limited_synthetic", categories, omissions, checksumEncoding: "UTF-8 compact JSON per data category" };
  const manifestText = [
    "Ayinou synthetic personal data export",
    "Limited category and field coverage. This package does not establish production portability.",
    "Generated at " + manifest.generatedAt, "Schema 1 • Policy synthetic-v1", "",
    ...categories.map(({ category, count, truncated }) => category + " — " + count + (truncated ? " (record limit reached)" : "")),
    "", ...Object.entries(omissions).map(([reason, values]) => reason + " — " + values.join(", ")),
  ].join("\n");
  const bytes = Buffer.from(JSON.stringify({ manifest, manifestText, data }), "utf8");
  if (bytes.length > maximumBytes) throw new Error("Export package exceeds size limit");
  return bytes;
}

export interface ExportBinding { subject: string; caseId: string; artifact: string; }

function material(master: Buffer, binding: ExportBinding, version: number) {
  if (master.length !== 32 || version !== 1) throw new Error("Export key unavailable");
  const aad = Buffer.from(JSON.stringify(["ayinou-export", policy, version, binding.subject, binding.caseId, binding.artifact]));
  const key = Buffer.from(hkdfSync("sha256", master, Buffer.from(binding.artifact), aad, 32));
  return { aad, key };
}

export function sealExport(master: Buffer, binding: ExportBinding, bytes: Buffer) {
  if (bytes.length > maximumBytes) throw new Error("Export package exceeds size limit");
  const { key, aad } = material(master, binding, 1);
  try {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("hex");
  } finally { key.fill(0); }
}

export function unsealExport(master: Buffer, binding: ExportBinding, version: number, envelope: string) {
  if (envelope.length < 60 || envelope.length > 2 * (maximumBytes + 28) || !/^(?:[0-9a-f]{2})+$/.test(envelope)) {
    throw new Error("Invalid export envelope");
  }
  const bytes = Buffer.from(envelope, "hex");
  const { key, aad } = material(master, binding, version);
  let first: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(aad);
    decipher.setAuthTag(bytes.subarray(12, 28));
    first = decipher.update(bytes.subarray(28));
    return Buffer.concat([first, decipher.final()]);
  } finally { key.fill(0); first?.fill(0); }
}
