# O5 implementation report

## Scope

O5 adds member-confirmed support for private organization setup, administrative triage of existing ownership claims, temporary claim approval holds and a governance decision ledger. The baseline is `22b9363144ae3222a5faa075403fbb679226af37`. Current platform roles remain in `public.role_assignments`. Founding provenance, specialized review, institutional authority and future nonprofit governance are distinct.

## Data model and API

The additive migration `20261121050000_o5_administration_governance.sql` adds private corrections, governance state, scoped authorities, proposals, claim approval holds and domain events. The singleton starts at bootstrap revision 1. The schema represents distributed and recovery modes. Decisions cannot activate them. A proposal survives only to its stated deadline and is bound to the governance revision. Appointment and succession additionally require the reviewed target’s explicit acceptance with recent MFA.

All routes below are under `/api/v1`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/me/onboarding-corrections` | Read own case and hold status or confirm an exact operation |
| POST | `/me/onboarding-corrections/:id/withdraw` | Withdraw outstanding consent |
| GET | `/admin/organization-onboarding/corrections` | Read the restricted work queue |
| GET | `/admin/organization-onboarding/:id/correction-preview` | Read version, assignment, dependency categories and triage codes |
| POST | `/admin/organization-onboarding/:id/corrections` | Assign the case or record its outcome |
| GET | `/admin/governance` | Read mode, eligible administrators, scoped authority, holds and recent events |
| POST | `/admin/governance/proposals` | Propose an appointment, removal, suspension, succession, mode change or recovery |
| POST | `/admin/governance/proposals/:id/actions` | Approve or withdraw a proposal. Execution is gated closed |
| POST | `/admin/governance/claim-holds/:id` | Place a hold on a claim or release a specific hold |
| GET | `/me/governance-invitations` | Read proposals targeting the signed-in member |
| POST | `/me/governance-invitations/:id/accept` | Accept after independent approval |

## Permissions and audit

The correction is bound to the member, intent revision, operation and exact proposed change. A current administrator who is independent of the subject and target institution must take assignment, provide a reason and confirm with recent TOTP. The decisive transaction checks the member, case revision and protected dependencies again. The transaction shares the lock used by O4 organization setup and verification decisions. Idempotency keys are bound to actor, resource, operation, version and payload. An exact retry retrieves the same receipt. A changed retry fails.

Ownership, claims, representative and staff relationships, delegated roles, invitations, project and volunteer work, poll administration, open verification, appeals and holds have distinct protected outcomes. Claim triage flags stale owner and application snapshots, other claims, impersonation, older evidence and outstanding independent review. Older evidence is flagged for review after 30 days. Its acceptability remains a reviewer decision. Claimant cancellation requests enter protected triage and must be handled through the incumbent review process. Every protected result directs the administrator back to the existing decision workflow.

The ledger records member consent, requests, assignments, withdrawal, persisted consent expiry, applied and protected outcomes, proposals and independent decisions, acceptance, scoped authority provisioning and revocation, and emergency placement and release. Events include applicable actor, subject, resource, reason, version, time and request receipt. A read-only preview returns no evidence and records no separate event. Accepted and approved proposals preserve their distinct actors. Proposed Super Administrator scopes are time-limited records with an approval reference. O5 grants none and exposes no runtime grant path. The legacy administrator-level mutation path fails closed. Existing authorized operations on ordinary accounts and lower platform roles continue.

## Privacy and lifecycle

All six tables use RLS with application-role grants revoked. Service-only RPCs recheck authority using the server-derived actor and current session. Private draft content is disclosed only to its member in O5. Administrative previews contain structural categories and safe case codes. Existing evidence stays in its authorized workflows. Members see receipts and effective hold status in Organization Setup. O5 sends no external notifications and requests no identity documents. Existing legal publication, privacy processing and ballot secrecy boundaries still apply. Retention and disposition of O5 case receipts require an approved records schedule. Foreign key protections prevent deleting active case history through an unrelated operation.

## Localization and accessibility

The existing Platform Administration workspace has correction and governance tabs. Organization Setup displays member requests and receipts. Account Settings displays target invitations and the existing MFA step-up flow. All O5 text and errors have Haitian Creole, French, English and Spanish translations using the existing theme tokens. Forms support keyboard operation, narrow viewports and localized confirmations. The UI explains closed execution and recovery and exposes no execution control.

## Reliability and recovery

Emergency action pauses only approval of a specified pending claim backed by a substantiated institutional impersonation report. Placement is limited to one hold per report, with a maximum of 24 hours. Early release requires a different eligible platform administrator who is also an independent verification reviewer. Expiry restores the normal approval path by time predicate. There is no change to ownership, unrelated operations or evidence access. The usual independent decisions remain required after release or expiry. Existing last-administrator protections remain in place. A second eligible administrator is mandatory for proposal approval regardless of administrator count.

## Validation and CI

The O5 regression suite uses disposable Supabase with synthetic members, administrative roles and organizations. It covers scoped consent, redaction, replay and concurrency, independent approvals, target MFA, claim containment, protected dependencies and responsive multilingual navigation. The repository checks also cover the existing legal, privacy, authentication, project, poll and independent verification workflows. The local full run passed 58 Chromium tests, including five O5 cases and two public-layout checks from unrelated local edits. The API suite passed 48 tests, the client suite passed seven, and both production builds passed.

## Documentation and operations

Operational rollout requires the pending O2, O3, O4 and O5 migrations in that order, followed by matched API and web releases. The read-only hosted dry run for project `hcbxulyfmdmuyccgrujs` listed O2, O3, O4 and O5 in that order. All four were pending at verification. Production application needs separate authorization. A rollback should roll forward with privileged execution closed, preserve the ledger and routing guards, and avoid restoring the legacy administrator mutation as a substitute.

## F1.1 compatibility

New Founder-direct Administrator appointments carry a separate authorization mode. The original proposal receipt records Founder authorization, and only private activation can commit the target’s acceptance and grant. Legacy appointments retain their approval and acceptance rules. Other O5 proposal types and generic execution remain unchanged. [F1.1 implementation](../governance/F1_1_IMPLEMENTATION_REPORT.md)

## Remaining blockers

High-impact execution and operational recovery require an approved delegation and succession procedure, named custodians, provider-backed recovery, separate proof, independent authorization, time-limited access, rehearsal and retrospective review. No operational execution receipt can be generated while these controls are closed. O6 will need its own policy, permissions, and partner dependency integration. O5 contains no Early Partner records, Founder Verified issuance, policy publication or real privacy operations.
