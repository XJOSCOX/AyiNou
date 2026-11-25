# C1.5 security findings

The hosted review used effective PostgreSQL definitions and grants, aggregate evidence and the connected application. Mutations and denial scenarios that require synthetic data ran on disposable Supabase. These findings cover the Community Needs workflow and its named integration points.

| Boundary | Observed implementation and exercise |
| --- | --- |
| Account and community | Caller identity comes from verified bearer session. Authors read their own need and correction history. Same-community peers lack access to private cases. An unrelated community member cannot read the Ouest publication, and revoked membership removes protected publication and association access on the next read. |
| Staff and Founder | Leadership assigns in the existing private workspace. Evidence review, publication and association decisions depend on the live assignment and independent authority. Administrator projections omit original evidence. Reviewers may use only their bound verification workspace with recent MFA. Expired workspace, missing MFA, mismatched workspace and revoked grant tests deny an association decision. |
| Conflict and assignment | The C1.2 community scope and conflicts apply to the assigned reviewer. Triage and evidence reviewers cannot approve publication in their originating case. C1.4 also excludes the publication approver, project reviewer, conflicting project team/ownership roles and the two consent parties. Review intake and later lanes expose only their necessary projections. |
| Direct database access | RLS on all 17 phase tables, with no effective direct table or column privileges for anonymous, authenticated, authenticator or service roles. Four API RPCs grant execution to the service role outside ownership. Scoped SQL independently checks the session and applicable gates. |
| Restrictions and lifecycle | Existing account moderation and feature restrictions continue to apply to relevant operations. Account and membership denial, cross-community isolation, and native project scope are preserved by the pagination repair. Public project detail never carries association metadata for a viewer without community access. |
| Replay, conflicts and audit | Exact revisions and command receipts protect corrections, review decisions and associations. Concurrent repeat requests return the same result and leave one decision event. Revocation preserves the prior decisions. |
| Data minimization | Private source references and reviewer notes do not appear in the approved snapshot, discussion reference, project projection or notice preview. Author attribution defaults private and withdrawal removes the attribution from fresh reads. A written association purpose is available within its scoped workflow. Existing filters are a guard for common identifying patterns and a human reviewer must still assess the text. |

## Defect corrected

The publication side of the linked projects list originally sorted and filtered by the association UUID while the API paginated with the returned project UUID. Those values are distinct. The second page could skip or repeat valid links after the 20-item page boundary. The repair uses the existing projected project UUID throughout that branch. The disposable regression uses 22 eligible results with separate deterministic UUID ranges and checks two pages, coverage, ordering and exhaustion. Other C1.4 lanes keep their existing order and privacy rules.

## Residual risks

A real cohort, reviewer staffing, published privacy/process terms, whole-case rights handling and restore reconciliation have no approved operational procedure. Private original evidence and reviewer notes require a reviewed policy and controlled support path before use. Completed security exercises on disposable accounts do not confer access on any live account. [Privacy and retention](C1_5_PRIVACY_AND_RETENTION_GAPS.md) · [Test results](C1_5_TEST_RESULTS.md)
