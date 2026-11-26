# C4.1 Professional and Educational Opportunity Foundation

**Development status** COMPLETE AND DEPLOYED (hosted database only). Live processing remains closed.

## Scope

C4.1 adds private organization preparation for employment, internships, scholarships, professional training, educational programs, apprenticeships, and workshops. Current publication, public discovery, applicant processing, mentorship and recommendations are closed. Unpaid volunteering continues through native Project Work.

## Data model and API

The private schema separates stable opportunity identity from immutable numbered revisions and append-only Founder settings. Each revision records the exact snapshot, representative, actor and receipt. Existing organization identifiers, recognized memberships, department communities, ISO alpha-2 country representation and catalog skill code and version are reused. Lists and history use bounded cursors. See [opportunity foundation](C4_1_OPPORTUNITY_FOUNDATION.md).

## Permissions and audit

The organization workspace rechecks identity, account standing, current representative authority, organization status and narrow permissions. Future publication eligibility combines applicable organization category, existing independent verification and an active owner. Founder preparation rechecks recent MFA and the original private workspace. Draft and configuration writes commit with their receipts. See [publisher policy](C4_1_PUBLISHER_POLICY.md).

## Privacy and lifecycle

Private rows and unpublished versions have no direct application roles. Access is service-mediated and every response is private and no-store. No applicant records are collected. Draft withdrawal preserves history. If account deletion nulls an actor or representative reference, the opportunity history stays restricted and excludes the removed identity link. An organization holding preserved revisions requires an authorized retention and hold disposition before deletion.

## Localization and accessibility

English, Haitian Creole, French and Spanish use the existing language, typography and theme infrastructure. Forms use native controls, explicit labels and fieldsets. Preview renders external references as text, and includes exact revision data and recorded skill versions.

## Reliability and recovery

Configuration and draft changes serialize appropriately in PostgreSQL. Expected versions reject conflicting edits, and request receipts handle retries. Organization-scoped row locks serialize quotas and representative checks. Recovery uses a forward correction with gates closed and existing receipt history preserved.

## Validation and CI

Two C4.1 browser tests passed using disposable Supabase. They exercised organization and Founder paths, verification, scoped role access, duplicate and concurrent revisions, Haitian and international locations, three participation modes, closed gates, unsafe references, retired catalog skills and all four languages. Playwright covered desktop and 390 px layouts, keyboard controls, light and dark themes, active draft save and exact preview. Nine Events, Project Work and organization regressions, five Community Needs and outcome regressions and two volunteer activation regressions also passed. TypeScript, lint, shared contracts, translations, client-error tests, Fastify contract and unit tests, engineering standards, both Next.js builds and the dependency audit passed. The standards check covered 66 feature reviews, 213 route contracts and 88 migrations. The dependency audit reported zero vulnerabilities. Routine GitHub Actions were skipped.

The first disposable run caught incomplete verification provenance in the synthetic fixture and a browser assertion that reloaded before private-workspace navigation. Both were corrected. The second run found the organization draft page lacked the native MemberShell. Reusing that shell restored sidebar navigation, language and theme controls. The corrected suite passed. See [security tests](C4_1_SECURITY_TESTS.md).

## Documentation and operations

The authorized rollout applied `20261125135000_c41_professional_opportunities.sql` from tested main revision `13cebead96ae224476ce1068484aa04a183ef942` to hosted AyiNou Supabase `hcbxulyfmdmuyccgrujs`. The disk and Git SHA-256 matched the approved checksum `d08d17d784314b6bd07257b275ef5741f7a5013a41b7344dbf816c29d3feff86`. The fresh remote dry run listed that single migration, with 149 applied and no seeds or role changes.

Postflight verified 150 applied migrations and zero pending. All 126 existing row fingerprints matched, including member and organization records, custom-role assignments and audit, Events and Projects records, and C1–C3 records. The catalog recorded 318 relations, 869 routines, 29 existing RLS policies and 224 triggers. The four new relations have RLS and deny direct anonymous, authenticated, authenticator and service-role privileges. The new RPC is service-only among application roles. All seven new routine bodies matched the migration. The existing role catalog helper retained its grants and added only the two scoped draft permissions. The hosted C4.1 fixture, settings, opportunities and revisions are empty. C1–C3 gates remain closed.

Next.js and Fastify run on localhost against hosted Supabase. All 63 read-only connected probes passed. Test02 could open Institutions but was denied both Founder settings and the GoXEV draft workspace. J0SC0X opened the private Founder workspace and saw configuration available at revision 0, disabled live stages, and future stages marked Not implemented. GoXEV's management menu displayed the Opportunities link. Its private draft view denied the bootstrap Founder account under the existing representative identity rule. A read-only check confirmed current organization ownership and bootstrap provenance, with no independently reviewed identity record or issued Founder Verified personal grant on that account. The recognized Founder role permits platform preparation. The allowed organization workflow was verified against disposable eligible representatives. No hosted account, verification, role assignment, or opportunity record was edited during these checks.

## Remaining blockers

Public launch and C4.2 decisions include independent publication review, destination ownership and unsafe-link reporting, opportunity-level claims review, applicant consent and retention, laws applicable to employment and education, reporting and staffing, and any approved activation control. All sensitive applicant workflows and financial processing are outside the current release.
