# C1.6 security tests

## Planned verification coverage

| Layer | Assertions |
| --- | --- |
| Existing data and governance | Verify the prior C1.1–C1.5 definitions and record fingerprints, then compare effective hosted routines and privileges read-only after any approved database migration. |
| Database grants | Private policy, evidence, cohort, case markers and history enforce RLS. Only the two new narrow functions execute under the service role. Previously protected routines preserve their ACLs and session checks. |
| Founder and release control | Missing MFA, ordinary account, mismatched workspace, stale revision, forged attestation, invalid scope and mismatched release cannot authorize pilot work. |
| Cohort, time and capacity | Cross-community requests fail. Ineligible and expired enrollment cannot create cases. Check concurrent configurations, idempotent receipts, atomic concurrent submissions and separate native per-member limits. |
| Stage and pause | Review assignments, publication and project association commands obey the independent stage boundaries and closed state. Corrections and authorized existing case access remain usable under pause. |
| Existing workflows | Run C1.1–C1.5, Teams/Projects, community rooms, moderation and independent appeal regressions on disposable infrastructure. Verify member and Founder connected views without authorizing any real role, cohort or case. |

## Release evidence

The final C1.6 browser test passed on disposable Supabase. It used native Founder preparation, explicit enrollment, role and workspace denials, independently provisioned synthetic attestations, and a protected activation. Concurrent capacity edits left one revision. Concurrent submissions left one accepted submission at a limit of one. Pausing preserved private reading and corrections, blocked new assignment, publication approval and association consent, permitted withdrawal of the association request, and required a separate resume. Disabling the association stage left an existing community publication readable. An expired enrollment could read its old private case and could not create a new one. The Founder dashboard passed in all four languages at desktop and narrow widths. The ten adjacent C1.1–C1.5, community, project, moderation and independent appeal regressions passed in the preceding run on the same migration. The C1.5 integration test also ran its 16 PostgreSQL assertions. C1.6 checks all five added RLS relations, direct privileges, stored history and the absence of fixture grants during the synthetic pilot.

API injection separately checked release mismatch, authentication before routing lookup, server-derived actor and workspace, and rejection of a client-supplied release. Type checking, unit/API and shared-contract checks, lint, both builds, and engineering standards were run locally. The legacy Phase 1A fixture still has its documented provider-session setup limitation. No hosted pilot mutation exercise was performed.
