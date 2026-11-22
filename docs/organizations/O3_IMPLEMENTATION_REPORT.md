# O3 Founder Verified infrastructure

Baseline `c9ae7b6979c569a3ed0c3e75cc46a9bb913ad76c` on `main`.

## Scope

Adds isolated provenance for Founder Verified, a private case workspace, consent, scoped authority and evidence receipt records, a live public profile projection, and a disposable grant workflow. Production issuance is locked closed by SQL. The existing first-account bootstrap, independent personal claims, organizations and representative review keep their existing records and checks.

## Data model and API

`20261121030000_o3_founder_identity.sql` creates five private resources: authorities, cases, proof receipts, grants and a domain event ledger. Cases have a single current version and at most one open case per subject. A grant references the exact policy, case, subject, issuer and proof. The case is the live source for consent, hold, conflict and revocation. A held case cannot display the badge. Hold release requires new proof and current consent. A pre-issuance hold releases back to proof pending. Member withdrawal closes the case and suppresses the badge.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/v1/me/founder-identity` | Reads the subject's latest 30 cases, safe decision codes, consent and correction status. |
| `POST /api/v1/me/founder-identity/:id/actions` | Records consent, visibility, withdrawal or a pending correction using case version, policy version and UUID request ID. |
| `GET /api/v1/admin/founder-identity` | Reads the authority's latest 30 assigned cases and up to 25 decision events per case. |
| `POST /api/v1/admin/founder-identity` | Opens a case for the exact member username after a member request. |
| `POST /api/v1/admin/founder-identity/:id/actions` | Records deny, conflict, hold or revoke. Grant and release also require current policy, consent, conflict clearance and proof. |
| `GET /api/v1/profiles/:username` | Adds optional `founderVerified: true` after resolving the existing visible profile and checking current designation. No case, issuer, method or proof data is exposed. |

The public profile prefers independently reviewed Identity Verified if both are active. Individuals retain both provenance records. Search and discovery responses do not include a founder flag or depend on one for ranking/filtering. Profile reads use no-store and honor the existing visibility and blocks. An open tab may show its last rendered profile until refreshed.

## Permissions and audit

All tables have RLS enabled, with no application-role grants. Only the server service role can run the three public-named RPCs. The private authority has an approval reference and effective window. It is independent of platform role assignment and applies only to cases opened under that grant. The actor must remain an eligible platform administrator with a live AAL2 session and TOTP proof within 15 minutes. The server gets that timestamp from signed session claims and SQL rechecks active session, factor, role and authority. No application endpoint can add authority or ingest proof. A case's issuer differs from its subject. The issuer must explicitly declare no conflict to grant or release. A recorded conflict blocks that case from issuance or release. Material financial interests, close family relationships, disputes and reviewing one's own decision require recusal. The governance process for neutral assignment remains pending.

The ledger records authority assignment and revocation, opening, consent, visibility, withdrawal, receipt, grant, denial, conflict, hold, release, revocation and correction. Offline provisioning actions use a system event with the authorized authority and approval reference. The command receipt and state transition commit together. API failures use existing sanitized response envelopes and request references. Rejected authorization, validation and stale commands leave no success event; no extra independent security telemetry ledger was added.

## Privacy and lifecycle

Member approval is authenticated, case- and policy-bound, revocable and separate from public display. Public disclosure defaults to off. Production accepts no proof method. Disposable fixtures use a restricted test receipt for synthetic identity and account control, with a short expiry, exact case revision, and one-time consumption. No raw evidence, secrets, government ID, personal relationship details, or member-supplied proof completion are accepted. A future approved ceremony can link a separately confirmed identity and a one-time account-bound proof to the specific case, purpose, policy and current consent. Only its minimal, time-bound receipt should enter this workflow. Current statuses and structured decisions are notices in Verification; inbox/email/SMS delivery is outside this phase.

Restrictive foreign keys protect event lineage while a governed deletion or de-identification policy is pending. No production authority or case data should be provisioned before the retention, export, legal hold and deletion process is approved. Appeals stay pending, visible to the subject, with no self-adjudication or response-time promise. An independently assigned appeal workflow remains an operational blocker.

## Localization and accessibility

The Verification page hosts the member case panel. The Administration workspace has a Founder identity cases tab whose requests require founder scope, even for platform administrators. Both use the existing layouts, themes, controls and accessible status feedback. Public profiles show a separate labeled designation and written explanation. All new text is in Haitian Creole, French, English and Spanish and is covered by the dictionary parity check.

## Reliability and recovery

Case locks serialize member and reviewer writes. Per-actor command keys are bound to the full request and rechecked against current authorization before replay. An exact retry returns its committed audit receipt. A changed key payload or stale case revision is rejected. Committed command volume is capped per actor. Moving a case or changing consent invalidates stale proof revisions; live exposure rechecks case state and consent. Revoking authority removes its operational access. A subsequent recovery plan must formally scope transfer or disposition of affected cases. No automatic reassignment is available.

## Validation and CI

Coverage includes service and actor authorization, MFA, case isolation, proof spoofing and expiry, consent, policy locking, stale versions, duplicate/conflicting keys, grant races with hold/revoke/withdraw, audit atomicity, cache-free profile reads, and preservation of reviewed project and voting eligibility. The disposable Chromium runner controls synthetic data and is the only test path that replaces the closed policy function. No hosted synthetic records are created.

Local validation passed typecheck, lint, shared-contract compatibility, four-locale parity, 48 API tests, seven client tests, both production builds, S1 checks, frozen L5 validation, Legal Center checks and the full 50-test Chromium run in the active checkout. The database runner removed the disposable stack. The hosted read-only catalog check confirmed the existing session, administrator and independently reviewed identity functions and the absence of both pending migrations. A hosted rollback-write check would require separate authorization and was not performed.

## Documentation and operations

Hosted project `hcbxulyfmdmuyccgrujs` still requires `20261121020000_o2_organization_intents.sql`, followed by `20261121030000_o3_founder_identity.sql`. O3 uses existing live-session and review functions, not O2 tables. The ordered CLI deploy plan requires separately approved hosted writes. After approval, verify tables/execute grants, policy false, empty authority/case tables and unchanged legal availability. If the client is deployed first, existing public profiles omit the founder field until the SQL is present. To contain a later release, close publication and issuance together, revoke affected authority if appropriate and preserve case/audit history via a forward correction.

## Addendum for Founder reviewer eligibility and application supersession

Founder scope and ordinary reviewer scope remain distinct. Member consent to supersession is optional, versioned and binds the exact application. The grant transaction preserves older review decisions and applies closure only to an eligible pending application. Hosted issuance remains disabled. [Policy update](FOUNDER_VERIFICATION_POLICY_UPDATE.md) · [Implementation evidence](FOUNDER_REVIEWER_AND_SUPERSESSION_REPORT.md)

## Remaining blockers

Operational identity/account-control ceremony, approved founder delegation and succession, conflict escalation, proof and audit retention/export/deletion, independent appeal assignment and safe contact delivery still require approval and validation. No environment setting can turn this implementation on. O4 would need its own narrow create/claim eligibility checks, with policy, live account, consent, grant and hold rechecked in the command transaction. No organization setup, project eligibility, voting rights or platform permissions were changed.

## Operational proof integration

The subsequent Founder Verified integration introduces a live member authenticator receipt and separately records a structured Founder attestation. It preserves consent, eligibility, live workspace checks and native audit. Both gates still default to closed and require separate operational authorization. [Completion report](../identity/FOUNDER_VERIFIED_COMPLETION_REPORT.md)
