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

The [disposable test](../../apps/web/e2e/project-outcomes.spec.ts) covers database grants, both closed gates, source provenance and measurements, cross-project denial, duplicate detection, idempotent and competing writes, requester operations, browser confirmations and translation. Existing Project Work and Phase 6C browser coverage is run alongside it. Routine testing is local and did not use GitHub Actions.

Final checks passed for typecheck, lint, shared contracts, localization, engineering standards, 57 API tests, seven client tests, two web environment tests and both application builds. The integrated disposable run passed the ten C1 associations, three moderation scenarios and the existing Project Work screens. The new organization fixture initially violated the native one-owner rule. With one owner and an administrator who does not hold the designated operator role, the fresh four-case rerun passed both C2.1 cases and both Projects regressions. The ten native community owner scopes, organization operator and delegated administrator, exact-source drift and existing `project_update` restriction were exercised.

## Documentation and operations

Target database is hosted Supabase project `hcbxulyfmdmuyccgrujs`. The application is verified locally. The SQL fixture gate is intentionally unseeded, and the API permits only synthetic operation against disposable Supabase outside production. Any live release mechanism requires a separate authorized design. On November 25, 2026, the owner approved and the CLI applied only `20261125121000_c21_project_outcome_requests.sql` from implementation revision `16e01861511b789b6752b6b9d962a13ae7b5b80e`. Working-tree and committed SHA-256 both matched `f845d9b06c0146753ad826eb3662ce4ec586f08375cdc07270d50a1dc54e312a`. The fresh dry run found 138 applied migrations and only C2.1 pending, with no seeds or roles.

Read-only postflight found 139 applied and zero pending. All 57 data fingerprints matched, including existing projects, milestones, metric observations, reports, moderation, C1 and account records. All 261 existing relations, 777 routine definitions and ACLs, 29 RLS policies and 131 triggers matched. All three new tables have RLS and deny direct access to anonymous, authenticated, service and authenticator roles. The three new function bodies matched the approved migration. The public entry point grants execution only to the backend service among app roles, with no app-role execution for the two private helpers. The gate, requests and history tables remained empty. All four C1 fixture gates and five pilot tables stayed empty.

All 31 connected localhost checks passed after deployment. They verified existing reads, private Project Work guest denial, all three C2.1 read routes returning the closed status with private headers, and the existing moderation and C1 access boundaries. Hosted Next.js and Fastify were outside this rollout.

In the interactive localhost browser, J0SC0X viewed Project Work and an approved private proposal. The Founder account had no project in execution. Test02 could see its three owned projects and open their existing Project Work overview. Each awaited the existing Start project work step. Test02 was denied the Founder’s private Project Work URL. Since those accounts had no Project Work in execution, the authorized Outcomes panel, native reports, closed message and synthetic lifecycle were verified on disposable records. The browser work made no project or case changes.

## Remaining blockers

C2.2 needs approved independent reviewer eligibility and assignment scope, appointment and removal procedures, recent MFA and originating workspace requirements, and conflict rules for applicants, owners, project team members, internal reviewers, financial or personal ties, and C1-association participants. Decide evidence release and revocation, reviewer separation, recusal and replacement, decision and appeal standards, retention and public consent separately. C2.1 creates no reviewer grant, queue, certification or public claim.
