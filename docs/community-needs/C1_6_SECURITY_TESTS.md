# C1.6 security tests

## Verification coverage

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

## Hosted rollout on November 24, 2026 (America/Chicago)

| Check | Verified result |
| --- | --- |
| Approved target and scope | AyiNou Supabase project `hcbxulyfmdmuyccgrujs` received only `20261124155500_c16_pilot_preparation.sql` from tested commit `13edbf60a7f6d2a2806ec5fd2ff187d85d859f98`. The working file and Git blob matched SHA-256 `bb0eb4482cce08588f943b588b55893ece8fb7517f5b9426fee12941eaf91d80`. |
| Preflight | Prior `main` and 135 hosted history entries matched the release. Fresh dry run showed the single approved change, no seeds or roles, four empty C1.1–C1.4 fixture gates and no existing reviewer grants or associations. |
| History and records | All 135 prior entries and 51 record count and fingerprint pairs matched. The new entry brings the total to 136 with zero pending. |
| Authorization | All 256 existing RLS/ACL entries, 29 policies and 131 triggers matched. Of 743 prior routines, 734 were unchanged. The nine designated native routines match the tested new bodies and retain their ACL and execution context. All five new relations have RLS and no direct app-role privileges. The 17 new routine bodies match the tested release, and only the two service RPCs grant execute to `service_role` outside ownership. |
| Activation and custody | Zero C1.6 policies, enrollments, attestations, case markers or audit events. The four disposable fixture gates remain empty. The existing community need submission capability and current policies are preserved. |
| Connected HTTP probes | All 27 read-only checks passed on the final local API and stable local web against the updated hosted database. They included health and public reads, unauthorized guest administration and membership, protected page redirects, and disabled responses on intake, review, publication and association routes. |
| Hosted application | No approved web/API release target and procedure could be verified. Hosting remains separate from the verified database rollout and connected-local application checks. |

## Connected browser observations

J0SC0X opened the existing private admin workspace after owner-entered MFA. Pilot settings showed Ouest, **Disabled · Not configured**, a proposed limit of 10 submissions, pending readiness, review operations, and empty history. Moderation overview and Project reviews still opened. Test02 received the existing Page not found response for the Pilot administration URL, saw closed Community Needs intake, and could access the joined Ouest member directory and Projects. Browser work used the matching local application against hosted Supabase, with no real pilot decisions or records created.

The pilot browser case and ten adjacent regressions passed across disposable runs. The final local checks passed 66 unit and API tests, type checking, lint, shared contracts, localization, both build configurations, and five standards tests. Standards covered 54 review records, 143 route contracts and 74 migration reviews.
