# Phase 6F.7 final stabilization review

## Executive summary

The engineering gate covers the existing Ayinou feature set through Phase 6D and the Phase 6F remediation series. The reviewed local and remote baseline was `a4b45af17a8ad6ace8cd83392db434b8db2ebe59`, compared against the Phase 6E audit cut `754764921003111a4d6bc730d490d529f373d060`. The audit uses a clean Git export, bounded synthetic browser and performance fixtures, guarded hosted SQL rollback tests, and read-only catalog inspection. The seventeen pre-existing local edits and untracked files, including the logo, Feed actions, sidebar, screenshots and blueprint, are excluded from the release evidence and the phase commits.

The current engineering suite passed. The public launch gate remains open. No critical or high-severity authorization defect was confirmed in the exercised paths. Reviewer staffing, administrator recovery, SMTP, data rights, human review, production capacity and restoration still require action. The review does not attest to untested channels or compliance. [Original findings and phase evidence](PHASE_6E_AUDIT.md) · [Data lifecycle inventory](PRIVACY_DATA_INVENTORY.md)

## Phase 6E finding disposition

| Finding | Classification | Final evidence and limits |
| --- | --- | --- |
| 6E-01 Poll timing and refresh | Resolved and validated | Server time drives opening and closing; client tests cover clock skew, background focus, and stale responses. Chromium kept the ballot reason while both boundaries passed. Database tests still deny late writes. |
| 6E-02 Avatar synchronization | Resolved and validated for synchronization | A single own-profile load feeds the navbar. Chromium confirmed upload, replacement, navigation, and account teardown. Signed URL expiry and already issued link lifetime are distinct; natural avatar URL expiry was outside the review. |
| 6E-03 Aggregation fixture | Resolved and validated | The hosted rollback-only suite uses isolated zero, small, threshold and above-threshold cohorts, including checks for missing projections and complementary suppression. No production member cohort was replaced. |
| 6E-04 Authenticated navigation | Mitigated with remaining limitations | Shared display/profile access reads and parallel layout reads persist. Browser assertions still see one profile request and one platform access request. Local development compiler and service timing vary; production latency has no load baseline. |
| 6E-05 Oversized modules | Mitigated with remaining limitations | Feed routes and Project Review have explicit backend modules. Feature-owned web files and domain shared contracts replaced large mixed modules. Several workflow components and repositories are still large, including Feed timeline/discussion, institution management, and polls. Refactor only when changes cross actual ownership or authorization boundaries. |
| 6E-06 Poll scalability | Mitigated with remaining limitations | The scoped poll RPC uses existing scope indexes, and controlled voting serializes correctly. Large global directories with inaccessible polls and peak contention remain uncharacterized in production. |
| 6E-07 Dependency advisory | Resolved and validated | Clean `npm ci` and the reported npm audit passed at low severity or higher. The esbuild build chain is pinned to 0.28.2. The affected code was the standalone Windows esbuild development server, absent from Ayinou's run scripts. |
| 6E-08 Repeatable browser tests | Resolved and validated for planned Chromium coverage | All 30 Chromium cases passed. The verified Actions workflow ran seven smoke cases with disposable Supabase. Other browser engines and assistive-technology testing remain separate gaps. |
| 6E-09 Service failure and recovery | Mitigated with remaining limitations | In-process and browser tests cover bounded upstream calls, revoked/invalid sessions, unavailable quota, draft preservation, interrupted media and ambiguous writes. Hosted restoration, cross-worker reliability and alerting require operational validation. |

## Architecture and compatibility

- **Frontend.** Next.js retains the same 49 tracked page/route entry files as the 6E cut. The production manifest contains 51 entries including framework entries. App Router shells retain locale, CSS theme tokens and member access checks. Groups, profile and onboarding, project work and progress, trust and Feed media have feature-owned form and view modules. Thin component entry points preserve route imports. The layout and navbar reuse display requests. Private data keeps the existing authorization and cache contracts.
- **Backend.** Fastify route characterization matches the audited inventory, including methods, request bounds, route-local hooks, implicit HEAD routes, and representative error and success envelopes. The Feed registrar delegates timeline, writes, engagement, moderation, media, notifications, ranking and communities to service-specific modules. Project Review is separate from proposals, teams and progress. Operational permissions live in the scoped services and database, including when a browser tab holds old UI state.
- **Shared.** The inventory reproduces all 211 public declarations, with 50 runtime values, 161 type-only exports, 13 modules and 17 type-only edges. There were no shared dependency cycles. Constants, literal types, package entry point and published signatures matched the checked fixture. The extraction review found no duplicate owners of the contracted Feed or Project Review actions. This was a focused ownership review, rather than a whole-program dead-code or dependency reachability proof.
- **Dependencies.** Lockfile changes since 6E align with browser coverage and the esbuild patch. The clean audited install reported zero advisories. There are no release-review application dependency changes.

## Security and hosted database

The hosted migration list matched all 56 local version entries through `20261120213000`. The dry run showed no pending migration. This review used the current hosted schema without applying migrations. Read-only inspection showed RLS on 36 Feed data relations, 50 private relations and 10 public application tables, plus both inspected Storage tables. There were no direct application-role grants on the 50 private relations. The Feed posts relation retains RLS-scoped `SELECT` grants for anonymous and authenticated roles and denies direct mutations. Across the three application schemas, 209 security-definer routines have an empty explicit search path and one uses `pg_catalog`. The server RPC naming/grant check found no `*_for_api` definer callable by an ordinary app role. Sampled poll, notification and review client RPCs require `authenticated` and perform their domain checks.

Private bucket inspection found `member-avatars`, `institution-logos`, and `post-media`, each private and limited to WebP derivatives of at most 512 KiB. Restrictive Storage policies deny client bucket access even for an authenticated uploader. Post and project media requests authorize before sending bytes. Avatar and logo delivery use bounded signed URLs. Previously downloaded content and an outstanding signed URL have their own lifetime, including the gap between permission change and signed expiry.

| Boundary | Database and API evidence |
| --- | --- |
| Auth, profiles, metrics and platform administration | Live session UUID is checked after token signature, issuer, audience, expiration and role. Restrictions invalidate protected access. Private profile writes bind to verified actor; quota failures stop protected reads. Aggregate fixtures exercise suppressed groups. Admin guard protects the last eligible admin, recent MFA and role assignment rules. |
| Identity, institutions, representatives and ordinary affiliations | Bootstrap provenance stays separate from independently reviewed identity. Assignments and reviewer conflicts are checked in PostgreSQL. Identity and institution decisions require separate eligible reviewers. Scoped grants, private contacts, invitation expiry, ownership transfer, custom role delegation, publication consent, revocation, impersonation and appeals passed the guarded tests. The reviewer count was zero and the administrator count one. Neither count came from synthetic fixture state. |
| Social, media, notifications and communities | Hosted rollback tests validated visibility, author and viewer scope, version conflicts, duplicate engagement, reports, independent appeals, blocks and mutes, per-recipient notices, private images, recommendation invalidation and historical group boundaries. Browser cases checked direct protected URLs, a member-only discussion, notification deep links, draft privacy and TOTP-bound group invitation acceptance. |
| Projects and polls | SQL suites exercised individual, institution and community eligibility, private/external projections, independent review, delegated teams and tasks, restricted milestone and evidence access, finalized reports, ballot uniqueness, retry receipts, electorate snapshots, nominee consent, quorum, ties and close decisions. Recommendation outputs do not assign project, institution or application authority. Audits and state changes use the same transaction where the workflow records both. |

Security evidence is limited to the inspected catalog, source and tests. It supports the application engineering gate and does not imply current operational capacity or an exhaustive security assessment.

## Regression results

| Check | Result |
| --- | --- |
| Clean Node 22.18.0 dependency install and audit | Pass. Zero reported advisories. |
| TypeScript and lint | Pass for all workspaces. |
| Shared and locale contract checks | Pass. 211 shared exports; 1,567 Spanish keys in parity across 24 namespaces, with Haitian Creole, French and English. |
| API and client tests | Pass. 36 Fastify tests and seven client tests, no skips. Includes transport deadlines, auth and quota outages, interrupted upload and safe receipt reconciliation. |
| Baseline builds | Pass. Next.js production build and Fastify production build. |
| Complete local Chromium | Pass. 30 scenarios, zero skipped, unexpected or flaky. Coverage includes 320, 768, 1,440 and 2,560 px layouts, four locale selections, both themes, keyboard focus and reduced motion, forms and network recovery, account restrictions, avatars and notification links. |
| Targeted isolated auth and account switching | Pass. Global sign-out revoked a second browser session and a still-live bearer. A viewer could open an invited institution through the switcher. After the owner revoked membership, the same account and bearer could neither read the private workspace nor switch back into it. The signed token expiry probe observed a real 60-second disposable Auth token change from HTTP 200 to 401 while its session row still existed. Only the test stack used the shorter lifetime. |
| Manual browser spot check | Sign-in linked to a usable recovery form with an accessible heading, email field, submit control and return link. Viewed in the disposable local stack. No message was sent. |
| Hosted guarded rollback | Pass. Aggregation, institutions, organization roles, projects, project work, progress, polls, affiliations, administration, Feed, following, recommendations, engagement, media, safety, departments, groups, community recommendations, trust and ambassadors passed and rolled back. |
| Verified GitHub Actions | On the exact baseline commit, quality, production build/dependency audit and seven Chromium smoke cases all succeeded. Workflow inspection confirmed SHA-pinned actions, Node 22.18.0, lockfile installation, read-only contents token, cancellation on replacement, bounded jobs and three-day counts-only artifact retention. Hosted secrets and hosted migrations are outside CI. [Baseline CI run](https://github.com/XJOSCOX/AyiNou/actions/runs/44793936984) |

The full suite was unmodified in the clean export. Additional session/browser probes use disposable accounts and configuration. Hosted email receipt and recovery completion, real operational verification reviewers, cross-engine browser coverage, full screen-reader/voice/zoom review, and Docker pgTAP were outside the completed suite.

## Performance and reliability

The Phase 6F.1 hosted-backed development samples established the direction of the compiler and request changes. Warm Feed TTFB dropped from 273 to 125 ms, Communities from 256 to 115 ms and Polls from 269 to 130 ms. Those are historical measurements on a hosted-backed local app. The current Chromium fixtures use local Docker and a client-navigation probe, so the wall times cannot be compared directly with those TTFB readings. No production latency target was inferred.

Three fresh Fastify harness runs used synthetic adapters with 550 samples per endpoint per run and 11 post-warmup startup/heap samples. Median and p95 below are the median of the three per-run values. This isolates API routing overhead from hosted network, SQL execution and real image transfer.

| Metric | 6F.6 median / p95 | 6F.7 median / p95 |
| --- | ---: | ---: |
| Public Feed, ms | 0.061 / 0.131 | 0.060 / 0.134 |
| For You, ms | 0.052 / 0.117 | 0.050 / 0.120 |
| Community discovery, ms | 0.250 / 0.382 | 0.258 / 0.388 |
| Project workspace, ms | 0.071 / 0.136 | 0.070 / 0.142 |
| Poll directory, ms | 0.056 / 0.129 | 0.056 / 0.136 |
| Poll vote, ms | 0.185 / 0.713 | 0.195 / 1.274 |
| Unread notifications, ms | 0.048 / 0.119 | 0.050 / 0.110 |
| Fastify registration, ms | 13.965 / 19.374 | 13.707 / 17.357 |
| Post-close heap, MiB | 34.202 / 35.826 | 36.540 / 38.882 |

The small timing movements and roughly 2.3 MiB higher post-close median heap occurred on the same source and do not isolate a code regression. They do not establish memory growth under sustained use. Raw web JavaScript was 2,276,330 bytes across 100 files, versus 2,276,332 bytes in 6F.6. The Fastify artifact matched at 167,768 bytes. The guarded 1,200-group ranking fixture completed its first PostgreSQL page in 1,245 ms, versus 1,330 ms in the previous phase. The 1,200-post ranking fixture passed its acceptance bound. Signed avatars were delivered and refreshed on profile mutation during browser coverage. Private image delivery failure and upload lease cleanup passed in the API suite. Sustained Storage throughput and natural signed-URL expiry were not tested.

Three comparable Chromium samples used the same Phase 6F.6 project-progress probe. The My Profile client navigation median was 263 ms versus 270 ms. The first sample was 892 ms versus 880 ms. Warm samples were 230–263 ms versus 250–270 ms. Project tab medians were 67 ms versus 71 ms. Each run read Project Work and Progress once. Dev compilation and sample size limit inference about production or perceptible improvements.

The disposable poll replay seeded 12,030 directory polls, 4,840 users and 4,800 ballots. The original and scoped listing RPCs each used 12 samples per call type after warmup. The narrowed sparse first page took 21.49 ms median and 26.90 ms p95, against 25.00 and 33.49 ms for the original in the same fixture. The scoped keyset page took 6.76 versus 8.75 ms median, and private-scope denial took 19.77 versus 22.11 ms. The global median varied from 16.29 to 21.37 ms with similar p95. This single-run difference does not resolve the large inaccessible-directory risk. The predicate plan again cut shared-buffer hits from 523 to 13. Sixteen simultaneous votes took 74.65 ms median and 125.72 ms p95, compared with 79.35 and 131.10 ms in 6F.6. The final total was 4,816, all eight late votes were rejected, and the 4,839-member snapshot took 2.85 seconds. These fixtures establish bounded behavior and outcome equivalence, with no hosted load exercise.

## Outstanding defects and launch gates

- **Engineering observations.** The local dev run warns about smooth scrolling during route transitions and a static theme initialization script when revisiting a public layout. The existing tests still passed. The browser suite uses Chromium and representative axe/focus assertions. Cross-engine behavior, long sessions, high-volume global poll listings and sustained infrastructure load remain unverified. No unrelated source changes are required to document those limits.
- **Trust and continuity.** Assign eligible independent identity reviewers and moderators, staff appeals, and establish administrator continuity and recovery. Hosted counts were zero eligible reviewers and one active administrator. Pending applications remain subject to the reviewed process.
- **Email and infrastructure.** Configure reliable custom SMTP and validate confirmation, recovery, delivery failures and abuse controls with controlled mailboxes. Define production monitoring, alerts, service objectives, cross-worker failure drills, verified backup restoration and a controlled load test. Keep restoration isolated from live data.
- **Privacy, governance and human review.** Implement and verify account deletion/export, retention and evidence holds, incident response, and human moderation/media review. Approve project and voting governance, responsibility for outcomes and appeals, and legal policies. Data handling and policy gaps are recorded separately. [Data inventory](PRIVACY_DATA_INVENTORY.md)

## Stabilization decision

Phase 6F engineering stabilization passes for the tested scope once the release evidence is recorded on `main`. Public launch readiness remains open. Before Phase 7, review these results, assign owners to the operational gates, and agree on rights handling, incident response, trust staffing and release governance. Leave policy drafting and new product features to their separate approved work.
