# C4.1 Professional and Educational Opportunity Foundation

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

The C4.1 disposable checks cover successful and denied organization and Founder operations. Local validation and rollout results are recorded here before phase closure. Routine GitHub Actions are skipped. See [security tests](C4_1_SECURITY_TESTS.md).

## Documentation and operations

The migration under review is `20261125135000_c41_professional_opportunities.sql`. Apply only the exact independently authorized checksum on hosted AyiNou after regression tests and a fresh dry run. The connected Next.js and Fastify applications run locally.

## Remaining blockers

Public launch and C4.2 decisions include independent publication review, destination ownership and unsafe-link reporting, opportunity-level claims review, applicant consent and retention, laws applicable to employment and education, reporting and staffing, and any approved activation control. All sensitive applicant workflows and financial processing are outside the current release.
