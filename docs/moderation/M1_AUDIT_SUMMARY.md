# M1 · Moderation and enforcement audit

**Baseline** `main` at `6b00bba7dde2c569014d6b3d6780e54b9a92d5e2`. M1 traced the registered API routes, shared contracts, Founder and Admin interfaces, effective SQL definitions, R1 rules, A1A and existing local tests. SQL authorization and service logic establish the current behavior. Proposed changes require separate owner approval. Existing uncommitted Feed UI work was outside the audit and excluded from delivery.

## Findings

| ID | Finding | Significance |
| --- | --- | --- |
| M1-01 | Founder inherits routine platform administration and moderation. Global Feed, event and project moderation admit Founder. Department and group content moderation admits Founder through Admin scope. | The principal Founder gap is access and visibility across workspaces and history. Ordinary organization and representative reviews also have specifically authorized direct Founder paths. Personal, government/protected and independent cases retain their applicable eligibility and conflict rules. |
| M1-02 | Suspended and Banned both deny current member eligibility through the same product gate. Both are indefinite until explicit status change. Provider-level ban timing is separate. The account writer does not revoke auth sessions, send a status decision notice or open an appeal. | Restriction, session lifecycle, reinstatement, notification and appeal need an explicit design. Existing resources and memberships retain their own states. |
| M1-03 | Feature switches, member blocks, resource holds, group removal and organization roles exist. There is no general per-account feature restriction model. | Introduce capability/scope checks at transactional SQL and API boundaries only after agreeing on rules for duration, precedence and restorative access. |
| M1-04 | Feed and scoped content support hide, restore, remove, dismiss and reasoned history. The current hide has a 14-day author appeal. Projects, events, polls, impersonation and group removal have uneven report, reversal and appeal coverage. | Reuse the more complete native workflows first. Keep content visibility, resource status and account action semantics distinct in the case model. |
| M1-05 | Event report decisions have recent MFA and state checks, but no explicit organizer/reporter conflict exclusion, independent appeal or decision notice. Event moderation history lacks the originating report reference. | Decide conflict and emergency rules before offering broader event decision access. Ensure origin reports and decisions remain traceable without exposing reporter details. |
| M1-06 | Native ledgers hold reusable metadata. A1A's platform projection covers admin and global Feed moderation, with Founder governance when authorized. Scoped content activity, new event moderation and F2.5 policy changes are not all represented in the corresponding consolidated history. | Start with a redacted, authorized read projection and links to native cases. Preserve separate evidence and reviewer scopes. |

The legacy account write verifies elevated session and live Admin authority without a workspace identifier. Newer privileged commands bind the workspace and recent step-up explicitly. Harmonizing these gates should be an implementation decision. [Legacy account route](../../apps/api/src/routes/admin.ts) · [Workspace-bound A1A](../../supabase/migrations/20261121145000_a1a_unified_audit_reads.sql#L108)

## Documents

- [Complete moderation inventory](M1_COMPLETE_MODERATION_INVENTORY.md)
- [Role and permission matrix](M1_ROLE_PERMISSION_MATRIX.md)
- [Account restriction matrix](M1_ACCOUNT_RESTRICTION_MATRIX.md)
- [Feature restriction gaps](M1_FEATURE_RESTRICTION_GAPS.md)
- [Reports and appeals](M1_REPORTS_AND_APPEALS.md)
- [Audit and evidence coverage](M1_AUDIT_AND_EVIDENCE_COVERAGE.md)
- [Unified enforcement and Founder Moderation Center proposal](M1_UNIFIED_ENFORCEMENT_PROPOSAL.md)
- [Implementation dependencies](M1_IMPLEMENTATION_DEPENDENCIES.md)
- [Owner decisions](M1_OWNER_DECISIONS.md)

## Verification

- `npm run test` passed. The run covered 53 API tests, 2 web configuration tests, 7 web client-error tests, and shared contract and locale checks. Admin, Trust, Safety, route inventory, audit cursor, group, project and poll tests informed the authority trace. [Admin tests](../../apps/api/test/admin.test.ts) · [Safety tests](../../apps/api/test/safety.test.ts) · [Trust tests](../../apps/api/test/trust-routes.test.ts) · [Route tests](../../apps/api/test/route-contract.test.ts)
- Local browser tests passed in two disposable Supabase environments. The first run covered administration governance, admin session links, trust access, events, F2.4 privacy, project work and polls (21). The second covered Founder authorization, organization/representative verification, A1A, media and group workflows (10). The environments were removed. These tests validate covered flows and role boundaries. Absence findings come from the source inventory and are not an exhaustive behavioral test of every RPC. [Founder release checks](../../apps/web/e2e/founder-release-audit.spec.ts) · [Founder representative checks](../../apps/web/e2e/founder-organization-verification.spec.ts) · [Unified audit checks](../../apps/web/e2e/unified-audit.spec.ts) · [Event checks](../../apps/web/e2e/events.spec.ts) · [Media checks](../../apps/web/e2e/feed-media.spec.ts)

Recommended delivery order is owner policy decisions, a read-only moderation center, account lifecycle, then scoped feature enforcement and broader case coverage. M1 ends with documentation and local verification. No application code, policy, permissions, migrations or hosted database were changed.
