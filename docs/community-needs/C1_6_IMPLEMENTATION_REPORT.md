# C1.6 Founder-controlled pilot preparation

## Scope

C1.6 adds an Ouest-only pilot configuration to Founder Platform Settings and connects it to native Community Needs workflows. The pilot ships without policy, cohort, review authority, evidence or activity records. Production routing requires a separately verified matching release.

## Data model and API

Five private tables store the policy, expiring cohort, independent attestation records, production case/quota bindings and administrative history. The Founder dashboard reads aggregate workflow state through the protected service RPC. Its mutations use the existing admin workspace. Native intake, review, publication and association entry points retain their original case and authorization rules and add the production pilot guards. The database returns distinct closed and capacity statuses.

## Permissions and audit

Recognized Founder identity, live account status, recent MFA and the original private admin workspace are required. Changes need an exact policy revision, request UUID, confirmation and written reason. Policy changes and enrollment decisions are recorded with their before/after state in the same transaction. The supported service role only executes the narrow management and release-routing RPCs. Direct table and helper access are excluded. Existing roles, assignments, reviewer conflict checks and project ownership rules still apply.

## Privacy and lifecycle

Founder-only monitoring shows counts and roster state without case narratives, sources or reviewer notes. Cohort entries expire automatically, have no role-grant effect, and can be removed. Intake, review, publication and association stages are separately controlled. Pause hides community-facing pilot projections and halts new processing while preserving authorized private case reads, corrections, withdrawals, existing protections and eligible challenges. [Operational policy](C1_6_ACTIVATION_POLICY.md)

## Localization and accessibility

The implementation uses existing Platform Administration navigation, theme tokens, form controls and status feedback. Founder labels and member closed/capacity states are available in Haitian Creole, French, English and Spanish. The report separates manual connected browser checks from disposable UI exercises.

## Reliability and recovery

Intake uses database time and serializes the seven-day capacity check with the native submission and audit receipt. Replaying an identical authorized policy decision leaves one history event. Pause and stage-changing decisions serialize against stage writes. Activation and resumption are separate decisions and bind the exact current operational evidence. A restoration procedure must account for access revocations, consent and externally controlled release routing before allowing new processing.

## Validation and CI

Validation covers exact migration startup on disposable Supabase, current API and UI contracts, separate allow/deny paths, concurrency, closed hosted state and local application compatibility. The approved hosted migration was verified with 136 applied migrations, zero pending, all 51 preservation checks matched and all pilot/fixture gates closed. Hosted application release remains separate. [Security, tests and rollout](C1_6_SECURITY_TESTS.md)

## Documentation and operations

[Activation policy](C1_6_ACTIVATION_POLICY.md) · [Pilot operations](C1_6_PILOT_OPERATIONS.md) · [Launch readiness](C1_6_LAUNCH_READINESS.md)

## Remaining blockers

Live intake still requires credible external sign-offs for privacy, support and escalation, database recovery, private Storage recovery, matching releases, and closure of critical or high-severity launch blockers. A staffed independent roster, explicit cohort, approved stages and duration, and a separate Founder activation decision are required. No supplied reviewer or participant is automatically appointed or enrolled.
