# C4.3. Mentor and mentee profiles

## Scope

C4.3 adds optional, private profile preferences for adult mentors and mentees. A member may configure either role, keep both with separate consent and availability, or participate in neither. Account settings and Opportunities link to the same page. Independent preparation is available in the existing Founder Opportunity settings workspace.

## Data model and API

Five private RLS tables hold the disposable gate, preparation settings, role profiles, versioned C3 skill selections and administrative receipts. The profiles link to existing member IDs and have stable role-specific IDs. Only the backend service can execute the SQL RPC. Fastify exposes self-only reads, catalog search, role commands and the Founder preparation lane. The topic vocabulary describes mentorship aims independently of C3 skill proficiency. See [mentorship policy](C4_3_MENTORSHIP_POLICY.md).

## Permissions and audit

The API derives the actor from a verified session. PostgreSQL checks the session, onboarding, standing and, for mentors, the current reviewed identity or eligible Founder Verified provenance. The Founder lane separately checks current Founder authority, recent MFA and the original private workspace. Founder history stores the reason, actor, workspace, revision and configuration with the mutation. Role writes retain a current receipt and current consent timestamps. Reads have no new durable event. See [security tests](C4_3_SECURITY_TESTS.md).

## Privacy and lifecycle

Role data has no recipient projection. Recommendations, eligible discovery and requests each require their own opt-in. Future public disclosure remains unavailable. Safe owner withdrawal clears role consent and pauses participation without changing the other role. Existing profile privacy and account safety remain authoritative. See [privacy and safeguarding](C4_3_PRIVACY_AND_SAFEGUARDING.md).

## Localization and accessibility

The member and Founder views use existing AyiNou navigation, design tokens, status panels and four languages. Inputs use native controls, fieldsets and labels. The member page uses the full-width opportunity header and a right-aligned Account settings link. Settings, opportunity navigation, and save feedback are available by keyboard.

## Reliability and recovery

Private writes serialize with existing session locking and enforce expected versions. Configuration and catalog changes serialize with profile saves. The current role receipt supports exact immediate retries, and older writes fail revision checks. Administrative receipts retain the settings revision for the original workspace. Account recovery uses existing processes. Correct forward while all live stages are closed.

## Validation and CI

The disposable suite passed member setup, independent role and consent lifecycles, cross-account denials, catalog retirement, import, concurrent retries, Founder preparation and four-language browser coverage at desktop and mobile widths. The existing Founder Verified issuance test also passed with a C4.3 mentor save. Type checking, lint, unit, shared-contract, localization and engineering-standard checks passed. The optimized local web and API builds passed, and the dependency audit found zero vulnerabilities. Routine GitHub Actions were skipped as requested.

The disposable benchmark used 500 unrelated profiles, a target role with 12 selected skills, and four sequential authenticated samples per operation. In the final run, private reads took 16–20 ms with a median of 18 ms. Saves took 20–24 ms with a median of 21 ms. The owner response was 4,465 JSON bytes. These local samples do not establish hosted performance or sustained capacity.

Verification caught a suspended-account test expecting 403 where the existing session checks correctly return 401. The benchmark fixture needed the disposable invitation marker required by native signup guards. The generated route inventory also required Fastify’s HEAD companion hook. The tests, fixture, and inventory were corrected without changing the approved migration. The combined C4.1 and C4.2 regression run reused C4.2 data beneath a C4.1 clean-fixture assertion. The C4.1 rerun passed in a fresh database. Read-only connected checks also caught missing private headers on the new nested page. The web route now uses the established opportunities header pattern, with a regression assertion on guest redirects.

## Documentation and operations

The proposed migration is `20261125141000_c43_mentorship_profiles.sql` for hosted AyiNou `hcbxulyfmdmuyccgrujs`. The exact authorized SHA-256 is `cee018c02a79ce5a24be1d7646c95ffafd5243d80ee3d221a985eb7d56c21faa`. The preflight identified it as the only pending migration and captured 137 data fingerprints, 325 relations, 884 routines, 29 RLS policies and 235 triggers across 151 applied migrations. Existing C1–C4.2 gates were closed.

The migration was applied from `ad000d01a5248505690c4beb8bf7db4750572576`. Hosted postflight recorded 152 migrations applied and zero pending. All 137 preexisting fingerprints matched, including the volunteer profile, consent and catalog data and C4.1–C4.2 opportunities and interest. All five new tables were empty and protected by RLS, including no direct table or column grants to application roles. The seven new routine bodies matched the approved migration. Application roles cannot execute private helpers, and only the backend service can execute the new RPC among application roles. Existing RLS, routine grants, triggers and closed activation states were preserved.

The rebuilt local Next.js and Fastify application passed 71 read-only HTTP checks against hosted AyiNou. In the connected browser, Test02 opened the private profile page from Account settings, saw closed intake without setup actions and was denied Founder administration. J0SC0X opened the original Founder workspace and inspected eligibility, capacity, safeguarding and readiness options while activation remained closed. No hosted mentorship records were created. Next.js and Fastify remain local.

## Remaining blockers

Operational safeguarding, an approved adult eligibility process, staffing and moderation, privacy and retention decisions, and an independent activation decision remain required. C4.4 owns matching, participant discovery, requests, capacity enforcement for relationships and relationship management. See [matching contract](C4_3_MATCHING_CONTRACT.md).
