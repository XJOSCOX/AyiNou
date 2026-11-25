# C1.2 Community Needs Triage and Independent Evidence Review

## Scope

C1.2 extends the private Community Needs workflow with scoped triage, independent findings, author corrections and challenges. Drafts are still private to the author. Submitted cases can be under review, need information, supported, insufficiently supported, not supported, withdrawn, or closed. “Supported” means the evidence examined reasonably supports the need. Findings create no public listing, project or account verification.

## Data model and API

The additive migration stores scoped authority, review state, immutable action receipts, conflicts, potential duplicate links and challenges in separate private tables. C1.1 retains its existing need IDs, content and evidence revision history. C1.2 tracks case revisions independently so staff changes and author evidence snapshots have separate provenance. The original C1.1 intake commands enforce the new restriction at their native table write boundary. The C1.2 member detail reads review state in a separate API projection.

| Surface | Contract |
| --- | --- |
| Member case status and commands | GET and PATCH `/api/v1/me/community-needs/:id/review` |
| Staff queue and scoped authority | GET and POST `/api/v1/private/community-needs-review` |
| Staff case and commands | GET and PATCH `/api/v1/private/community-needs-review/:id` |
| Triage entry availability | GET `/api/v1/private/community-needs-review/triage-access` |

[Migration](../../supabase/migrations/20261124155100_c12_community_needs_review.sql) · [Fastify routes](../../apps/api/src/routes/community-needs-review.ts) · [Shared contracts](../../packages/shared/src/community-needs-review.ts)

## Permissions and audit

- Members use a live signed-in session and can read only their own case. An authorized clarification allows a confirmed, versioned correction even while the member is restricted from submitting new needs. Withdrawal remains available before decision where eligible.
- Triage requires an explicit expiring community grant, current community membership and staff standing, an assigned case, recent TOTP and the original moderation workspace. Triage can record completeness observations, flag sensitive information, link a possible duplicate within the same community and assigned scope, request a safe clarification, or refer or escalate the case. Moderation roles alone supply no C1.2 authority.
- Independent reviewers require an active verification-reviewer designation, a separate C1.2 community grant, recent TOTP and the original verification workspace. Publication and identity decisions remain separate. Reviewer and appeal acceptance require a conflict-free declaration.
- Oversight uses the existing administration workspace. Founder or administrators can assign eligible staff and record conflicts. Only the Founder grants or revokes C1.2 scope, and self-grants and self-assignments are denied. Oversight gets metadata and audited action summaries. Only assigned staff get evidence content.
- The author, triager, prior decision maker for an appeal or reconsideration, and people flagged for a personal or financial conflict are excluded from independent review. The project and organization checks conservatively treat materially involved roles on projects associated with the same community as a conflict. Current relationship checks are re-evaluated at each case operation. C1.2 creates no project link.
- Restricted ledger entries retain actor, scope, case and evidence revisions, request, workspace, timestamp and action. Staff evidence access, assignments, flags, private observations and rationales, findings, corrections, challenges, withdrawal and closure are recorded. Assignment denials for ineligible or conflicted candidates are auditable. The author projection exposes safe coded feedback and decision history. Private narrative and references remain outside general audit projections.
- M2.3 registers `community_need_submit` with community and existing platform scope. It uses existing ceilings, expiry, protected accounts, appeal ordering and approved delegation policy. Moderators need actual delegation and the current moderation policy must permit the capability. Registering the capability changes no Founder policy revision. Intake restrictions block draft creation and changes and initial submission while owner read, authorized correction, withdrawal, private notices and challenges retain their own account and case checks.

## Privacy and lifecycle

A case stays private. C1.2 accepts C1.1 public HTTPS references and author-supplied descriptions. Reviewers record private observations and a written rationale. The member sees a localized safe decision or clarification code, never the working note. The native in-app inbox rechecks recipient ownership and shows an event label and private case link. C1.2 has no push or email delivery.

Duplicate associations require authorized access to both cases in one community. They retain provenance and have no merge or corroboration effect. Evidence versions are preserved on correction. Only one challenge may be filed per adverse finding, within 14 days measured by the database. A separate independent reviewer can uphold it or return it for independent reconsideration. Previous findings and all evidence remain in the ledger. M2.4 enforcement appeals keep their own rules and records.

Before any real pilot, the privacy lead and operating owner must approve the purpose and retention of submissions, snapshots and access events, member rights intake, export and erasure handling, legal holds, incidental sensitive-content removal, access recertification and restore procedures. The synthetic privacy workflow is unchanged.

## Localization and accessibility

The member and staff panels use existing responsive, keyboard-accessible workspace layouts and theme tokens. Haitian Creole, French, English and Spanish cover statuses, actions, safe requests, findings and inbox notices. Private rationales and member descriptions use wrapping text with no external URL fetching.

## Reliability and recovery

A write locks the case and uses expected revisions and a confirmed idempotent command. A correction also pins the original evidence revision. Exact write retry does not append a second receipt. The challenge table constrains one filed challenge per finding and one pending challenge per case. Audit and inbox events commit with the mutation. If eligible staff are unavailable, a case remains pending. A forward correction can narrow grants without deleting retained evidence.

## Validation and CI

The [C1.2 disposable review test](../../apps/web/e2e/community-needs-review.spec.ts) exercises the review lifecycle and grant boundaries through HTTP and checks database invariants. The [C1.1 test](../../apps/web/e2e/community-needs.spec.ts) checks the existing flow with the new review gate closed. The final C1.2 browser run passed, including the member challenge form and 390-pixel checks in English, Haitian Creole, French and Spanish. Eight related browser regressions passed on disposable Supabase, covering C1.1, the Ouest room, private groups, moderation policy, enforcement appeals, project work and production readiness. Repository unit tests passed (55 API, seven client errors and two web environment), along with shared-contract and localization checks. PostgreSQL authorization and ledger assertions ran within the disposable C1.2 suite. Lint, TypeScript, engineering standards, and both loopback and HTTPS production builds passed locally. The earlier Phase 1A SQL fixture has a known live-session setup limitation documented in [C1.1](C1_1_IMPLEMENTATION_REPORT.md).

## Documentation and operations

The Founder-approved migration `20261124155100_c12_community_needs_review.sql` was applied on November 24, 2026, to hosted AyiNou Supabase project `hcbxulyfmdmuyccgrujs` (CLI environment: production). The tested implementation and deployment source was `e21525a0660cae87f3640fd7ab244cc85478344b`. The migration SHA-256 was `ff8bf8680e63f6f03f4ed19d04a2100fe346a2a57ee7a8a3a5c27864cb17feb8`.

| Check | Verified result |
| --- | --- |
| Preflight | The project link, remote main, and exact file hash matched the approval. Hosted history showed 131 matching migrations through C1.1, an empty C1.1 fixture gate, and no C1.2 tables, review RPC, or submission capability. A fresh dry run selected only C1.2, with zero seeds and roles. |
| Deployment and history | The CLI applied the single approved migration. The postflight matched all 132 local and remote versions and the dry run selected zero pending migrations, seeds, or roles. All 131 prior history fingerprints matched. |
| Existing records | All 40 count and fingerprint pairs matched, covering accounts and role assignments, communities and memberships, C1.1 needs and revisions, moderation, sanctions, appeals, Founder policies, project records, audit, and Storage bucket configuration. Auth used a projection of IDs and eligibility fields. Existing notification contents and earlier capability registrations were fingerprinted without the new column or capability. The read-only probes returned aggregate results. |
| Existing authorization | All 242 existing relation RLS and ACL entries, 29 RLS policy fingerprints, and 715 existing routine execute ACL and security settings matched. Routine definition changes were limited to workspace eligibility, notification visibility, and the inbox projection as specified by the migration. The C1.1 owner-filtered RPC definition and grants matched. |
| New authorization | RLS was enabled on all seven new private tables, with zero non-owner ACL grants and no effective direct table or column privileges for anon, authenticated, authenticator, or service role. C1.1 and C1.2 public RPCs retained backend-service-only execution among non-owners, with definer execution and an empty search path. Private helpers had no client or service execute grants. Installed definitions contained the intake gate, live session and onboarding checks, original-workspace and recent-MFA checks, explicit scoped grant and assignment predicates, and author, prior-reviewer, project, and organization conflicts. |
| Restriction and challenge integrity | The sole new capability was the community-scoped `community_need_submit`. Existing restrictions, sanctions, and Founder moderation policies matched preflight. The intake, revision, and notice triggers were present. Installed SQL preserved the 14-day database-clock deadline, expected evidence revision, append-only C1.1 evidence, one challenge per finding, and one pending challenge per case. |
| Activation and hosted data | Both fixture tables were empty. C1.1 needs and revisions, C1.2 authority, cases, events, conflicts, duplicates, challenges, and C1.2 notices all had zero rows. Live intake, review, and publication remain disabled. The API synthetic gate additionally requires the designated disposable loopback backend outside production. |
| Connected localhost application | All 17 guest HTTP probes matched preflight and postflight. Health, community discovery and Ouest metadata, and project reads returned 200. Guest membership and moderation-policy requests returned 401. Needs returned the disabled-intake code, and protected community, needs, and triage pages redirected guests to sign-in. The existing API process did not expose the C1.2 review routes. A temporary local API from the exact implementation, connected to hosted Supabase with the feature disabled, returned the explicit disabled-review 404 with private no-store and no-index headers. |
| Signed-in localhost application | The existing Test02 session showed joined communities, Ouest Discussion and Members navigation, and published projects. My community needs showed closed intake without submission or review controls. The triage URL displayed Page not found. A privileged hosted moderation read was outside the available browser session. Moderation verification covered guest denial, unchanged hosted policy and enforcement records, and the existing disposable moderation regression. |
| Disposable postflight tests | The C1.1 and C1.2 Playwright suites passed against disposable Supabase after rollout. They exercised scoped roles, ownership and conflicts, MFA and original-session boundaries, revisions, idempotency, restrictions, challenge deadlines, and private notices. Hosted verification involved reads only. |

The following SHA-256 values matched in both captures. Each hashes a sorted JSON map over the preflight keys. Routine evidence covers ACL, definer status, and function settings. Record evidence includes per-table counts and SHA-256 fingerprints.

| Preservation evidence | Matching SHA-256 |
| --- | --- |
| 40 existing table record fingerprints | `47944adc4faa58e55a45557fe1ecac80fc0708d4488b5ca2dbe778252146f1b7` |
| 131 existing migration records | `7f0addb21383aa612775e8369dc3670388de9934e1510a9e6cf8465c586f75e9` |
| 242 existing relation RLS and ACL entries | `50e898448f6373f4716ff3fd048298473743d5a8d7e4a8e7638aca8f7ad1376f` |
| 29 existing RLS policies | `3c9b9d2ea8e1ea6fa11ad85df67b9e741a9bd1a64ddca68adaff90a42c325052` |
| 715 existing routine authorization entries | `29417e001dfcd75707fa10d8e9f5380149d95e4867143c9acd7f2ec3db169463` |

This was a database-only rollout. Hosted Next.js and Fastify deployments remain separate releases. A future pilot needs an approved activation design, community and reviewer roster, conflict and recertification rules, member support, and an approved M2.3 delegation policy.

## Remaining blockers

A separately authorized pilot, privacy and retention approvals, staffed independent review and challenge lanes, and operational readiness remain open. C1.3 publication, C1.4 project linking and C1.5 activation are outside this phase. [Roadmap](../../ROADMAP.md) · [Launch dependencies](../product-inventory/I1_LAUNCH_DEPENDENCIES.md)
