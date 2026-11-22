# FV-FINAL deployment and test evidence

- Starting main commit `ca8afc845b6e92d4dc3f2ffc6cb5032b9c92c442`.
- Fresh hosted preflight on development project `hcbxulyfmdmuyccgrujs` matched 82 applied migrations and zero pending before creating the FV-FINAL migration.
- The candidate migration is `20261121147000_fv_final_development_policy.sql`. It creates no approved development policies, cohorts, appeals or grants.
- The candidate SHA-256 is `f5e9553eeda096b9701feb733d0ac92567aeac190d8caa950cc19608612251f0` over the UTF-8/LF SQL file. The hosted dry run reported it as the sole pending migration and listed no seeds or roles.
- Local API suite, client checks, shared contract validation, all four translations, both production builds, engineering standards, Legal L5 integrity and Legal Center checks passed. The dependency audit reported zero known vulnerabilities.
- The full local Chromium regression passed 97 cases, including A1A, privacy and ballot isolation, existing onboarding, session controls, and Founder workflows. The live-proof and issuance functions both remained constant false in the read-only hosted catalog check.
- The focused Founder/O4/O7 rerun passed 13 cases using the final staged SQL, including out-of-cohort receipt rejection, private catalog grants and the independent appeal decision.
- Record final GitHub CI and exact deployment approval before applying. Record the resulting catalog, account preservation and API compatibility before closing development deployment.
- Operational activation is a separate approval and is closed at this checkpoint.
