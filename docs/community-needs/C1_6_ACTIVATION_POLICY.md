# C1.6 activation policy

## Authority and configuration

The designated emergency and activation authority for this preparation release is the recognized Founder. Platform Settings requires a live, original-session admin workspace and recent MFA. Every change records the supplied reason, revision, receipt, actor, workspace, subject where relevant and timestamp. Case oversight and reviewer work continue to use their existing distinct workspaces and grants. Moderators and administrators without Founder provenance cannot configure, activate or resume the pilot.

The sole eligible room is the department community whose slug is `ouest`. Configure intake, triage/review, community publication and project association independently. A configured draft remains disabled. The maximum term is 30 days with a lower configured duration. Expiration is calculated from first authorized activation using database time. Pausing and resuming keep that expiration. After activation an active configuration can only lower capacity. Stage changes require a separate pause, save and resume, with release and overall date requirements preserved.

## Activation and reopening

Before the Founder can authorize activation, a published application release must match the configured API release. Release operators separately approve `AYINOU_COMMUNITY_NEEDS=pilot` and the exact 40-character `AYINOU_COMMUNITY_NEEDS_RELEASE`. A release variable is a routing check. The database independently verifies the approved Ouest configuration, an eligible enrolled cohort, one eligible triager and four distinct independent reviewers, the six operational attestations, an approved term and at least one enabled stage. It refuses activation if any disposable gate is populated. The Founder must explicitly confirm a separate activation command.

Operational evidence is associated with the exact community and release, has a responsible attester, durable reference, verification time and expiration, and can be revoked. It remains pending until independently recorded by a separately authorized operational process. The Founder interface and service role cannot attest any prerequisite. Activation and resumption bind the latest evidence snapshot. A change to that evidence blocks new stages until paused and explicitly resumed with current evidence.

## Pause and safe paths

Pause stops new intake, new case assignments, current-evidence publication requests and approvals, and new project association requests and approvals. Existing private case access and history, eligible evidence clarification corrections, withdrawals, attribution revocation, authorized moderation hides/removals and already-assigned eligible challenge work remain available within their native scopes. New challenge assignment remains paused. Public-style community publication and association projections close during a pause. Native project workflows remain available, and their invalidation hooks still remove stale links.

No real pilot should reopen after a restore until the operator has verified the database and private Storage, reconciled post-backup revocations and evidence, and checked release routing before a new Founder decision. Keep production routing disabled externally during recovery.
