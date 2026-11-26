# C4 final implementation audit

## Scope

C4.6 adds stage-level Founder controls for drafts, review/publication, external applications, expressions of interest, discovery, personalization, mentorship intake, mentorship matching/discovery, requests, and coordination. The release also requires an assigned independent reviewer to accept the exact assignment before submitting a decision. Earlier features remain available for authorized preparation while the operational gates are closed.

## Data model and API

The additive migration introduces three private relations for fixture authorization, stage state, and append-only activation history. One service-only RPC supports the existing Founder workspace through GET and PATCH `/api/v1/admin/opportunity-settings/activation`. Reviewer acceptance uses existing C4.2 receipts keyed by reviewer, opportunity revision, grant, deadline and unique assignment receipt. The existing member and reviewer route signatures stay intact.

## Permissions and audit

Fastify verifies session and recent MFA and checks Founder access from the database. PostgreSQL rechecks standing, recognized Founder provenance, the original MFA workspace, the activation revision and stage configuration digest. The migration preserves C4.2 reviewer independence, scoped grants and challenge handling. Activation history includes a minimal affected-stage list. A review assignment acceptance does not substitute for the publication checklist or an eligible reviewer decision.

## Privacy and lifecycle

The new stage history holds administrative metadata and a recorded reason. The disposable lifecycle preview adds a coarse blocker for shared C4 records and keeps partner identities and statements outside the preview. See the [privacy review](C4_FINAL_PRIVACY_REVIEW.md).

## Localization and accessibility

The Founder panel loads only when expanded. Status and first blocking reason are visible on each card. Keyboard-accessible disclosures show per-stage readiness, prerequisites and history. Page labels and notices support Haitian Creole, French, English and Spanish. Existing MemberShell and theme controls remain in use.

## Reliability and recovery

Activation uses optimistic versioning, exact digest checks and transactional replay receipts. The opportunity publication cutoff prevents earlier disclosures from returning after resumption and avoids rewriting historical publication rows. The local recovery procedure restores into a separate disposable database and quarantines the release before inspection.

## Validation and CI

The test record distinguishes connected browser reads, disposable state changes, regression coverage, and workload limits. Routine validation is local. [End-to-end evidence](C4_FINAL_END_TO_END_TESTS.md)

## Documentation and operations

Activation authority and pause dependencies are described in the [activation policy](C4_FINAL_ACTIVATION_POLICY.md). Hosted rollout requires the exact checksum, separate approval, read-only preservation checks and closed gates. Next.js and Fastify remain local.

## Remaining blockers

Real applicant processing, independent staffing, safeguarding, privacy operations and provider-backed recovery require separate approval. Operational requirements are recorded in the [launch dependencies](C4_FINAL_LAUNCH_DEPENDENCIES.md).
