# C4.2. Professional and educational opportunity publication

## Scope

C4.2 extends C4.1 using the same stable opportunity and immutable revision IDs. The organization workspace prepares employment, internships, scholarships, professional training, educational programs, apprenticeships and workshops. The operational path in a disposable environment supports independent review, approved publication, official external destinations, native Event associations, and consent-based expressions of interest. Public discovery and C4.3 remain separate.

## Data model and API

Private settings, fixture, scoped grants, review cases, publication records, interest records and receipts use RLS and service-only execution. PostgreSQL binds review, consent, publication and moderation to exact existing revisions. Type details use bounded contracts and catalog selections retain version references. Next.js reuses the organization and verification workspaces, member settings, public organization profile and native Events. See [publication policy](C4_2_PUBLICATION_POLICY.md).

## Permissions and audit

Existing organization role delegation governs `opportunities.submit`, `opportunities.publish` and `opportunities.interest`. Existing verification workspaces and reviewer eligibility are reused with an additional scoped, expiring opportunity grant and independent assignment. Founder settings and appointments require the recognized Founder in the original fresh-MFA workspace. Decision, release, consent, status and restriction receipts commit with their actions. See [reviewer policy](C4_2_REVIEWER_POLICY.md).

The identity investigation compared organization management, Project Work, C3 recruitment and C4.1. Organization management renders on a current institutional role. Project Work operations use the native project role and verified identity policy, and C3 recruitment depends on native project standing and eligibility. C4.1 already applies the existing independently reviewed identity or valid Founder Verified route. The GoXEV owner’s bootstrap record supports recognized Founder access, which remains separate. C4.2 uses a specific denial in the opportunity workspace. Enabling this organization lane for that owner requires an eligible identity under the existing review policy.

## Privacy and lifecycle

Public organization views omit unapproved and private details, reviewer deliberations, applicant identities and raw destinations. Destination information is returned only after an explicit signed-in request, on the approved revision, and displayed after a warning. A member may withdraw expression-of-interest consent, which clears the shared identity and statement. An existing in-app notice contains only an opaque receipt and generic status-update text. See [application and privacy policy](C4_2_APPLICATION_AND_PRIVACY_POLICY.md).

## Localization and accessibility

English, Haitian Creole, French and Spanish share the existing design tokens and navigation. Native form controls and labels cover typed fields, explicit review, monetary disclosures and consent. Draft and public preview use the same detail rendering. Private responses use no-store, noindex and no-referrer policies.

## Reliability and recovery

Writes serialize on the application’s existing session, relevant organization and opportunity or interest row. Optimistic revisions and scoped receipts provide safe retries. Closed, superseded, revoked and restricted publications stop serving. Explicit suppression preserves prior authority and prevents reuse of the invalidated publication. Existing native records are retained for forward correction and protected hold handling.

## Validation and CI

Two C4.2 Playwright tests passed, along with 14 regression tests for C4.1, Events, Project Work, Community Needs, Project Outcomes and Volunteer activation. The C4.2 suite verified replay through two API listeners and rendered Founder preparation in Haitian Creole, French, English and Spanish at desktop and narrow widths. Type checks, lint, unit tests, engineering standards, the optimized local build and the dependency audit passed. Routine GitHub Actions are skipped. See [security checks](C4_2_SECURITY_TESTS.md) and [performance evidence](C4_2_PERFORMANCE_REPORT.md).

Disposable verification caught an ambiguous suppression-trigger identifier and an improperly scoped report predicate. Both were corrected before approval of the migration checksum. The browser language test initially exhausted the API request budget after the high-volume lifecycle run. Running the language check separately verified all four translations with the existing rate limits.

## Documentation and operations

The database migration under verification is `20261125140000_c42_opportunity_publication.sql`. Apply only the exact separately approved checksum to linked hosted AyiNou, after tests, clean release and read-only preservation verification. Next.js and Fastify remain local.

## Remaining blockers

Real reviewer staffing, moderation operations, independent appeal capacity, privacy and retention approvals, legal and safeguarding review, and separately approved activation remain operational dependencies. Provider recovery and sustained public load require production readiness verification.
