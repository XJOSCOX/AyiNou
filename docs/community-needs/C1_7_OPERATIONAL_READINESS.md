# C1.7 Community Needs operational readiness

## Scope

Community Needs is for Haiti’s 10 department communities. Ouest is the first proposed controlled pilot. The hosted inventory confirmed all ten: Artibonite, Centre, Grand’Anse, Nippes, Nord, Nord-Est, Nord-Ouest, Ouest, Sud and Sud-Est. Each starts closed to Community Needs. Existing discussion, membership, and project features continue independently.

## Data model and API

Platform Settings → Community Needs Pilot retains the existing session-bound read and command routes. The read model adds exact runtime and policy release values, distinct recorded grant states, and status and provenance for each operational requirement. An unset runtime release is shown as unavailable. The protected record’s username is shown when an applicable profile exists. The evidence reference and source artifact remain in independent custody. The six required classes are privacy and retention, support and escalation, database recovery, private Storage recovery, matching release, and independent closure of critical/high blockers.

## Permissions and audit

The existing Founder capability controls configuration, enrollment, activation, pause and resumption. An ordinary member cannot read this dashboard. Attestation writes remain outside Founder and service authority. Existing independent review, community scope and appeal rules continue, and the pilot decision ledger still records reasons, versions and receipts. The additive display migration replaces only the private dashboard function.

## Privacy and lifecycle

The dashboard returns bounded rosters, aggregate case counts, safe operator names, and dates. The live evidence, case narratives, third-party identifiers and evidence references stay in their original custody. Department reports suppress small groups under a policy approved before launch, avoid sensitive breakdowns, and stay with authorized operators. Follow the [privacy procedures](C1_7_PRIVACY_OPERATIONS.md).

## Localization and accessibility

Readiness, grant and attestation states have text labels in Haitian Creole, French, English and Spanish. The roster and dates wrap on narrow screens. Language and viewport coverage is recorded in the [verification results](C1_7_SECURITY_TEST_RESULTS.md).

## Reliability and recovery

Department operations use separate queues and duty rosters, with a shared escalation and recovery team. A recovery operator may restore only to an approved isolated target. Reconcile later grants, cases, withdrawals, holds and notices before restoring access. The [recovery plan](C1_7_RECOVERY_VERIFICATION.md) records the provider evidence and the current blockers.

## Validation and CI

Use disposable Supabase for grant, concurrency, evidence, publication and denial scenarios. The connected local browser checks use existing accounts and read-only product navigation. The [verification report](C1_7_SECURITY_TEST_RESULTS.md) tracks the results and distinguishes the two environments. Validation runs locally.

## Documentation and operations

### Proposed Ouest operating cycle

1. Name a coordinator and alternate before inviting anyone. Verify account standing, onboarding, Ouest membership and case author eligibility. Do not collect extra proof of residence without an approved purpose. Explain the pilot limits, privacy, how to withdraw and how to get help, in the member’s language. Approve enrollment individually. Review active eligibility and expiries each shift.
2. Start with up to 20 concurrent eligible participants, at most 10 submitted needs per rolling seven days, and a term no longer than 30 days. Require at least one eligible triager and four distinct independent reviewers with coverage for evidence, publication, association and challenges. Use the native assignment and decision flows.
3. Each shift review submissions, open cases, pending challenges, review backlog, conflicts, expired grants and coverage, recent notices and platform health. Follow up privately. In the daily summary record aggregate counts, oldest waiting age and outstanding handoffs without personal details. Proposed success measures are compliance with all scope and capacity limits, no unauthorized disclosure, each eligible case routed with a timely owner and each challenge tracked to the existing deadline. Approve response targets and small-cell minimums before launch.
4. Pause for any privacy exposure, cross-department read, broken eligibility or review controls, lost staff coverage, compromised custody, stale evidence, release mismatch, or missed service target that threatens case integrity. Send a private status notice, preserve evidence and give support owners the next check-in. Keep existing authorized safe reads, withdrawals, and corrections within implemented rules. Resume only after independent clearance against current evidence, adequate staffing and a recorded Founder decision.
5. At term end stop intake and publish a privacy-safe aggregate retrospective. Inventory outstanding cases and challenges, notify affected members privately, retain authorized access and custody while obligations remain, reconcile consent and links, and revoke expired grants through the native workflow. Review against the pre-agreed success measures before proposing another wave.

### Future phased rollout

After a separately approved Ouest pilot and exit review, select one department based on local staffing, support and privacy readiness. Add subsequent small waves until all ten are served. No order beyond Ouest is prescribed. Each wave requires an independently approved operating record for every department in the wave, with existing department ID, member eligibility and term, enrollment cap, rolling submission cap, enabled stages, independent grants and alternates, exact approved release and evidence expiry. Future Founder controls should apply and audit eligibility, reviewer assignment oversight, capacity, activation and pause per department. Global incident response should be able to close all affected scopes while isolated issues stay local. Each department must maintain its own membership, assignment, independence, consent and visibility checks. Cross-department staffing requires explicit authority and conflict screening in each department. Every new scope starts closed and gets an independent access, load, localization, and restoration review before launch. These are future design requirements.

## Remaining blockers

See the [final decision record](C1_7_FINAL_GO_NO_GO.md). Operational sign-offs and appointments are pending. A usable restore point, private-object restoration, matching hosted applications and independent attestation custody still require verification. No live intake, pilot, or new department scope was activated.
