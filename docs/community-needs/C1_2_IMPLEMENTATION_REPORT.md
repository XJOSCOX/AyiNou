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

The prepared migration is `20261124155100_c12_community_needs_review.sql`. The read-only hosted migration preflight for AyiNou Supabase project `hcbxulyfmdmuyccgrujs` showed 131 matching applied migrations, one pending migration (C1.2), and no role or seed changes in the dry run. The C1.2 file SHA-256 is `ff8bf8680e63f6f03f4ed19d04a2100fe346a2a57ee7a8a3a5c27864cb17feb8`. The migration remains pending separate approval. The C1.1 and C1.2 database fixture gates are closed by default. The existing API environment gate only accepts the synthetic flag on the designated disposable loopback backend outside production. There is no real intake or review activation endpoint.

For a future pilot, obtain exact migration approval, verify the dry-run scope and preflight and postflight preservation, and keep both fixture gates closed on the hosted target. Prepare a separately reviewed activation design for the approved communities, explicit reviewer roster, tested conflict and recertification rules, support paths, and the approved M2.3 delegation policy. Production application deployment remains a separate release.

## Remaining blockers

Hosted registration of this migration, a separately authorized pilot, privacy and retention approvals, staffed independent review and challenge lanes, and operational readiness remain open. C1.3 publication, C1.4 project linking and C1.5 activation are outside this phase. [Roadmap](../../ROADMAP.md) · [Launch dependencies](../product-inventory/I1_LAUNCH_DEPENDENCIES.md)
