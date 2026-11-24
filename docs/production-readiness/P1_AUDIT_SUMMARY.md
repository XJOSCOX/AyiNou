# P1 production readiness, privacy and security verification

## Scope

Audited main at `119517cfe5e91f6da06c9dbe441a6b5381349887` and the active M1-M3 implementation. The review traced Next.js UI, Fastify routes, PostgreSQL roles and RPCs, native event writers, evidence and Storage boundaries, A1A, and the approved hosted database. It reused the M3 evidence where the writer was unchanged and added targeted checks for low-count polls, asynchronous media completion and historical policy version projection.

**Readiness classification: Blocked by operational requirements.** A separately owned poll privacy decision is required before public launch. The hosted web and API release remains outside P1.

## Data model and API

One additive migration corrects the existing media completion function and the account decision branch of the A1A projection. It adds no API, authorization role, audit fields or data migration. Poll behavior, electorate, nominee rules and secret-ballot storage remain under existing policy.

## Permissions and audit

The media completion function keeps its service role boundary and checks live account access and the established lease deadline before accepting bytes already staged. Cleanup remains available. The account projection uses existing decision identifiers and persisted, proven revisions. Existing Founder, Administrator, Moderator, reviewer, session and workspace protections are exercised by the baseline suites.

## Privacy and lifecycle

Exact low-count aggregates can reveal participation and choices by inference even when individual records are private. Full evidence and audit projections remain distinct. Hosted checks were read-only and excluded private content. Retention, restores and production evidence-handling decisions remain separate owner responsibilities.

## Localization and accessibility

No UI text or authorization control changed. The English, Haitian Creole, French and Spanish inventories and the existing browser language workflows are covered by the local validation.

## Reliability and recovery

The migration reuses the moderation transaction lock and leaves prior rows, leases, storage visibility and cleanup intact. The accompanying hosted dry run, read-only preservation evidence and forward recovery steps are recorded separately. The provider backup catalog still lists no recovery point.

## Validation and CI

The baseline, targeted tests and disposable recovery exercise are recorded in [test results](P1_TEST_RESULTS.md). Local validation was used for P1.

## Documentation and operations

- [Findings](P1_SECURITY_FINDINGS.md)
- [Poll privacy and policy effects](P1_POLL_PRIVACY_REVIEW.md)
- [All 25 capabilities](P1_ENFORCEMENT_COVERAGE.md)
- [Evidence, retention and recovery](P1_EVIDENCE_RETENTION_RECOVERY.md)
- [Historical audit exceptions](P1_HISTORICAL_AUDIT_REVIEW.md)
- [Deployment readiness](P1_DEPLOYMENT_READINESS.md)
- [Owner decisions](P1_OWNER_DECISIONS.md)

## Remaining blockers

Verified hosted database and Storage recovery, independent response staffing, Auth and email readiness, and an approved privacy and retention operating model are public launch gates. The P1 migration has its own narrow approval and does not clear these gates.
