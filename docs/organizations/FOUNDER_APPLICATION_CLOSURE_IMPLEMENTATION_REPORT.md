# Founder Verified application closure

## Scope

A successful Founder Verified grant closes the same member’s pending regular identity application. Closed applications and resolved Founder cases appear in history. Notable-person and institutional applications, previously decided applications, and the rules for earning reviewed identity status retain their separate lifecycle.

## Data model and API

Migration [20261121080000](../../supabase/migrations/20261121080000_founder_application_closure.sql) adds a closed status, decision timestamp and private grant-event reference. The member verification API reports the closed status and timestamp. Authorized reviewers can query the existing review endpoint with the closed filter.

## Permissions and audit

The private trigger writes only after a grant event with matching grant provenance. A grant and its closure commit together. The original regular review and evidence records stay attached. Reading the closed queue requires MFA, reviewer assignment and conflict checks. An existing work assignment governs access to evidence and prior review reasons. History views are read-only.

## Privacy and lifecycle

The member sees the application’s closure and dates. Private proof, evidence and audit references are excluded from public responses. Closure adds a private reference between existing records. It does not add the reference to any export allowlist or change the existing retention, deletion or hold policies. A closed record is no longer a pending-application lifecycle hold.

## Localization and accessibility

The status, reason and history labels are available in Haitian Creole, French, English and Spanish. Native disclosure controls support keyboard access, and layout uses the existing theme and responsive components.

## Reliability and recovery

The grant and closure use one database transaction. Competing regular decisions recheck the application's status on the locked row. Grant replays reuse the original receipt. The migration reconciles still-pending applications submitted before an earlier grant whose case remains granted. Subsequent Founder revocation preserves review history. Rolling back application code should retain the closed records and their audit references.

## Validation and CI

The [disposable Founder identity browser suite](../../apps/web/e2e/founder-identity.spec.ts) covers authorization, closure state, retained evidence, grant replay, stale regular approval, revocation, and history rendering. All three Founder browser tests passed on disposable Supabase. Typecheck, lint, unit tests, translation parity, the standards check, both production builds, and the D1 and D2 rehearsals passed locally. GitHub Actions validates the matching application release after push.

## Documentation and operations

The [audit inventory](../standards/AUDIT_COVERAGE_MATRIX.md) records the durable closure. On November 21, 2026, the owner-authorized dry run for hosted development project `hcbxulyfmdmuyccgrujs` listed a single pending migration. Applying it brought the project to 68 migrations with an empty follow-up dry run. Read-only postflight confirmed RLS, the enabled trigger, the validated closure constraints, service-only queue execution, and no direct trigger execution by application roles. The one pending identity application and one evidence reference were preserved. No recorded Founder grants qualified for reconciliation.

## Remaining blockers

Founder badge issuance remains disabled on hosted development. The grant-to-closure path was exercised on disposable Supabase.
