# C1.5 test and rollout results

## Connected browser

Test02 opened My community needs in English, Haitian Creole, French and Spanish. All four showed closed intake at 390 pixels without document overflow. The desktop view passed at 1440 pixels. Test02 could open the joined Ouest room and listed members, Projects and Manage proposals, while the association workspace displayed unavailable access.

J0SC0X used the owner-assisted existing MFA session. Platform Administration opened to Moderation overview, with the existing moderation subtabs. Project reviews opened, My community needs showed closed intake, and the association workspace displayed unavailable access. Browser actions used the local AyiNou application connected to hosted Supabase. No hosted Community Needs records or privileges were created.

## Disposable and local validation

The pre-change baseline passed nine browser cases. The final run passed all 19 selected disposable browser cases, including the continuous C1.1–C1.4 journey, independent challenges, Projects, Ouest, moderation and policy, enforcement appeals, organizations, legal controls and synthetic privacy lifecycle. The same run passed 16 pgTAP assertions across C1.1 and C1.5, covering the four direct RPC gates, 17 private relations and effective privileges. The integrated case also checked stale MFA, expired workspace, revoked grant and membership, competing roles, receipt replay, native publication invalidation and a 22-result two-page directory.

Type checking, lint, 64 unit and API tests, shared-contract and locale checks, both production builds and five standards tests passed. Standards reviewed 53 registered features, 141 new or changed route contracts and 73 migration reviews. The prior cursor was confirmed to mismatch the returned ID by inspection of the effective function. The 22-result regression exercises the corrected SQL. No GitHub Actions run was used.

## Legacy SQL fixture

The existing Phase 1A profile fixture sets a subject claim without the live provider session now required by the profile RPC. It is outside the C1.5 repair. The separate Community Needs SQL checks and native browser sign-in tests use their current authorization model. [C1.1 prior evidence](C1_1_IMPLEMENTATION_REPORT.md)
