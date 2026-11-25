# C1.3 Community Needs Publication and Participation

## Scope

An eligible author can request publication of a separately written summary for members of the originating community after a supported C1.2 finding. An assigned independent reviewer decides whether to approve it. An approved snapshot appears in the Community Needs tab of the existing room. Discussion stays in the room’s existing composer and moderation workflow. Project linking, volunteer matching, and pilot activation remain later work.

## Data model and API

The [migration](../../supabase/migrations/20261124155200_c13_community_need_publication.sql) adds a closed fixture gate, a publication row, immutable submission and decision events, and an independent challenge table. The approved projection points to a retained proposal event and uses an opaque publication ID unrelated to the private case reference. Material changes create a new snapshot and need independent review. While that replacement is pending, the previous approved snapshot can remain available if its finding and evidence are still current.

The service-only RPC backs [seven private Fastify routes](../../apps/api/src/routes/community-need-publication.ts) for directory list and detail, author read and command, and staff queue, case and command. Scope and actor come from live membership and a verified token plus the bound workspace. REST projections have private no-store, no-referrer and no-index headers. The authenticated room URL accepts an opaque publication reference. Existing community, public directory, Feed, search, profile and project read contracts receive no publication content.

## Permissions and audit

| Actor | Scope and powers |
| --- | --- |
| Author | Current eligible community member with a supported, matched version may submit a privacy-safe snapshot and consent. Author-only status, challenge, attribution revocation, and withdrawal remain separate from submitting. |
| Community member | List or read approved snapshots in their own community while membership and live account eligibility hold. A previously issued link confers no access. |
| Founder and administrator | Existing MFA-bound administration workspace can assign or reassign an independent reviewer and hide or remove a published snapshot. It cannot approve publication or decide a challenge. |
| Independent reviewer | Assigned reviewer with a live C1.2 community review grant and original verification workspace with recent MFA can decide the publication or a distinct challenge. The author, original triager, evidence reviewer, contested decision maker, prior publication or challenge decision makers on the same snapshot, and materially conflicted staff are excluded. |
| Scoped moderation staff | Existing original-session moderation workspace, recent MFA, and current scoped community staff and triage grant allow temporary hiding. This supplies no approval authority. |

Scope, version, evidence, and authorization are checked in PostgreSQL. Private C1.3 tables have RLS and no direct client or service privileges. The private ledger retains an actor, workspace, request receipt, ordered revision, snapshot, safe feedback code, restricted reasons and decision. Evidence changes invalidate affected publication access and create a system event. Existing inbox notices get a recipient-only event type and authorized case link. They carry no evidence, summary, note, identity of a reviewer, or broad announcement. Directory reads do not create individual tracking records.

## Privacy and lifecycle

The community projection contains only specifically approved title, summary, broad area, category, non-identifying beneficiary description, publication date, and safe reference. C1.3 omits evidence links from the community projection. The summary editor warns about identifying details and rejects common contact/link or precise-number patterns. Independent human review is required for contextual privacy risks that text checks cannot determine.

Author attribution is off by default. Each request records its audience and attribution explicitly. The projection checks current public profile visibility, live account and community eligibility, and blocking. It returns only username and public display name. Consent withdrawal invalidates attribution for future reads while preserving the private event history. Withdrawal, hiding, or removal clears visibility and retains evidence. A stale or overturned finding also clears visibility and eligibility for challenge decisions on that snapshot.

An eligible author has fourteen database-clock days to challenge a rejection. The original decision, evidence, review notes, and separate challenge remain intact. A successful challenge returns the request to the independent assignment queue and does not publish it. Evidence challenges and M2.4 enforcement appeals keep their existing boundaries.

## Localization and accessibility

English, Haitian Creole, French, and Spanish cover directory and publication states, safety warnings, reason codes, consent, staff actions, challenges and notices. The room preserves its existing tabs and layout. Category filters and details are keyboard accessible, async feedback uses status or alert roles, and theme tokens support light and dark modes.

The discussion action returns to the scoped native composer. Members can explicitly insert the opaque link and decide whether to post. It inserts no case details and creates no post automatically. Rooms with public discussion do not offer that integration. Subsequent posts use existing membership, restrictions, filters, moderation, and notifications.

## Reliability and recovery

Commands bind an idempotent request to actor, case and payload. The ledger and visibility change commit together, preserving expected revisions and the exact evidence finding and version. The migration shares C1.2’s evidence mutation lock and uses live membership checks to protect approval. Duplicate commands cannot emit a second decision. The challenge table enforces one challenge per contested decision and one pending challenge per publication. With no eligible reviewer, the case stays pending. A forward repair can restore correct gating or state while keeping historical records. Existing audit history and C1.1/C1.2 storage are preserved.

## Validation and CI

The [publication suite](../../apps/web/e2e/community-need-publication.spec.ts) exercises the lifecycle and queries PostgreSQL invariants in disposable Supabase. The selected browser run passed all 11 cases, including C1.1, C1.2, C1.3, the Ouest room, private groups, Feed language, moderation, and project work. The C1.3 case exercised the authored snapshot and consent, confined discussion, restricted access and direct RPC grants, concurrent approval, revisions, challenges, hiding and removal. Desktop and 390-pixel browser checks covered all four languages. The local unit run passed 55 API, seven client-error and two environment tests, plus shared contracts and translation checks. The exact Git-normalized migration passed a fresh disposable C1.3 run. Lint, typecheck, engineering standards, and local and HTTPS production builds passed. Hosted data remains outside mutation testing.

## Documentation and operations

The new migration is pending separate exact-version approval for AyiNou project `hcbxulyfmdmuyccgrujs`. The hosted dry run selected only C1.3 and zero seeds or role changes. C1.1 and C1.2 are already in the hosted history. The exact staged migration SHA-256 is `7daff18ed4d13b9249fc8701ed1fcd2a1ce8806d808b06f3c340d3ed2b88d6f7`. No hosted rollout or application deployment has been performed. All three fixture gates are required and the API accepts the synthetic feature setting only on the designated non-production loopback database. A future pilot needs separate approval, preservation checks, tested staffing and escalation, intake and review bounds, support and notification routing, and a reversible pause. The current gates are reserved for disposable tests.

## Remaining blockers

Approve publication and notice purpose, retention for initial evidence and publication snapshots, access recertification, legal holds, evidence-preserving export and erasure, moderation and escalation ownership, and a staffed independent review and challenge roster. Real activation, hosted application deployment, and pilot readiness require separate approval. [Roadmap](../../ROADMAP.md) · [Audit coverage](../standards/AUDIT_COVERAGE_MATRIX.md)
