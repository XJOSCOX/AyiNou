# C2.1 Independent Project Outcome Validation Foundation

## Scope

Project Work → Outcomes distinguishes self-reported material, native internal review and a request for independent validation. C2.1 adds draft, explanation, submission, tracking, revision history and withdrawal. It does not introduce independent findings, validated quantities, public claims, certification power or an outcomes directory. Source selection is available across the existing project ownership models and all ten departments. Neither project ownership nor association requires a Community Needs case.

## Data model and API

The [migration](../../supabase/migrations/20261125121000_c21_project_outcome_requests.sql) adds three private relations for the closed fixture gate, request and history. [The API](../../apps/api/src/routes/project-outcomes.ts) exposes paginated sources and cases, individual case reads and JSON commands. Existing project tables remain the source of truth. Completed milestones come from Phase 6C milestones and approval events. Observations are immutable and use their exact IDs with revision 1, and metric units become fixed once observations exist. Approved updates are progress reports, with milestone-linked approved updates also available as reported accomplishments. Approved native report entries are final project reports. Superseded approved entries are excluded from new selections. Explicit native reviewer attribution distinguishes internal review from automatic internal acceptance.

Each case captures the exact source kind, ID, revision and canonical result fingerprint. It retains a narrow reported-result snapshot, measurement or null, unit where applicable, recorded dates, classification and evidence references. Zero remains zero and a qualitative result needs no numerical entry. Milestone targets are not treated as observed results. Report and accomplishment summaries are kept as text with no calculated impact.

## Permissions and audit

The API verifies the originating session and onboarding. PostgreSQL rechecks the session, account standing, existing project restrictions, membership and native owner or manager authority. Organization operators must satisfy the existing operating-role requirement. Each organizer can only read or mutate their own case within a currently authorized project. Phase 6C project and scoped moderation controls govern create, edit and submit. Withdrawal remains available for an authorized requester during an execution pause. Founder status grants no exceptional outcome authority. No reviewer permission or admin write path was added.

Each accepted command appends private revision history with actor, action, timestamp, requested transition, request ID and content digest in its transaction. Reads do not change records. A dedicated moderation capability is unnecessary for this disabled phase. Revisit targeted intake restrictions separately before launch if the existing project controls prove insufficient.

## Privacy and lifecycle

The workflow copies only the result fields needed to track the selected revision. Evidence manifests store only authorized source references, revisions and existing image digests. No evidence file, new upload capability, binary data, beneficiary names, identity-document fields or precise-location fields are introduced. Plain-text reference display does not fetch external links. A reference binds the recorded pointer, not the remote site's contents. Existing evidence access and retention continue to govern the originals. Case copies remain restricted to the originating organizer. Records are scoped to project execution and cascade with native execution deletion. The actor link is nullable under account deletion. Revision history survives ordinary withdrawal.

Before live use, privacy and legal owners must approve the case retention window, holds, and deletion, correction and export treatment for case snapshots and history. No live export, erasure or evidence-processing path has been introduced.

## Localization and accessibility

The localized panel uses the existing responsive Project Work tab, theme tokens, form controls and status feedback. Native labels, disclosure controls and a required confirmation checkbox make creation, submission and withdrawal usable with a keyboard. English, Haitian Creole, French and Spanish are checked in the [disposable browser exercise](../../apps/web/e2e/project-outcomes.spec.ts).

## Reliability and recovery

Writes reuse existing account enforcement and project locking, require the expected revision and re-resolve the exact source on submission. The partial unique index and project-scoped transaction exclude duplicate active requests for one result, including milestone-linked updates offered in two views. Retries with the same key and command return the case without writing a duplicate revision. A stale source must be selected afresh after withdrawal of the old draft. Prefer scoped forward repair and keep both gates closed during recovery.

## Validation and CI

The [disposable test](../../apps/web/e2e/project-outcomes.spec.ts) covers database grants, both closed gates, source provenance and measurements, cross-project denial, duplicate detection, idempotent and competing writes, requester operations, browser confirmations and translation. Existing Project Work and Phase 6C browser coverage is run alongside it. Routine testing is local and does not use GitHub Actions.

## Documentation and operations

Target database is hosted Supabase project `hcbxulyfmdmuyccgrujs`. The application is verified locally. The SQL fixture gate is intentionally unseeded, and the API permits only synthetic operation against disposable Supabase outside production. Any live release mechanism requires a separate authorized design. Rollout requires exact-file approval, a fresh single-file dry run, preserved existing data and ACLs, and an empty C2.1 gate and case ledger after migration.

## Remaining blockers

C2.2 needs approved independent reviewer eligibility and assignment scope, appointment and removal procedures, recent MFA and originating workspace requirements, and conflict rules for applicants, owners, project team members, internal reviewers, financial or personal ties, and C1-association participants. Decide evidence release and revocation, reviewer separation, recusal and replacement, decision and appeal standards, retention and public consent separately. C2.1 creates no reviewer grant, queue, certification or public claim.
