# M3 moderation integration and security audit

## Scope

The baseline was main at `8b3df23dbdc9b05695773548a3f3859bd40bc173`. The review traced the M1 inventory and M2.1-M2.5 service routes, shared contracts, private database writers, member notices, native ledgers and platform audit projections. It also traced the migrations after M2.4 that changed Founder Verified eligibility, proposal review and publication, event associations, poll results and ambassador invitations.

## Data model and API

One high-severity finding covered two related project transitions. The current implementation had a transactional project-creation guard at initial submission. The newer proposal revision and directory changes use separate state transitions. The M3 correction uses the existing project event transaction and capability checker. It adds zero API routes, scopes, permissions or stored policy fields.

## Permissions and audit

The project correction preserves normal owner, organization, community, verification, review and publication checks. A denied action rolls back its state change, audit entry and notification. Authorized review and removal from the directory continue through their existing writers. The audit includes direct grant checks and distinguishes an observed database denial from catalog or code review.

## Privacy and lifecycle

Evidence and complete appeal statements stay in the authorized source. Reports use code references and synthetic records. Hosted checks use aggregate counts, grant predicates and fingerprints, with no hosted enforcement or appeal fixtures. Existing case and member data are outside the migration's write scope.

## Localization and accessibility

The correction uses the existing localized feature-restriction error response. The audit covers the four existing locales, the Founder settings and the member appeal and notices presentation.

## Reliability and recovery

The project guard runs in the same transaction as the existing change and uses the same live per-member restriction check. It adds no data backfill. If deployment needs remediation, use a forward migration scoped to the trigger and preserve project events and existing restrictions.

## Validation and CI

Validation runs locally using the repository toolchain and disposable Supabase. [Detailed test results](M3_TEST_RESULTS.md)

## Documentation and operations

- [Authorization matrix](M3_AUTHORIZATION_MATRIX.md)
- [Enforcement coverage for all 25 capabilities](M3_ENFORCEMENT_COVERAGE.md)
- [Appeals and conflict review](M3_APPEALS_AND_CONFLICT_REVIEW.md)
- [Security findings](M3_SECURITY_FINDINGS.md)
- [Remaining risks](M3_REMAINING_RISKS.md)

## Remaining blockers

Hosted verification is recorded in the test results. The audit is scoped to the application and database release identified above. Independent product policy and release decisions remain in the [risk register](M3_REMAINING_RISKS.md).
