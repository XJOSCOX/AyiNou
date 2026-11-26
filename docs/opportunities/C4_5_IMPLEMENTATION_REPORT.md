# C4.5 Opportunity Discovery and Personalized Recommendations

## Scope

A single signed-in Opportunities directory opens on Latest, with For You and Saved available through addressable views. The directory covers seven opportunity types, all ten Haitian departments, international locations and remote, on-site and hybrid participation.

## Data model and API

Seven private tables hold preparation revisions, owner preferences and independent consent, bookmarks, expiring dismissals, owner command receipts, exact publication keys and a disposable fixture guard. C4.2 owns publication and application eligibility. The directory uses the same organization profile, external destination confirmation, native expression of interest and Event routes.

Authenticated member reads and versioned actions are under `/api/v1/me/opportunity-discovery`. Founder preparation is under `/api/v1/admin/opportunity-settings/discovery`.

## Permissions and audit

Fastify verifies the original session and bounds request fields and rates. PostgreSQL binds each command to the actor and current session. Founder configuration also requires recognized Founder authority, recent MFA, an active private workspace, expected version, explicit confirmation, an audit reason and an idempotency receipt. The preparation API has no activation command.

## Privacy and lifecycle

Preferences, bookmark state, and dismissed recommendations remain visible to their owner only. Separate explicit opt-in governs For You. Members can preview their own existing C3 or C4.3 skills and choose which to copy. See the [privacy and fairness policy](C4_5_PRIVACY_AND_FAIRNESS.md).

## Localization and accessibility

The experience uses MemberShell, full-width headers, right-aligned back navigation, URL-backed sections, expandable secondary filters, native form controls and status notices. English, Haitian Creole, French and Spanish use a common vocabulary from C3 and prior C4 work.

## Reliability and recovery

The directory rechecks C4.2 eligibility on every result and returns an opaque placeholder for unavailable saves. Bookmark and preference commands are transactional. Signed cursor expiration requires starting a new search. Configuration stores versioned history and supports a forward correction with the live gate closed.

## Validation and CI

Local shared-contract, language, API, unit, lint, typecheck, engineering standards and optimized build checks passed. Disposable C4.5 covered the closed four-language browser routes, current approved results, exact field filters, explicit import, private saves, independent consent, dismissal and reset, blocking, and verified publisher invalidation. The 100,000-publication cohort completed. See the [security tests](C4_5_SECURITY_TESTS.md) and [performance report](C4_5_PERFORMANCE_REPORT.md). Routine GitHub Actions were skipped as requested.

## Documentation and operations

[Discovery policy](C4_5_DISCOVERY_POLICY.md) · [Recommendation policy](C4_5_RECOMMENDATION_POLICY.md) · [Privacy and fairness](C4_5_PRIVACY_AND_FAIRNESS.md).

The read-only preflight confirmed AyiNou `hcbxulyfmdmuyccgrujs`, 153 applied versions, 167 existing table fingerprints, 888 routine definitions, 25 RLS policies, and 17 empty fixture gates. The dry run found exactly `20261126120000_c45_opportunity_discovery.sql`, SHA-256 `2765dedad950977d7f7ff4a8542865be9243d317b7c4ede8b192b1e2f41579ec`, with no seeds or roles. The Founder separately approved this checksum. The approved scope is schema only. The application runs locally.

## Remaining blockers

Live discovery, preferences, personalization and saves require a separately approved activation contract and operational readiness. C4.6 must also address privacy operations, recovery and representative load acceptance before a real pilot.
