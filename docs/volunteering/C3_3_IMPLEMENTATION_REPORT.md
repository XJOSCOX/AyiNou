# C3.3 Intelligent Volunteer Matching

## Scope

C3.3 adds private recommendations from **Settings → Volunteer profile** and **Project Work**, opportunity-scoped candidate discovery under the native Volunteers tab, and matching preparation under **Platform Settings → Volunteer settings**. It uses the existing C3.1 private profile and consents, C3.2 published requirement revisions, and Project Work permissions and application flow. All operational matching remains behind empty hosted fixture gates.

## Data model and API

The database reads stable catalog codes and the exact current published opportunity revision. It writes only protected configuration history, an owner-controlled matching pause and version-specific dismissals. Members get opportunity metadata and explanations. Organizers get public display name, handle and compatibility class for a specific authorized opportunity. Private summaries, weekly time ranges, languages and experience are never returned via discovery. See [matching policy](C3_3_MATCHING_POLICY.md).

## Permissions and audit

Fastify verifies the actor and session, bounds inputs and applies the shared read budget. PostgreSQL rechecks account, onboarding, blocking, native recruitment/application scope, current publication and availability. One RPC is service-only. All added tables use RLS and have no direct app-role grants. Founder settings require recognized authority, current MFA and the original administrator workspace. Changes store immutable versions, reasons, actors, workspaces and idempotency receipts. Owner pause and dismissal updates are transactional, and discoveries and recommendations do not create durable private profile projections.

## Privacy and lifecycle

Matching and organizer discovery use separate consent purposes. Skill display consent does not enable either. A self-recommendation remains private even if the member chooses a private social profile. Organizer discovery respects the member's native discoverability, visibility and private mode. See [privacy and fairness](C3_3_PRIVACY_AND_FAIRNESS.md).

## Localization and accessibility

English, Haitian Creole, French and Spanish cover classifications, explanations, filters, readiness, reasons, and closed states. The interface uses the existing shell, design tokens, control labels, keyboard-accessible disclosures, status feedback, and light and dark themes.

## Reliability and recovery

Bounded indexed cohorts, encrypted session-bound cursors and live eligibility checks replace per-member caches. A database response is authorized against its statement snapshot. The next request reflects committed consent, availability and eligibility changes. No polling, external inference, or background state is required. Follow the existing forward-repair process if a deployment defect is found. See [performance](C3_3_PERFORMANCE_REPORT.md).

## Validation and CI

All 25 disposable browser and integration scenarios passed, covering C3.3 matching and Founder configuration, C3.1 and C3.2, native Project Work, C2 outcome review and publication, Impact, and C1 association flows across all ten departments. Enabled matching used synthetic data only. The suite exercised independent consent, scoped output, privacy and blocks, account restrictions, eligibility changes, full opportunities, cursor binding, and the 50,000-profile benchmark. Responsive checks used English at desktop width and Haitian Creole, French, and Spanish at narrow width, with a separate dark-theme check.

Initial runs caught an ambiguous SQL column and incomplete visibility in disposable seed profiles. Both were corrected. The result-producing statements now recheck the live publication and eligibility before disclosure to prevent authorization from relying on an earlier query. The affected groups passed on the tested release.

All 59 API tests, seven client tests, two web tests, shared contracts, localization audit, type checking, lint, engineering standards and local and production-mode builds passed. No routine GitHub Actions ran. See [security tests](C3_3_SECURITY_TESTS.md).

## Hosted database rollout

- Target AyiNou `hcbxulyfmdmuyccgrujs`, identified by the CLI as production.
- Tested implementation `34e181c50b6e20b0f9388beb610676eb6fe2a57f`.
- Approved migration `20261125132000_c33_volunteer_matching.sql`.
- Verified SHA-256 `cbfecbe9df8d81874e3d06f1616219ca91ed0b38a89d3718ac3534cdc10dee13`.
- A fresh preflight found 146 applied migrations and one pending migration. The apply receipt listed C3.3 alone, with no seeds or role changes. Postflight found 147 applied and zero pending.
- Read-only postflight preserved all 105 data fingerprints, including member accounts, projects, opportunities, native applications, C3.1 profiles and consent, and C3.2 requirements. Previously installed relation, routine, RLS policy and trigger fingerprints matched. The verified additions were four relations, seven routines and three indexes.
- All four new tables have RLS and deny direct table and column access to anonymous, authenticated, authenticator and service roles. The seven installed function bodies matched the migration. The only app-executable command is the service-only, session-bound matching RPC.
- C1, C2 and C3 fixture gates stayed closed. No hosted matching settings, pauses, dismissals, or operational records were created.

## Connected local application

All 51 connected read-only HTTP checks passed after migration. They covered public reads, protected access and no-store responses, and the closed C1 and C2 routes. Test02’s connected browser opened Volunteer profile → Recommended opportunities, saw the closed notice, opened Project Work, and was denied the Founder settings URL. J0SC0X opened the private Platform Administration workspace and expanded the matching configuration. It showed readiness at version zero, all ten departments, recorded-reason and explicit-confirmation controls, and a closed matching and discovery notice. No hosted member, project, or configuration records were changed in the browser. Next.js and Fastify ran on localhost against hosted Supabase.

## Documentation and operations

The [performance report](C3_3_PERFORMANCE_REPORT.md) records exact local timings and their limits. Matching preparation uses the existing Volunteer settings workspace and requires independent authorization before any live launch.

## Remaining blockers

Independent adult eligibility, regulated placement, safeguarding and privacy lifecycle approval remain launch prerequisites. C3.4 coordination would need a separately approved purpose, scoped sharing, explicit human decisions, eligibility rechecks and no automatic invitation or role assignment.
