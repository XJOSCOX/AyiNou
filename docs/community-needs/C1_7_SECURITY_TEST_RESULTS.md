# C1.7 security and regression verification

## Disposable validation

The pilot regression uses disposable Supabase, synthetic users and generated secrets. It checks missing, verified, expired and revoked evidence, profile attribution, exact release matching and omission of evidence references. It also covers session/workspace-bound Founder access, private grants, ordinary denial, scoped grants and enrollment, conflicting receipts and independent review, capacity and expiry, emergency pause/resumption, safe access during pause, exact publication/association and audit counts. The Founder UI is exercised in Haitian Creole, French, English and Spanish, including narrow layouts.

The combined disposable run passed 20 of 21 tests across Community Needs, communities, projects, moderation, appeals, legal and privacy. The lifecycle scenario expecting a sole Administrator ran after other suites that add Administrators. The snapshot reported the resulting multi-Administrator state. All three privacy lifecycle scenarios passed when rerun in a fresh disposable database.

All 66 local unit and contract-adjacent tests passed, including 57 API tests. Shared contracts, the localization inventory, type checking, ESLint and engineering standards passed. Production builds with placeholder HTTPS origins and the connected localhost build passed. The isolated recovery fixture also passed on the C1.7 schema. No GitHub Actions were used for validation.

## Connected browser

Test02 saw the closed intake state, opened Ouest discussion and the listed-member directory, and reached the Projects listing and work navigation. Direct access to Pilot administration rendered Page not found. Founder J0SC0X opened Platform Administration and the prior Pilot view with the owner’s session. It showed Disabled · Not configured, Ouest, all operational requirements pending, and the monitoring section. After the hosted migration and connected local production rebuild, Founder J0SC0X saw the same Ouest-only disabled state, six missing attestations, unavailable runtime and policy releases, the coverage gap, empty monitoring and history, and no activation action. Moderation Center and its navigation opened in the same Founder workspace. Browser actions were read-only. The language and narrow layout sweep ran on disposable data.

## Rollout evidence

Target `hcbxulyfmdmuyccgrujs`. Migration `20261124155600_c17_pilot_operational_readiness.sql`. SHA-256 `56fc319766fced5ea2141ceda6ba3bbda027c8af68e372daa5a1890d7370a7e0`. Preflight confirmed this was the sole pending migration, with no seeds or roles, 136 applied, 51 existing record fingerprints, 261 schema relations, 29 RLS policies, 760 SQL routines and 131 triggers. All four fixture gates and five pilot tables were empty. Existing review grants, project links and Community Needs project-link events and notices were zero. The preflight checked all ten department community rows.

The implementation and deployment revision was 6f6db0ff0adcc4bb09eb4012f5f4c48f785b6626. The exact pending migration was applied after Founder approval and a second clean plan. Postflight confirmed **137 applied, zero pending**; all 136 earlier history entries, 51 data fingerprints, 261 relations, 29 policies and 131 triggers matched. Only private.c16_dashboard(text, integer, text) changed among 760 routines. Its body matched SHA-256 d55c53b896d520fe628de79f096ca162672d4799c187a93137a9380bedbdbbac. Its privileges, owner/security attributes and settings matched. The existing service-only RPC and internal helper boundary, all 17 C1.1–C1.4 private tables and five pilot tables retained their access controls. All four fixture gates and five pilot tables stayed empty. No hosted grants, enrollments, cases, attestations or readiness decisions were created. No application was deployed to hosted infrastructure.

After application of the migration, 27 connected local health, public reads, protected route and guest probes passed against hosted Supabase. Intake, review, publication and association returned closed responses. Neither local browser account attempted to create a case or change a setting.
