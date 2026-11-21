# O7 audit and data lifecycle reconciliation

| Scope | State and evidence linkage | Verified result |
| --- | --- | --- |
| O2 intent and private draft | Intent, subject-bound UUID receipt, command digest or allowlisted intent action, next version and creation time. Prior revision is carried by the command. | Competing save and cancellation record one receipt. Changed replay fails and revoked sessions cannot recover an old receipt. |
| O3 Founder | Case revision, authority and proof references, scoped event and safe request replay. Discovery is separate from the public badge projection. | Synthetic grant, hold, release and revocation share the existing case history. Proof and independent review remain distinct. |
| O4 organization and claim | Organization and owner grant, intent receipt and five creation events sharing the request UUID, actor, organization and revision. Claim application plus declaration and review events. | The successful browser command creates one receipt and five linked events even if the initial response is lost. Identity and duplicate-handle failures create no success event. |
| O5 corrections, holds and governance | Correction consent and assignment with scoped ledger outcome. Versioned proposal, hold and release receipts. | Permission failures create no success event. Protected dependencies block actual draft mutation. Existing data remains intact after denial. |
| O6 partner program | Immutable version, operator provenance, enrollment/feedback and atomically matching event. Consent context carries exact terms digest and scope privately. | Competing actions produce one decision. Withdrawal, expiry or revocation blocks feedback. No directory or public consent projection. |
| Institution invitation | Existing state, actor, organization and invitation reference in institutional history. | Expired acceptance leaves pending invite history and creates no member grant or success event. Successful acceptance emits one linked event. Legacy invitation events do not include a UUID command receipt or a prior revision. |
| Auth recovery | Provider Auth owns password-change and MFA events. The app uses verified provider claims and the live-session RPC. | Local status screens and sanitized diagnostics are separate from the provider’s authoritative audit. No password, OTP, recovery token or URL is stored in the application ledger. |

## Lifecycle classification

| Class | Scope and purpose | Consent, export and disposition |
| --- | --- | --- |
| Intent and draft | Subject-owned draft and private organization input. Assistants receive structural categories. | Optional signup path and explicit correction consent. Private draft and receipt history need export-field and disposition review. |
| Registration and authority | Current owner/admin private projection, members of the appropriate institutional review workflow, bound authority declaration. | Declaration is a private claim. Assess shared ownership and audit obligations before export or deletion. |
| Founder proof and identity receipts | Assigned proof and review authorities, sanitized scoped case projection. | Explicit consent and separate publication consent. Proof evidence requires its own export and protected evidence-custody ruling. |
| Governance, correction and holds | Current scoped member or operator projections. Separate restricted reason, decision and hold records. | Request or explicit target acceptance where applicable. Preserve third-party and hold data until approved disposition is available. |
| Partner offers and participation | Authorized owner, organization administrator, or scoped operator. Narrow audit projection. | Separate synthetic consent and optional test visibility; no legal effect. Future real export and deletion require an approved program policy. |
| Private feedback | Scoped organization and eligible operators. Bounded text, internal reporter attribution, no uploads. | Future disclosure and de-identification need review. The app provides no real sensitive intake. |
| Audit | Domain-authorized readers and internal receipts. Restrict raw operator reasons and evidence. | Do not infer access or deletion from a foreign key, elapsed time or opt-out. Preserve records under applicable holds and reconcile restoration independently. |

Every class above has an unapproved final retention schedule. The current L3 controls remain synthetic. Holds and shared references require counsel and approved custodian scope before actual export, erasure, provider backup reconciliation or re-release. HTTP failure diagnostics carry safe status and request references. They are not successful business events. No historical lineage was fabricated or backfilled. [S1 audit event policy](../standards/AUDIT_EVENT_POLICY.md) · [L3 operational readiness](../privacy/OPERATIONAL_PRIVACY_READINESS.md)
