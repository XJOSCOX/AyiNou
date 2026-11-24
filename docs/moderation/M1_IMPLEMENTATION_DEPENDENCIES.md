# M1 · Implementation dependencies

## Proposed order after approval

1. **Agree on policy and authority.** Resolve the owner decisions on sanction scope and duration, emergency actions, protected targets, conflicts, retention, notices, appeals and localization. Record a frozen R1/M1 behavior baseline with API routes, SQL, shared contracts and existing tests.
2. **Build a read-only moderation index.** Extend A1A-style projections for cases, closure/history and stable IDs. Bring native queues into the private workspace by links/adapters. First add event report/decision linkage and visibility scoping in the projection design. Preserve source permissions and verify legacy history when actor/reference fields are missing. Keep report bodies and evidence out of the index.
3. **Define SQL and contract foundations.** After approval, add explicit capability keys, typed scope, policy revisions, append-only decisions, effective windows and idempotent events. Establish read/write roles and service boundaries before enforcing any rules. Define translated, stable API error codes and scope-aware notice/appeal references. Reuse account and safety workspaces.
4. **Bridge account state safely.** Compare effective results with the legacy status and provider ban predicates before any switchover. Preserve existing suspensions and bans as indefinite with native attribution and no guessed expiry, changed rationale or fabricated prior decisions. Decide compatibility for reinstatement, active sessions and a restricted appeal path. Validate protected-target handling before enabling writes.
5. **Integrate limited feature restrictions.** Start with Feed content actions and shared read paths, then media/derived interactions and scoped resources. Expand to group/organization management, events, projects and polls over an explicit API/RPC coverage matrix. Preserve restorative member actions and emergency operations under approved policy. Recheck consistency under concurrent state changes and expiry.
6. **Add notices, appeals and revocation.** Ship expiry and revocation with idempotent event/notice delivery, enforce independent assignment and retain prior decisions. Provide a member-visible case receipt and permitted evidence scope. Expand to remaining domains after the safety/authority tests and review are complete.
7. **Complete the UI and cutover.** Add grouped private-workspace sections and permissions with four-language resources. Reconcile rollout counts and native case references. Use compatibility adapters and phased switches so disabling a new feature doesn't drop effective legacy enforcement. Review history, retention, denial recovery, who can approve, and operational ownership before release.

## Dependency and acceptance checklist

| Layer | Source dependency and acceptance checks |
| --- | --- |
| Roles and sessions | Preserve Founder recognition, Admin inheritance, Moderator/resource scope, live session/workspace and MFA. Test same actor in multiple roles, protected users, independent reviewer conflicts and withdrawal of authority mid-workflow. |
| Content and resources | Use actual route and effective SQL/RLS map. Verify detail/list/direct RPC parity, attachment delivery, public vs member/owner visibility, quote/repost/bookmark/notice behavior and scoped role changes. |
| Cases, policy and history | Preserve separate native authority and IDs. Test scope/case cursor isolation, deduplication, restrictions that overlap, exact expiry boundary, stale versions, races and independently overturned decisions. |
| Data and migration compatibility | Compare provider and legacy restriction rows, private schemas, service grants, migration sequencing, cleanup and redaction dependencies. Simulate rollback with already-applied restrictions and unfinished cases. |
| Member access | Test inaccessible account, limited case access, notice readability, restoration, canceled RSVP/application withdrawal where allowed, content authored for institutions and all locale messages. |

[R1 rules baseline](../rules/R1_AUDIT_SUMMARY.md) · [API inventory](../../apps/api/test/fixtures/route-inventory.txt) · [Shared Feed contract](../../packages/shared/src/feed.ts) · [Shared trust contract](../../packages/shared/src/trust.ts) · [Shared event contract](../../packages/shared/src/events.ts) · [Shared audit contract](../../packages/shared/src/audit.ts) · [A1A missing coverage](../audit/A1A_MISSING_COVERAGE_REGISTER.md) · [Detailed feature dependencies](M1_FEATURE_RESTRICTION_GAPS.md)
