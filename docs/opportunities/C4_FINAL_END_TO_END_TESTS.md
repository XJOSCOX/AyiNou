# C4 final end-to-end verification

The test suites use distinct disposable accounts and the actual API and PostgreSQL authorization path.

- [Opportunity lifecycle](../../apps/web/e2e/opportunity-publication.spec.ts) integrates exact review, required assignment acceptance, organization and directory disclosure, native interest, external destination access, and Event registration. It exercises all seven types and department identifiers.
- [Mentorship lifecycle](../../apps/web/e2e/mentorship-coordination.spec.ts) exercises dual roles, request consent, participant-only views, capacity competing across two API instances, exact agreement amendments, objectives, session scheduling, progress, request pause, safety restriction, report triage and termination.
- [Founder readiness](../../apps/web/e2e/opportunity-activation.spec.ts) asserts ordinary-member and missing-MFA denial, the hosted-equivalent disabled state, and the four locales with wide and narrow layouts.
- [Discovery privacy and scale](../../apps/web/e2e/opportunity-discovery.spec.ts) exercises exact filters, independent private consent, skill import, saved and unavailable states, withdrawal, dismissal and bounded 100,000-opportunity search.

## Local results

The three focused C4.6 tests passed with both recovery rehearsals. A fresh stack passed the three opportunity and mentorship scale and preferences tests. The larger regression run passed 30 tests for accounts, sessions, C1, C2, C3 profiles, privacy, Events and C4 preparation. It exposed an old enforcement test that sent 26 capabilities to an endpoint limited to 25. The fixture now uses bounded batches while still asserting the full catalog, and the ten-case isolated rerun passed enforcement, organization authority, accounts, independent C2 review and Project Work.

The publication flow approved and published all seven opportunity types. End-to-end publication used Ouest and an international Canadian listing with an independently scoped reviewer. All ten Haitian department codes were exercised during draft handling, as distinct from full publication and reviewer staffing in every department. The Event route was opened from a publication in the applicant’s browser, and the ordinary RSVP endpoint accepted the event registration. Mentorship rehearsal exercised private roles, accepted requests, exact mutual agreement, progress, safety pause and termination.

Local build, typecheck, lint, shared contracts, route inventory, four-language translations, unit/API checks, engineering standards and npm dependency audit passed. The audit reported zero known vulnerabilities. The GitHub commits skip routine Actions as requested. The combined C3 run passed four tests and failed one exact-result assertion after a preceding suite added matching opportunities to the same database. All three matching tests passed on a fresh disposable stack, including scope, privacy and the 100,000-profile regression. Both C3 activation tests passed in the combined run.

## Connected local application after hosted migration

- J0SC0X opened Opportunity settings after owner-assisted MFA. All ten stages and their Enable controls were disabled. The publication disclosure showed the draft dependency, configuration revisions, required independent reviewer staffing, missing privacy approval and missing authorized release. The two domain pause controls and the global pause control were disabled, and activation history was empty.
- Test02, which carries a Founder Verified identity badge, could open Opportunities and Mentorship and saw closed discovery, profile intake, matching, requests and coordination. Direct navigation to Founder Opportunity settings returned Page not found. Disposable role and MFA tests covered authorization denials. No hosted mutation was attempted.
- Local API health, the community directory, Projects, Impact and the organization opportunity route responded successfully. Guest reads of activation, personalized opportunity discovery and mentorship coordination returned HTTP 401 with private no-store and noindex headers. These checks used local Next.js and Fastify connected to hosted Supabase.
