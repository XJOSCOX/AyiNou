# R1 central policy architecture proposal

Keep a version-controlled typed definition for each approved configuration key. Define its data type, permitted values, domain owner, allowed scope, conflict constraints, minimum and maximum, approval class, failure behavior and current default source. Introduce one registry only for policy families accepted by the owner. Existing legal release, gold issuance, O5 governance and privacy state keep their independent authority and ledgers.

## Source of truth and authority

Store immutable policy revisions and an effective pointer or time-ordered activation record in PostgreSQL. Keep draft, review, scheduled, active, superseded and cancelled states explicit. Reuse the trusted Founder provenance, current account state, recent MFA and S2C private workspace. Make authorization checks and effect activation transactional in SQL. Workspace visibility is an affordance. A registry value cannot add actors, override RLS, authorize credentials, or bypass conflicts, independent adjudication or protected process gates.

The private Founder interface would show current values, scope, effective revision, safe preview, planned activation, validation conflicts, and a written reason field. Preview is read-only and performs the same range, scope and dependency checks. Keep sensitive/provider metadata outside UI projection. Restrict evidence and any approval requirements by existing domain boundaries. Publish only safe client display projections with their resolved revision.

## Resolution and transition

Resolve policy by an allowlisted key and explicit scopes over a consistent SQL transaction. Define per key whether global or domain-specific value wins. Conflicting or missing sensitive policies fail closed. A safe non-sensitive default must exist in a reviewed versioned definition. Existing schema constraints remain hard lower or upper limits. Pin the applicable revision to evidence, case or policy-dependent receipt when the rule is evaluated. Existing immutable decisions, audit events and signed evidence retain their original semantics.

Existing case and session guards remain live even when business thresholds are pinned. For example, a revoked reviewer cannot vote under an earlier case policy. A copied link and stale MFA still fail. Preserve active session deadlines independently of policy reads, and let emergency containment take effect through the existing live mechanism.

| Example change | In-flight effect and transition |
| --- | --- |
| Ordinary blue approvals from 2 to 3 | New applications pin the new revision. Open cases with votes retain their original threshold unless explicitly transitioned with reason, impact preview, reviewer availability and an audit record. |
| Ordinary blue approvals from 2 to 1 | This changes independent assurance. Keep the existing threshold until the owner approves an explicit governed decision. Do not lower existing open cases implicitly or rewrite issued outcomes. Founder-direct authority remains a separate decision class. |
| Moderation suspension duration | New moderation actions choose from the new bounds. Existing actions retain recorded expiry. Explicit lift or extension uses the existing authorized action and receipt. |
| Organization eligibility | Recheck current entity, subject and role on every write. Pin submitted criteria for non-safety requirements when necessary. Preview eligibility drift and handle eligibility-reducing changes via defined transition and notifications. |
| Project approval thresholds | Pin review thresholds and case version. Execution rechecks live sponsor, domain permissions and independent identity. New approval requirements for open proposals need an explicit transition. |

## Integrity, performance and emergency stop

Use bounded indexed reads per allowlisted key and small scope. Cache only safe display or derived policy, keyed by scope and revision, with short TTL and activation-triggered invalidation. PostgreSQL rechecks effective sensitive values in write transactions. Use a lock order compatible with native domain transactions, expected revision compare-and-set, deduplicated command IDs, effective dates in UTC and an append-only audit receipt on activate, cancel or rollback. A rollback activates a new version containing prior reviewed values. It preserves intervening audit and historical evidence.

Keep operational emergency stop separate from values that grant authority. Test stopped/resumed behavior, stale caches, missing policy fail-closed, disagreement between SQL and app UI, and replay. A stop needs explicit authorization and a timestamped record. An open emergency state is visible only to permitted actors.
