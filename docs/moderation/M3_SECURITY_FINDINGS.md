# M3 security findings

| Severity | Findings |
| --- | ---: |
| Critical | 0 |
| High | 1 |
| Medium | 0 |
| Low | 0 |

## M3-01 · Project restrictions and newer proposal transitions

**Severity:** High. **Status:** Code corrected. Rollout status is recorded with the [test results](M3_TEST_RESULTS.md).

The established project capability guard covers initial submission on the project row. Later project code introduced a pending review state and a distinct publication field. Those two ordinary mutations did not share the project submission guard. The source trace compared the effective status-based guard with the current review and directory writers. No hosted mutation was used to establish the finding.

The correction checks the original actor and project scope when submission or publication enters the existing project audit transaction. Denial rolls back the project state and the new audit event. The prior public revision, independent review, owner scope, version checks and authorized removal from the directory retain their existing behavior. The disposable regression asserts the two applicable denials and the successful authorized transitions once the fixture restriction is released.

[Original project guard](../../supabase/migrations/20261123133000_m23_feature_restrictions.sql#L558) · [Effective submission writer](../../supabase/migrations/20261123138000_project_reapproval_and_publication.sql#L157) · [Publication writer](../../supabase/migrations/20261123138000_project_reapproval_and_publication.sql#L434) · [Correction](../../supabase/migrations/20261124153000_m3_project_enforcement.sql) · [Regression](../../apps/web/e2e/founder-identity.spec.ts#L1357)
