# C1.7 security and regression verification

## Disposable validation

The pilot regression uses disposable Supabase, synthetic users and generated secrets. It checks missing, verified, expired and revoked evidence, profile attribution, exact release matching and omission of evidence references. It also covers session/workspace-bound Founder access, private grants, ordinary denial, scoped grants and enrollment, conflicting receipts and independent review, capacity and expiry, emergency pause/resumption, safe access during pause, exact publication/association and audit counts. The Founder UI is exercised in Haitian Creole, French, English and Spanish, including narrow layouts.

The combined disposable run passed 20 of 21 tests across Community Needs, communities, projects, moderation, appeals, legal and privacy. The lifecycle scenario expecting a sole Administrator ran after other suites that add Administrators. The snapshot reported the resulting multi-Administrator state. All three privacy lifecycle scenarios passed when rerun in a fresh disposable database.

## Connected browser

Test02 saw the closed intake state, opened Ouest discussion and the listed-member directory, and reached the Projects listing and work navigation. Direct access to Pilot administration rendered Page not found. Founder J0SC0X opened Platform Administration and the prior Pilot view with the owner’s session. It showed Disabled · Not configured, Ouest, all operational requirements pending, and the monitoring section. Final build and hosted evidence follow in the rollout record.

## Rollout evidence

Target `hcbxulyfmdmuyccgrujs`. Migration `20261124155600_c17_pilot_operational_readiness.sql`. SHA-256 `56fc319766fced5ea2141ceda6ba3bbda027c8af68e372daa5a1890d7370a7e0`. Preflight confirmed this was the sole pending migration, with no seeds or roles, 136 applied, 51 existing record fingerprints, 261 schema relations, 29 RLS policies, 760 SQL routines and 131 triggers. All four fixture gates and five pilot tables were empty. Existing review grants, project links and Community Needs project-link events and notices were zero. The preflight checked all ten department community rows.
