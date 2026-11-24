# M1 · Unified enforcement proposal

This is a design for owner review. Native decisions and permissions remain the source for current behavior.

## Case and restriction model

| Record | Proposed fields and invariants |
| --- | --- |
| Case | Stable ID, domain, scope, subject/resource, intake origin, state, policy version and timestamps. Link any number of native reports by stable references. Authorized proactive cases require a separate reason and permission. |
| Decision | Append-only action, actor and authority at decision time, subject/resource, case, outcome, reason code and restricted rationale, prior decision, expected version, idempotency key, request/correlation ID. Retain independent decision and reversal linkage. |
| Restriction | Subject principal, action key, scope type/ID, decision ID, effective start, nullable end, explicit revoke/supersede state, policy version and authority. Require the correct scope for each capability. Expiry is an absolute database timestamp. |
| Appeal and evidence | One appeal per eligible decision according to policy, independent assignment, deadline, version and outcome. References to authorized source snapshots with access/retention class and purge state. Keep sensitive reasons, attachments and proofs out of overview projections. |
| Notice | Outbox entry with recipient, safe case reference, translated category, effect, duration and appeal eligibility. Deduplicate by decision and event type. Keep delivery history separate from case evidence. |

Use explicit capabilities for account access, post/publish, comment/reply, reaction/repost/quote, following/mentions, media upload, organization creation/claim, organization management/publishing, event creation/management, RSVP, community creation/management/membership, project create/submit, volunteering, poll creation and nominations. Treat voting as a separate policy decision. Platform, community and organization applicability must be explicit. Model resource hiding and member feature denial separately. Account access denial applies broadly across member capabilities. Overlapping applicable restrictions deny independently, with deterministic reason selection for the user and complete action history for authorized reviewers. Revoking one decision leaves other active restrictions in force.

Use a common SQL policy function with explicit actor, action key and scope, invoked by both application writes and direct RPC/RLS-backed writes. Keep API authorization/errors and standalone resource visibility checks, preserve per-domain ownership and conflict rules, and re-evaluate state transactionally in commands. Effective reads compare the database clock with the active window. A retryable expiry worker emits one history/notice event and repairs summaries. A missed worker run cannot extend the denial window. Use the same operation for manual revocation and independently overturned restrictions when the corresponding state is still current. Revoke or constrain sessions only under a separately approved policy.

## Governance, review and evidence

Allow eligible Founder and platform Admin access to routine platform tools under the existing private workspace and recent step-up. Delegate versioned capability bundles with narrow scope and optional maximum sanction duration. Recheck live authority at decision time, including assignment and target conflict. Scoped moderators act only in the delegated resource. Preserve protected Founder/Admin governance, identity review, ballot secrecy, privacy case boundaries and last-owner controls. Require independent review by a separate eligible actor with separation from the reporter/appellant, original decision and relevant ownership. Keep abuse-sensitive evidence and account-appeal paths accessible only under expressly approved controls.

For redaction, store a case-linked visibility overlay with approved reason, version, applicable audience and independent reversal history. Preserve the original authored content within approved retention and case permissions. A public marker can say that material was removed under a policy. Apply the same projection to detail, list, quotes, notices and media delivery. No general editing of another member's statement is proposed.

## Founder Moderation Center

| Section | Proposed contents and existing building blocks |
| --- | --- |
| Overview | Safety overview counts plus scoped open cases, active restrictions and overdue appeals. Reuse `SafetyOverviewPanel`, with counts tied to the same safe queue authorization. |
| Reports | Filter by domain, scope, intake, age and status. Reuse Feed, event, project and impersonation queues through adapters. Keep source-specific decisions and evidence permissions. |
| Content Moderation | Reuse `feed-moderation` and scoped moderation commands, link native project/event panels, and show allowed actions and case version. |
| Account Enforcement | Reuse admin account search, protected-target responses, step-up and written reason. Add a capability/scope/duration preview only once policy is approved. |
| Active Restrictions | Show time window, owning case, expected expiry and authorized revocation. Provider, account, feature and resource effects should be distinguishable. |
| Appeals | Reuse content appeals, trust and Founder identity components while preserving their different assignment and decision rules. A status view may link to native detail subject to independent access. |
| Moderation History | Extend A1A's safe summary, source reference and cursor design. Reuse native admin/policy history for authorized drill-down. |
| Moderation Policies | Reuse Founder-only policy controls and revision/audit presentation, with effective dates and separate approvals for protected changes. |

Keep all sections under the shared private admin workspace. Links and actions derive from live capability checks. Keep independently adjudicated work in restricted review views. [Admin workspace](../../apps/web/src/components/admin-workspace.tsx) · [Moderation appeals and overview](../../apps/web/src/components/moderation-appeals.tsx) · [Feed moderation](../../apps/web/src/components/feed-moderation.tsx) · [Trust workspace](../../apps/web/src/components/trust-workspace.tsx) · [Project review](../../apps/web/src/components/project-review.tsx) · [Event moderation UI](<../../apps/web/src/app/(protected)/events/moderation/page.tsx>) · [Policy history UI](../../apps/web/src/components/policy-audit-history.tsx) · [A1A contract](../audit/A1A_UNIFIED_EVENT_CONTRACT.md)
