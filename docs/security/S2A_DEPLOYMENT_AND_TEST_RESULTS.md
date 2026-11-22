# S2A deployment and test results

Baseline `71231a4d4fe46e3c9a96917d6abf2f3d7876676c` on `main`. Required migration `20261121142000_s2a_session_policy.sql`.

## Hosted development

Read-only preflight identified Ayinou project `hcbxulyfmdmuyccgrujs`, 76 applied migrations and zero remote-only versions. The dry run listed the single S2A migration. The Supabase environment label for this development-use project is `production`. This preflight made no changes to the project.

## Validation

The full disposable suite passed 83 Chromium cases. The session matrix exercises the four exact deadlines before, at and after expiry. Coverage also includes refresh rotation, remembered and replacement browser sessions, independent devices, revoked sessions, direct Fastify and PostgreSQL access, F1/F1.1 promotion and legacy approval, MFA, password recovery, four languages, both themes and keyboard access. Typecheck, lint, both builds, 50 API tests, seven client tests, translation parity, engineering standards, Legal Center and frozen-source checks passed. The dependency audit reported zero vulnerabilities. Final release CI and hosted postflight are recorded separately after the rollout.

## Operational limits

The provider can still rotate a token for a session outside Ayinou's policy. Ayinou's protected boundaries deny it. Hosted Auth settings remain independently managed. Session inventory and targeted device controls are planned for S2B. Restricted feature activation and public launch require their own approvals.
