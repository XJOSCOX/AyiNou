# R2.3 Member onboarding and profiles

## Scope

Platform Settings → Member Onboarding & Profiles is restricted to the active Founder with fresh MFA and the original private workspace. Onboarding uses the existing four saved stages for membership and language, location, profile details and interests. R2.3 identifies new individual accounts at Auth creation. Existing accounts retain their saved steps and organization signup remains on its existing flow.

| Onboarding setting | Default |
| --- | --- |
| Member onboarding | ON |
| Require completion before member features | OFF |
| Require country | OFF |
| Require Haitian department for Haitian residents | OFF |
| Require interests | OFF |
| Require preferred language | ON |
| Permit skipping optional steps | ON |
| Show progress | ON |

| Member profile setting | Default |
| --- | --- |
| Member profiles | ON |
| Public visibility available | ON |
| Private profile presentation available | ON |
| Editing | ON |
| Pictures | ON |
| Biographies | ON |
| Public country, Haitian department and interests | ON, with individual opt-ins initially OFF |

## Data model and API

The additive migration adds a typed policy revision, atomic policy events and a private new-account cohort. The authenticated owner profile returns current policy and staged progress. The existing profile write API remains the normal mutation. Two Founder routes read and update the policy. SQL enforces required details and protects raw public profile columns when content is suppressed.

## Permissions and audit

The Founder API and database recheck current authorization, recent MFA and original workspace scope. Writes validate the revision and record the actor, values, timestamp and written reason. The existing Policy changes section displays the saved revisions. Session, security, identity, legal and organization checks retain their own boundaries.

## Privacy and lifecycle

Public field controls combine the current policy with each member’s explicit consent and existing discoverability gate. Country, department and interests default to unshared for existing and new accounts. Turning off a policy masks data without clearing it. When private presentation is unavailable, the owner can still access their stored data and withdraw public visibility. No policy update makes a private profile public. Existing member data retention and deletion continue to apply.

## Localization and accessibility

Haitian Creole, French, English and Spanish use localized policy controls and errors. The existing editor, responsive layouts, native controls, progress semantics and theme tokens are reused.

## Reliability and recovery

Each completed form stage persists through the existing transaction. When completion is optional, members can save the current valid step and return later. Skipping an optional stage preserves existing values. When onboarding is required, member feature routes and SQL gates require completion for new individual accounts. Login, security and privacy access, and organization onboarding remain reachable. A policy can be restored through a new audited revision.

## Validation and CI

Disposable tests cover version conflicts, individual onboarding, owner profile editing, public opt-in, policy changes, visibility and authorization. Existing signup, username and organization workflows are included in local regression testing. The 103-test local Chromium suite, 53 API tests, typecheck, lint, shared contracts, four-language parity, both production builds, engineering standards and legal checks passed. The two development immediate-signup cases and four final settings-navigation and onboarding checks also passed.

## Documentation and operations

Use Platform Settings → Member Onboarding & Profiles to change settings. Requirements apply to their respective saved stages. A department requirement applies to residents of Haiti. A policy switch can hide public content or make editing unavailable; existing values and consent choices stay stored.

## Remaining blockers

Hosted development project `hcbxulyfmdmuyccgrujs` applied the exact R2.3 migration from `bf7f9524ce6f59174808c075b7f4457271e106fe`. The SHA-256 was `78b977426cf97e56c0345720cd8b5fc64b811f57433f603a175132096685ed0b`. The fresh hosted dry run listed one migration, zero seeds and zero roles.

Postflight confirmed 93 applied migrations and zero pending, the expected 17 defaults at revision 1, RLS on all three new private tables and restricted RPC grants. The five existing accounts and profiles and the existing organization intent were preserved. No existing member was enrolled retroactively or opted into public sharing. The restarted local app returned the homepage, registration policy and public feed successfully, and denied anonymous policy administration. Hosted development verification is complete.
