# C1.5 controlled Ouest pilot proposal

## Proposed configuration

| Requirement | Classification | Proposed operation or evidence |
| --- | --- | --- |
| Ouest eligibility and interaction | Implemented and verified | Existing room slug `ouest`, membership, active sessions, account restrictions and scoped discussion continue to govern reads. |
| Admit an eligible member cohort | Missing | A separately reviewed production cohort selector would require current Ouest membership, an active/onboarded eligible account and an explicit cohort grant with scope, expiry, reason and audit. Membership alone would be insufficient. Confirm selection, age eligibility and meaningful notice with the Founder and privacy lead. |
| Production intake enable and pause | Missing | Implement a default-off server and SQL authority record only after reviewing who can activate or pause each operation. Require exact Ouest scope, recent MFA, approved revision, time limits and auditable actors and reasons. Keep the four disposable fixture gates empty. |
| Intake limits | Implemented and verified | Native maximums are 10 draft cases, five submissions in 24 hours, and 40 actions in the revision quota window. Moderation can restrict relevant capability use. Propose an initial staffed ceiling of 10 new cases per week until the Founder and support lead approve capacity. That cohort ceiling would require enforcement or an explicit intake queue procedure. |
| Staffing, support and escalation | Requires external infrastructure or staffing | Establish a staffed intake/help channel, accountable triage lead, an independent reviewer pool, challenge and emergency coverage, and a designated privacy contact. Publish support and escalation instructions before onboarding. |
| Evidence and retention terms | Requires legal/privacy approval | Approve purpose, acceptable evidence, visibility and consent, rights routing, retention classes, deletion behavior, restoration and holds. |
| Publication approval | Implemented and verified | Exact supported snapshot, author request, community audience and independent reviewer. No automatic publication. Retain separate feature pause for publication in a production design. |
| Project links | Implemented and verified | Native project eligibility, current Ouest publication, separate author consent and independent association review. A project link measures a recorded relationship. |
| Master pause and recovery | Missing | Proposed emergency control separates opening new intake from completing existing protective actions. Freeze new submissions, assignments, publication and links on privacy or authorization failures, an unstaffed queue, or ambiguous restore state. Preserve evidence, notices, withdrawal and support subject to a separately approved design. |
| Dry-run recovery on provider | Requires external infrastructure or staffing | Verify recovery point, restore procedure, data protections, provider permissions and reconciliation in an approved isolated environment. |
| Launch and exit | Requires Founder approval | Go/no-go only after staffing, privacy/legal, release and recovery sign-off. Stop onboarding at pilot exit, close or transfer unresolved cases through authorized lanes, revoke/expire cohort and staff access, and reconcile retained records. |

## Stop, restore and exit

If a privacy incident, access-control failure, staff coverage gap or provider restore occurs, pause new actions under approved incident authority. Record the actor, reason, scope, time and implicated policy revision. Preserve scoped evidence and route member support and challenge deadlines to their accountable owners. Reconcile eligibility, reauthenticate privileged actors, reapply revocations and withdrawals, then validate authorization and queues before any new activation. Before exit, approve case dispositions, the post-pilot notice and support plan, and a policy-backed audit retention method.

## Pilot measurement

Compute metrics inside an access-controlled monitoring workflow from existing events. Use Ouest-level weekly windows and distinct cases or exact decision IDs. Deduplicate command replays. Suppress small or inferable complementary groups in any broader report and omit names, IDs, written reasons and timestamps that could identify individual members. Thresholds and the reporting audience require privacy review. There is no new hosted metrics dashboard.

| Measure | Definition |
| --- | --- |
| Eligible submissions | Unique needs with a native submit event during the window, with prospective eligibility recorded on admission. Report separate denied or paused attempts only as coarse system totals when approved. |
| Triage turnaround | Elapsed time from first submit to first substantive triage action. Report median and an upper percentile only above the release threshold. Count cases awaiting triage separately. |
| Independent review completion | Unique assigned cases with a final evidence finding or closure, divided by the eligible review cohort. Separate pending and overdue work. |
| Clarifications | Unique cases receiving a request for information, and the count of requests. Count unresolved requests at the cutoff. |
| Findings | Counts by supported, insufficient evidence and not supported, with repeated and superseded decisions counted under a documented rule. |
| Challenges and outcomes | Unique filed, returned, upheld and unresolved challenges. Group evidence and publication challenges only where the audience can safely distinguish them. |
| Community publications | Unique exact community snapshots approved and made visible in the window. Record authors’ withdrawals and moderation hides separately. |
| Project associations | Unique approved associations activated after native project publication. Report separate revoked/withdrawn totals and exclude pending links. |
| Backlog | Open cases by stage and age band, unassigned queue and pending challenges at the cutoff. |

Pilot success means sustained scoped access checks, evidence review and challenge coverage, manageable turnaround, and a backlog that support can safely handle. The Founder and operations lead approve target values against the pilot workload. No outcome certification is included. [Owner decisions](C1_5_OWNER_DECISIONS.md)
