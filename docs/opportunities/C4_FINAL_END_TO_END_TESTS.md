# C4 final end-to-end verification

The test suites use distinct disposable accounts and the actual API and PostgreSQL authorization path.

- [Opportunity lifecycle](../../apps/web/e2e/opportunity-publication.spec.ts) integrates exact review, required assignment acceptance, organization and directory disclosure, native interest, external destination access, and Event registration. It exercises all seven types and department identifiers.
- [Mentorship lifecycle](../../apps/web/e2e/mentorship-coordination.spec.ts) exercises dual roles, request consent, participant-only views, capacity competing across two API instances, exact agreement amendments, objectives, session scheduling, progress, request pause, safety restriction, report triage and termination.
- [Founder readiness](../../apps/web/e2e/opportunity-activation.spec.ts) asserts ordinary-member and missing-MFA denial, the hosted-equivalent disabled state, and the four locales with wide and narrow layouts.
- [Discovery privacy and scale](../../apps/web/e2e/opportunity-discovery.spec.ts) exercises exact filters, independent private consent, skill import, saved and unavailable states, withdrawal, dismissal and bounded 100,000-opportunity search.

Connected browser verification is read-only and separately reported. Full end-to-end jurisdiction coverage is distinguished from coverage of the ten department vocabularies and access regression cases.
