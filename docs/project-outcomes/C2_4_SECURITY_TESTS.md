# C2.4 security tests

The disposable test entry point is [impact.spec.ts](../../apps/web/e2e/impact.spec.ts). Enabled-state fixtures are synthetic and local only. Hosted verification uses read-only catalog, migration-history, preservation and disabled-state checks.

| Boundary | Verification |
| --- | --- |
| Empty foundation | Eight RLS tables, no direct client table access, service-only RPC grants, empty activation gate, draft catalog entries. |
| Founder authority | No access for an ordinary session. The original admin workspace and current Founder permission are required. Verify idempotent identical commands and rejection of conflicting reuse. |
| Review authority | Case decisions require a department grant and originating reviewer workspace. Global approvals require a separate appointment. The test verifies wrong-workspace, wrong-department and unappointed denials. |
| Consent and method | Exact owner authorization, compatible units and reporting dates, supported versus adverse classifications, independent accepted mapping, and matching report consent digest. |
| Disclosure | Ten department selectors, three native ownership models, fixed year and sector, zero supported quantity, sparse groups and complementary national suppression. The projection excludes source identifiers, references and narrative. |
| Invalidation | Revoking C2.2 evidence hides the C2.4 report and restoring the release does not restore the old report. Previously sealed slices cannot be replaced. |
| Existing workflows | Run C1 association, C2.1 intake, C2.2 review, C2.3 publication and native Project Work regressions in disposable Supabase. |
| Browser and performance | Verify current public results, closed states in four languages at narrow and desktop widths, and measure the bounded SQL projection. Separate browser observations on the connected local application from automated fixture testing. |

Live activation also requires a separate assessment of larger reporting cohorts, re-identification risk, retention, staffing and recovery readiness.
