# C1.5 test and rollout results

## Connected browser

Test02 opened My community needs in English, Haitian Creole, French and Spanish. All four showed closed intake at 390 pixels without document overflow. The desktop view passed at 1440 pixels. Test02 could open the joined Ouest room and listed members, Projects and Manage proposals, while the association workspace displayed unavailable access.

J0SC0X used the owner-assisted existing MFA session. Platform Administration opened to Moderation overview, with the existing moderation subtabs. Project reviews opened, My community needs showed closed intake, and the association workspace displayed unavailable access. Browser actions used the local AyiNou application connected to hosted Supabase. No hosted Community Needs records or privileges were created.

## Disposable and local validation

The pre-change baseline passed nine browser cases. The final run passed all 19 selected disposable browser cases, including the continuous C1.1–C1.4 journey, independent challenges, Projects, Ouest, moderation and policy, enforcement appeals, organizations, legal controls and synthetic privacy lifecycle. The same run passed 16 pgTAP assertions across C1.1 and C1.5, covering the four direct RPC gates, 17 private relations and effective privileges. The integrated case also checked stale MFA, expired workspace, revoked grant and membership, competing roles, receipt replay, native publication invalidation and a 22-result two-page directory.

Type checking, lint, 64 unit and API tests, shared-contract and locale checks, both production builds and five standards tests passed. Standards reviewed 53 registered features, 141 new or changed route contracts and 73 migration reviews. The prior cursor was confirmed to mismatch the returned ID by inspection of the effective function. The 22-result regression exercises the corrected SQL. No GitHub Actions run was used.

## Hosted rollout on November 24, 2026 (America/Chicago)

| Check | Verified result |
| --- | --- |
| Target and release | AyiNou Supabase project `hcbxulyfmdmuyccgrujs`. Owner separately approved `20261124155400_c15_link_directory_cursor.sql` from tested commit `9fad6cc1ffc01beed9caf8e0988c710a2c3e1707`. |
| Migration checksum | Working and Git-tracked bytes matched SHA-256 `12f29c2e7c796ece78b67dc19836abb399dfd31082fc4aa28a169ca0ec3a63b0`. The installed routine body matched SHA-256 `59cb3bab4d3d68c1f304e90cb744bc5120d5c734810b8129e52810854e4623dc`. |
| Preflight | Confirmed latest prior main, 134 recorded migrations, and the exact C1.5 file as the sole pending migration. The dry run had no seeds or roles. All 31 existing C1.1–C1.4 routine bodies matched the source before applying the cursor correction. |
| Postflight history | The 134 prior history entries matched. C1.5 brought the total to 135, with zero pending on a fresh dry run. |
| Preservation and authorization | All 51 existing record count and fingerprint pairs matched. All 256 relation ACL/RLS entries, 29 existing policies and 131 triggers matched. Of 743 prior routines, 742 matched exactly and only the approved cursor body changed. Its ACL and definer settings matched. The four API entry points remain service-only, all 17 feature relations retain RLS and no effective direct grants, and the existing submission capability is preserved. |
| Activation | All four fixture gates are empty. There are zero hosted reviewer grants, project associations, association events or notices. Real intake, triage and evidence review, publication, and association remain closed. |
| Connected app | All 26 read-only probes passed before and after the migration. They cover health, community and Projects reads, guest denials, protected page redirects, and private disabled responses for intake, review, publication, and association. The authenticated browser results above used the same application code against hosted Supabase. |
| Hosted web/API | The matching code passed the local and HTTPS builds. A separate authorized hosted web/API destination and procedure could not be verified. |


## Legacy SQL fixture

The existing Phase 1A profile fixture sets a subject claim without the live provider session now required by the profile RPC. It is outside the C1.5 repair. The separate Community Needs SQL checks and native browser sign-in tests use their current authorization model. [C1.1 prior evidence](C1_1_IMPLEMENTATION_REPORT.md)
