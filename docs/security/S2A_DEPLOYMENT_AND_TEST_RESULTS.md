# S2A deployment and test results

**COMPLETE AND DEPLOYED — hosted development database.** Baseline `71231a4d4fe46e3c9a96917d6abf2f3d7876676c` on `main`. Release `395b94ccab2e8c400a5188b8e4fb47915dfe9e86` passed the [three required GitHub Actions jobs](https://github.com/XJOSCOX/AyiNou/actions/runs/44996378458).

## Hosted development

The owner explicitly approved applying only `20261121142000_s2a_session_policy.sql` to project `hcbxulyfmdmuyccgrujs`. The Supabase CLI labels this development-use project `production`. The fresh preflight matched remote main, SQL blob `06c85aaef0435a50473b48a7b968cfab699cb079`, 76 applied versions, zero remote-only versions and exactly one pending migration. The dry run included no seeds or role changes. The CLI applied the single migration. Postflight confirmed **77 applied, zero pending and zero remote-only versions**, and the final dry run reported the database up to date.

- Verified RLS on the three new private tables and zero direct table privileges for application roles. Verified the authenticated own-session and service-only audit grants, four enabled hooks, four restrictive policies, and the live-session cutoff and provider deadline checks used by Fastify and PostgreSQL.
- Confirmed one trusted Founder with verified TOTP and the existing Founder and Administrator authority projection. The private Founder setup API remained unavailable. The installed Founder-direct appointment and legacy independent-review paths remain intact. The effective ordinary verification RPC chain still requires two distinct, eligible, assigned and unconflicted reviewers.
- Matched preflight and postflight aggregate fingerprints for the two existing accounts and profiles. Preserved role assignments, verification applications and records, platform and governance audit counts, and three Storage objects. Founder Verified, Early Partner enrollment, legal publication and real privacy processing stayed closed. No reset, existing account deletion, hosted Auth setting change or recovery activation occurred.
- Tested the matching local Fastify and production-built Next.js against hosted Supabase with one synthetic ordinary account. Verified anonymous preference denial, password sign-in, 30-day opt-in, browser cookie persistence, refresh rotation with a fixed deadline, no privileged authority, and API denial after sign-out. The first fixture attempt exposed a difference in hosted U1 provisioning. Supplying its required unique username allowed the live checks to pass. Removed the temporary account and reconfirmed the baseline. Exact deadline transitions, real TOTP enrollment and appointment writes ran in disposable Supabase.

## Validation

The full local disposable suite passed 83 Chromium cases. Separate runs passed two immediate-signup cases, nine targeted recovery, organization and session cases on the final route changes, and seven targeted cases after stabilizing the Founder fixture. Linux release CI passed 41 Chromium smoke cases and both immediate-signup cases. The preceding run caught an all-numeric random Founder fixture that intentionally matched the reserved username rule. The fixture now uses a fixed alphabetic segment, and the production username policy was left intact.

Typecheck, lint, 50 API tests, seven client tests, translation parity in all four languages, engineering standards, Legal Center, frozen-source validation and both production builds passed. Dependency audit reported zero vulnerabilities. The disposable session matrix checks all four deadlines one microsecond before, at and after expiry. It also covers independent browser sessions, raw API and SQL authorization, Founder suspension, Administrator promotion and revocation, F1/F1.1 compatibility, password recovery, both themes, and keyboard use.

## Application deployment and operational limits

The hosted deployment applied the database migration only. The matching Fastify code and Next.js build were verified locally against that database. No hosted Fastify or Next.js application release occurred.

Supabase can still rotate tokens after the Ayinou deadline. Ayinou's protected boundaries deny those sessions. Session inventory, per-device controls and the shared private workflow router remain planned for S2B. Restricted feature activation and public launch require their own approvals.
