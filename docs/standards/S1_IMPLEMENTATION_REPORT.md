# S1 engineering standards implementation

## Scope

Baseline `e57d16740a56f2426ee83cc3300d724a7366dc53` on `main`. The new root instructions apply across the repository together with the existing [Next.js instructions](../../apps/web/AGENTS.md). S1 adds engineering, audit and review practices and a lightweight CI check. Unified Audit Center and Founder Verified are planned.

## Data model and API

S1 adds no application schemas or APIs. The machine-readable [review register](feature-reviews.json) records report paths, route review declarations and migration review records. The route gate compares the existing Fastify inventory with the fixed baseline. It delegates live method/path/body-limit/hook coverage to the existing Fastify contract test. A changed handler with the same route contract and RPCs outside Fastify require manual review.

## Permissions and audit

The [coverage matrix](AUDIT_COVERAGE_MATRIX.md) separates transactional event trails, mutable case or resource state, diagnostics and evidence. Platform administration, scoped roles, project operations, polls and legal controls already have durable trails. Profile edits, feeds, preferences and several community operations retain state or scoped cases without a comprehensive event history. S1 records these gaps while preserving the source ledgers and their permissions.

## Privacy and lifecycle

The tooling reads checked-in docs, route inventory, Git history and migration paths. It reads no credentials, hosted rows or private evidence. Existing privacy and legal runtime gates remain in effect. Future standards require policy and owner approval before adopting telemetry retention or adding audit projections.

## Localization and accessibility

S1 has no user-facing layout or string changes. It makes all four locales, responsive checks and accessible input/feedback mandatory review topics for future product changes. Existing translation parity checks continue to validate all namespaces.

## Reliability and recovery

An invalid or incomplete review fails with its missing route, migration, report section or link. Existing feature tests and migrations retain their normal execution. A study of read projections, keyset pagination, independent evidence grants and restricted export appears in the [Audit Center design](UNIFIED_AUDIT_CENTER_DESIGN.md). Rollback of S1 tooling is a focused Git revert. It requires no database operation.

## Validation and CI

The existing quality job runs the standards validator and its tests, without credentials or hosted writes. Existing typecheck, lint, shared contracts, translations, application tests, production builds, disposable Chromium, dependency audit and legal source/publication checks stay in place. Local validation passed for standards links and the 30-row inventory, four standards tests, typecheck, lint, shared contracts, four-language parity, 47 API tests, seven client tests, both production builds and 47 Chromium tests in disposable Supabase. Six L5 validator regressions, L5 source validation, the Legal Center gate and the dependency audit also passed. The browser suite ran with the existing local site edits in place. GitHub builds the committed tree.

## Documentation and operations

S1 standards and the roadmap are committed on main. Product deployment is separate. The read-only hosted dry run against `hcbxulyfmdmuyccgrujs` listed exactly one pending migration, `20261121020000_o2_organization_intents.sql`. O2 is validated locally and committed, with hosted intent persistence pending. The CLI requires explicit production consent.

For the later authorized O2 release:

1. Confirm the project and exact baseline, compare local/remote migration history, and run a fresh dry run. Stop if anything besides the expected O2 migration appears.
2. Review the additive schema, Auth trigger compatibility, session recheck, RLS and grants against the reviewed SQL. Confirm disposable email callbacks, denied access, receipts and competing writes still pass.
3. Record explicit owner consent, the migration version, compatible app rollout and a recovery owner. Confirm backup/restore readiness for a production change. Apply only the reviewed migration with the established CLI approval mechanism.
4. Verify migration history and catalog grants, policies and trigger with read-only postflight queries. Avoid hosted synthetic signup or mutating probes. Monitor safe error rates and Auth callback behavior.
5. If rollback is needed, stop exposing the intent path, keep existing account access and data, and use a reviewed forward correction or approved recovery. Do not reset the hosted project or erase intent receipts.

## Remaining blockers

O2 production approval remains outstanding. Audit reconciliation, retention policy approvals, assigned recovery staffing, and scoped event access/export need later decisions. Prioritize authorization evidence and event reconciliation for O3–O5, then onboard a few restricted read projections before expanding audit search. [Maintenance roles and cadence](CONTINUOUS_MAINTENANCE.md).
