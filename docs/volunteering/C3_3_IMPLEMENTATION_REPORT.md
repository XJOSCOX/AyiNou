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

Use disposable profiles, projects and opportunities for all enabled operations and population measurements. Use authenticated browser sessions and read-only database comparisons for hosted verification. Routine GitHub Actions are skipped. See [security tests](C3_3_SECURITY_TESTS.md).

## Documentation and operations

The hosted rollout evidence records the approved checksum, release, catalog and grant preservation and closed state. Next.js and Fastify run locally.

## Remaining blockers

Independent adult eligibility, regulated placement, safeguarding and privacy lifecycle approval remain launch prerequisites. C3.4 coordination would need a separately approved purpose, scoped sharing, explicit human decisions, eligibility rechecks and no automatic invitation or role assignment.
