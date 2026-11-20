# Phase 6E repository audit

## Executive summary

Audited commit **3fb130cebf02467ddd817640e36c09c56ee2dd8b** on main of XJOSCOX/AyiNou. The remote branch matched that SHA at the start of the audit. The audit covered the committed baseline through Phase 6D and evaluated local performance and layout work separately. Only this report and its inventory belong to the audit commit.

The findings include **zero P0, zero P1, six P2 and three P3**. There are two confirmed application defects in the committed baseline, three confirmed test, performance or maintainability issues, and one medium-priority unverified scaling risk. One low-severity dependency advisory applies to a locked development dependency. The audited commands do not serve files through the affected esbuild development server. No application security exploit was demonstrated. The audit does not establish the absence of vulnerabilities.

The highest priorities are synchronizing the poll UI with scheduled state transitions, repairing the aggregation fixture, testing browser authorization and recovery more consistently, and separating oversized route registration and feature components behind stable interfaces. The hosted project had zero eligible reviewers, one active platform administrator and zero approved projects at the time of the read-only check.

## Scope and inventory

The inventory was generated from the exact committed Git tree. Each of **468 tracked files** was read from its Git blob. The pass decoded 464 UTF-8 files, identified four binary assets, and recorded their byte sizes without treating images as text. The TypeScript parser checked all 225 TypeScript and TSX files, with zero parse diagnostics. All 55 SQL migration bodies were included in the source scan, ordered by version, and reviewed by domain and against the effective database metadata below. The scan counts declarations and branch-like tokens, so comments or strings can affect complexity measures. It identified 30 TypeScript functions or callbacks of at least 80 lines. The inventory explicitly distinguishes committed blobs from working-tree changes. The detailed manual review concentrated on domain boundaries, oversized modules, regressions, tests and representative flows. Automated inspection of every blob does not imply line-by-line manual review or execution of every route.

| Category | Files | Review |
| --- | ---: | --- |
| App Router routes and layouts | 53 | Protected and public route groups, proxy, layouts, signed-in fallback and error routes |
| React components | 66 | Ownership of state, shared shells, forms, accessibility and responsiveness |
| Browser libraries | 54 | REST clients, localization, auth and theme stores, abort and cursor handling |
| Localization dictionaries | 96 | 24 namespaces across four languages |
| Stylesheets and assets | 8 | Theme tokens, responsive rules, local fonts, public images, decorative bitmap assets |
| Fastify routes and services | 32 | Registration, validation, authorization, transport, errors and media |
| Shared contracts | 2 | Locale, profile, social, institution, community, project and poll wire types |
| SQL migrations | 55 | Chronological schema and function overrides, policies, grants and triggers |
| API tests, SQL tests, tools and fixtures | 76 | 15 API test files, 20 SQL fixtures, 41 tools or test scripts |
| Configuration and metadata | 17 | Package manifests and lock, TypeScript, ESLint, builds and environment placeholders |
| Documentation | 9 | Product, roadmap, decisions, operational commands and database plan |

The audit ran on main with the expected GitHub remote. At the inventory snapshot, 40 tracked working files differed from the commit, including local layout, branding, post-action and performance changes. The untracked logo and feed assets, screenshots, blueprint, and new shared page-header files remained outside the audit commit. The audit did not read local credential files into the report or include test identities. No tracked path was unavailable during inventory. Production users, private records, and actual ballot content were outside inspection. [File inventory](PHASE_6E_FILE_INVENTORY.csv)

## Architecture and maintainability

Next.js route files bind parameters and sessions while client feature components render member workflows. The protected layout verifies claims and current session eligibility and routes enrolled lower-assurance sessions to the authenticator challenge. The proxy handles cookie refresh and initial preferred locale. Locale and theme persist independently through the browser. The responsive member shell keeps the header, sidebar and footer separate. Public projections and privileged screens use distinct REST entry points. Shared styles and localized error messages protect the UI from coupling to database exceptions.

Fastify exposes versioned endpoints for the web and future mobile clients. APIs validate inputs with Zod, derive the caller from verified credentials, scope SQL and storage operations, and use an error envelope with a safe request reference. Feed route registration injects verifier, repository, storage and read budget. Audit and error logging uses route metadata and configured redaction. The API read budget has a bounded process-local window plus a shared hosted PostgreSQL limiter and fails closed when that service fails. PostgreSQL writes have separate action limits. Storage image processing strips metadata, bounds decoded inputs, and keeps backing buckets private. The notification projection and unread count recheck current recipient visibility.

### Largest TypeScript modules and proposed boundaries

Counts are from the committed baseline. Splitting files is valuable when it narrows a dependency or resource lifecycle and makes tests independent. A line count alone does not establish a defect.

| Existing module | Lines and responsibilities | Proposed modules and dependencies | Risk and required tests |
| --- | --- | --- | --- |
| apps/api/src/routes/feed.ts | 502. The registration function spans 431 lines from line 72. It coordinates feed, department posts, moderation, notifications, media, recommendations and engagement. | Preserve registerFeedRoutes as composition while extracting feed-read, feed-write, discussion, moderation, notification and media groups. Pass one typed dependency object for repo, actor and budget. Follow the existing poll and group registrars. | High. Capture method and URL inventory, actor resolution, cache headers, response envelope, request limits, guest projections and same-scope redirects in Fastify injection tests. |
| apps/web/src/components/groups.tsx | 429. Group list/filter, create/edit, invitations, ownership and public guest posts share one client module. GroupManagement starts at line 218. | Separate groups/directory, groups/form, groups/invitations, groups/management and groups/public-discussion. Share card, topic filter and API loader through narrow imports. | Medium to high. Exercise guest versus private-room projection, join or leave, open requests, invitations, ownership transfer and old-public-content denial, plus 320px navigation. |
| apps/web/src/components/project-progress.tsx | 417. Milestones, measures, image lifecycle, team entries, reviews and public reports use the same controls. EntryBody starts at line 90 and ProjectProgressWork at 305. | Split progress/entries, progress/metrics, progress/milestones, progress/public-report and progress/private-image. Keep one typed actions adapter over project-progress-api. | High. Preserve pinned approved revisions, independent review, retained evidence confidentiality, object URL cleanup, corrections and stale version errors. |
| apps/web/src/components/profile-form.tsx | 388. The 304-line ProfileEditor begins at line 85. It combines private personal fields, location, discoverability, interests, signup progression, uploads and saved previews. | Divide profile/data, profile/onboarding, profile/public-fields, profile/private-fields and profile/avatar. Extract independent validation and payload construction before splitting JSX. | High. Test every onboarding step including skips and back, refresh, invalid private input, upload and update, locale restoration, and public/private field projection. |
| apps/web/src/components/project-work.tsx | 314. Team delegation, execution, volunteers, tasks and progress tabs combine workflow authorization with layout. Work screen starts at 63 and tasks at 273. | Keep work-shell plus distinct team, execution, volunteers, tasks and progress tabs. Share one scoped command form and preserve version propagation. | High. Cover tab access, receipt retries, role revocation during a session, independent reviews and sensitive tasks. |
| packages/shared/src/index.ts | 625. Locale, profile, poll, project and social types and constants share one public index. | Move declarations to domain modules and re-export them from the same index. Keep runtime enum constants close to the types they drive. | Medium. Run builds and check named import compatibility, JSON shapes, validator enum alignment and translation key parity. |
| apps/web/src/components/trust-workspace.tsx | 293. Identity application, trust displays, appeals and reviewer work share form and data concerns. | Separate applicant and reviewer views. Keep written rationale and the identity-publication boundary in shared workflow helpers. | High. Preserve separated decision-makers, held badges, reasons and private evidence. |
| apps/web/src/components/projects.tsx | 274. Guest discovery, personal management, restricted details, reporting and image submission share route-level orchestration. | Extract directory, manage and detail components first. Move private controls behind feature boundaries after measuring bundles. | Medium. Exercise public, private, restricted and withdrawn revisions, and image/remove operations. |
| apps/api/src/services/members.ts | Factory starts at line 51 and spans 146 lines. Own profile hydration, versioned details, signed avatars and public member projection share privileged client construction. | Split own profile, public projection and avatar lifecycle within existing repository, retaining signed URL and error contracts. | High. Validate cleanup on storage failure, asset replacement concurrency and own/public views. |
| apps/web/src/components/auth-screen.tsx | AuthScreen starts at line 24 and spans 221 lines. Registration, login, reset, and MFA handoff share a screen. | Extract schema, error presentation and auth mode-specific submit behavior after browser recovery tests. | High. Test callback, rejected credentials, MFA redirect and session restoration. |

Large SQL files such as the 557-line institution migration, 469-line reviewed-claims migration, and 443-line Phase 6C workflow migration contain historical changes and remain immutable. Organize future additive corrections around a feature or policy change. Record which effective function version overrides the historical definition. The 9,951-line package lock and 736-line database reference are generated or reference-heavy size outliers.

### Frontend module layout

Keep app route files under app and preserve route groups and external URLs. A feature-based layout would reduce directory breadth in components and lib, provided shared shell, locale, auth and platform access dependencies point inward toward feature-neutral modules. Start with project progress and group public/private views, which have visible module seams. Profile state and onboarding should follow after characterization tests. Avoid moving all files in one batch.

| Source family | Proposed location after characterization |
| --- | --- |
| member-shell, member-sidebar, member-navbar, page header and shared display controls | components/layout |
| groups, community discovery, department spaces and related client code | features/communities |
| feed-screen, post-composer, feed-discussion, private post-media hooks | features/feed |
| profile-form, member identity and profile API callers | features/profile with identity context exposed to the shell through a small interface |
| projects, project-work and project-progress | features/projects with proposal, execution and progress subdomains |
| poll-form, polls, poll-api and localized poll copy | features/polls |
| verification, trust, organization roles and affiliations | features/verification and features/institutions |
| network envelope, auth/session, locale, theme and cross-feature state | lib with browser and server imports explicitly split |

## Database, permissions and integrity

The metadata query applied a read-only transaction to hcbxulyfmdmuyccgrujs. It reported 55 applied migrations with latest version 20261120212000. RLS is active on all 96 application tables counted across public (10), private (50) and feed_data (36). There were 25 policies across those schemas and storage. Most internal tables depend on RLS plus revoked direct grants and scoped definer functions rather than permissive table policies. The only anon or authenticated direct table privilege in private/feed_data was SELECT on feed_data.posts. That table participates in feed invoker queries and is guarded by separate public/member policies plus community and block restrictions. Private schema usage is denied to anon and authenticated. Feed_data schema usage is granted, while the repository's PostgREST schema list uses public and graphql_public. Hosted externally exposed schemas were not independently enumerated. Keep a release check on this distinction.

The effective catalog counted 210 SECURITY DEFINER functions across the three schemas, including 171 public functions. These counts include legacy helpers. Every cataloged definer had an explicit search path setting. Catalog grants alone do not prove per-row authorization. Source review traced actor derivation, direct RPC validation, recent TOTP for privileged writes, current session and restrictions, grants and the effective override chain. The image-facing member-avatars, post-media and institution-logos buckets were private with a 512 KiB cap. Project progress media travels through its API and database image projection. No authenticated, anon or service-role direct SELECT grant was present on any of the six poll tables.

| Domain | Boundaries reviewed |
| --- | --- |
| Account and privileged access | Auth UID and current session record, actor status, auth factors, positive role assignment, recent TOTP on elevated commands and bootstrap provenance. Bootstrap badge and ambassador designation do not substitute for independently reviewed project identity. |
| Institutional trust and affiliations | Independent review, current organization verification, scoped roles, separated representative and ordinary member access, consent, revocation, and restricted evidence. Custom permissions go through catalog checks and do not grant platform roles. |
| Feed, groups, privacy and moderation | Current visibility, private memberships, public-since boundary, block/mute handling, own drafts, reaction and comment access, recipient-only appeals and notifications, safe image limits and auth-fenced reads. |
| Proposal and execution | Approved, immutable proposal revisions under version checks. Verified accountable owners, institution/community owner checks, independent reviewers, scoped team and task roles, current-status rechecks and invitation acceptance. |
| Milestones and outcomes | Milestone actions, progress snapshots, review separation, visibility-specific entry/image projections, report corrections, and self-reported metrics visibly labeled apart from reviewed publication. |
| Voting | Typed ownership and project/task scope, one ballot unique key and row locks, immutable choices, same-choice retry, frozen high-trust electorate and live eligibility, consent withdrawal masking, explicit close and cancel, guarded notifications, and no operations write from a recorded recommendation. |

The voting transaction locks the poll before mutation. A participant who loses membership or reviewed identity cannot cast a fresh eligible ballot and existing counted ballots stay counted. Results after the viewer's vote are limited to ordinary polls configured for that policy. Small-cohort aggregate disclosure and operator audit access need a documented privacy policy before broader use. The audit did not attempt to infer an individual vote. Scope adoption for current and historical candidate/participant access needs independent review when organizations introduce real governance policies.

### Migration sequence reviewed

| Version range | Files | Effective checks |
| --- | ---: | --- |
| 20261119160000–20261120060000 | 11 | Base grants and RLS, profile initialization, aggregation exclusions, member versus referral codes, role and representative boundaries, verified-admin and bootstrap rules, session and locale behavior |
| 20261120070000–20261120122000 | 12 | Feed read policies and authenticated writes, publication ordering, engagement ownership, following, recommendation snapshots and overrides, private media, recipient-scoped notices, blocks and appeals |
| 20261120130000–20261120151000 | 8 | Departments and delegated moderators, private and public group membership, historical public visibility, projector filters and recommendation feedback |
| 20261120160000–20261120192000 | 11 | Independent claim and institution review, appeal and impersonation rules, voluntary ambassador publicity, delegated organization permission and operational limits |
| 20261120200000–20261120212000 | 13 | Pinned proposal revisions and verified applicants, projects/team/tasks authorization, controlled progress and outcome publication, poll scope, eligibility and privacy, decision and notice integration |

## Findings

P0 means critical impact, P1 means significant impact, P2 means medium, and P3 means low. Confirmations come from code, non-destructive test results or measured behavior. Suspected performance risks need a controlled workload before choosing a remedy.

| ID | Severity and status | Evidence and verification | Impact and remediation | Scope, dependencies and regression |
| --- | --- | --- | --- | --- |
| 6E-01 | P2, functional, confirmed by source, high confidence | apps/web/src/components/polls.tsx lines 54–64, 117–128 and 156. Open a scheduled poll and keep the page open through its opening or closing time. The resource reloads on mounting or explicit action/error retry, with no timer or focus refresh. The database calculates status from its clock in supabase/migrations/20261120210000_phase6d_poll_schema.sql at poll_status. | Voters may keep seeing a disabled ballot after opening. A manager can miss the Finalize control until reloading. Schedule a scoped refresh at the next boundary and on recovered focus, while keeping the backend authoritative and preserving pending input. | Small frontend change. Depends on the resource hook and the server-provided dates. Add controlled clock, background-tab, permission-change, late vote and unsent-selection tests. |
| 6E-02 | P2, functional, confirmed by source and existing avatar scenario, high confidence | apps/web/src/components/member-navbar.tsx at the placeholder avatar and apps/web/src/components/profile-form.tsx at changePhoto. The baseline updates the profile image while the navbar renders a generic icon. A member with a saved avatar expects the same photo in both places. | Account identity is inconsistent across pages. The working tree now consumes the signed own-profile photo and refreshes the current navbar after upload. | Small frontend change already made locally. Depends on signed avatar delivery and fallback behavior. Add a synthetic browser upload, navigation, replacement, expired URL and sign-out check. |
| 6E-03 | P2, test fixture, confirmed by source, high confidence | scripts/check-phase2-aggregation.mjs lines 41–44, 68–71. The fixture requires a zero-member baseline. Its equality guards compare a scalar subquery with an expected count using a NULL-sensitive operator. A missing requested row yields NULL rather than a true mismatch. | On a populated instance the test aborts, while a missing expected grouping can pass on an empty instance. Use isolated account data in a disposable database or controlled rollback fixture and use explicit missing-row checks. Keep suppression and complementary cohorts in the matrix. | Small test-only change. Depends on reproducible seed and Postgres semantics. Cover missing, wrong, below-threshold and above-threshold rows plus a nonzero preexisting population. |
| 6E-04 | P2, performance, confirmed by measurements and source, high confidence | apps/web/package.json line 6, app/(protected)/layout.tsx lines 6–17, and sidebar/provider access loading. Webpack first encounters were several seconds. Warm signed-in renders awaited separate hosted reads, and the sidebar and provider each requested platform access on startup. | Delayed navigation and redundant hosted work. Local work switches the dev compiler, overlaps independent reads and shares display requests. Future production tuning should use a controlled browser and API trace. | Small-to-medium cross-layer follow-up. Keep all live checks and cache rules. Regress active versus restricted accounts, MFA, refresh, retry, photos and role revocation. |
| 6E-05 | P2, maintainability, confirmed by inventory, high confidence | apps/api/src/routes/feed.ts lines 72–502 and the five module rows above. Registration and render functions mix multiple lifecycles and boundaries. | Refactors become risky and import breadth makes bundles harder to tune. Extract one domain at a time behind existing exports and routes. | Medium staged work. Depends on route-contract snapshots, controlled tests and stable shared hooks. Revert one extraction independently if regressions appear. |
| 6E-06 | P2, scale, suspected, medium confidence | supabase/migrations/20261120212000_phase6d_poll_access.sql lines 16–27 uses a coalesced scope filter and per-row visibility before the page limit. Scoped columns have separate partial indexes. supabase/migrations/20261120211000_phase6d_poll_workflow.sql lines 59–112 and 210–242 snapshots eligibility, aggregates by option and locks a poll during submission. | Large sparse scopes or bursts on one active poll could add scans or row-lock waits. Benchmark with realistic skew in an isolated database and compare plans before proposing indexes, scope branches or any lock change. | Medium performance follow-up. Depends on reproducible load and current query plans. Require unchanged visibility, tie and quorum results, and atomic vote/cancel and consent behavior. |
| 6E-07 | P3, dependency, confirmed package advisory, high confidence in version, low route exposure | package-lock.json locks esbuild 0.27.7 for the build toolchain. npm audit reported one low advisory. The repository uses Next dev and Fastify run commands and does not invoke esbuild's file-serving development server. Exposure would require the affected Windows esbuild server to be enabled. | No reachable application route was established. Move the build chain to a compatible patched esbuild release after validating the toolchain. [Maintainer advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | Small or medium dependency update. Depends on the upstream tsup dependency range or a documented override. Run API build, workspace tests and npm audit. |
| 6E-08 | P3, testing, confirmed coverage gap, high confidence | package.json routes normal tests through API, client error and translation checks. Browser checks through Phase 6D were manual. There is no committed repeatable multi-viewport browser suite. | Cursor recovery, theme and locale switches, focus and image behavior can regress without blocking builds. Add targeted browser smoke tests with controlled accounts and no writes to hosted production. | Medium. Needs an isolated test environment, stable test data and reliable input selectors. Cover four locales, two themes, 320px and a wide viewport, plus session recovery and nominations. |
| 6E-09 | P3, operational confidence, unverified risk, medium confidence | apps/api/src/services/auth.ts lines 11–44 and services/read-budget.ts lines 15–38 show independent hosted checks. Media sets explicit deadlines, while the verifier and some repositories rely on library defaults. Database backup recovery and cross-worker peak load lack exercised evidence. | Remote stalls could affect perceived availability or spend capacity in a failure window. Inventory effective timeouts and retry safety before changing transport behavior and add failure-mode telemetry. | Medium. Depends on hosting decisions, a non-production environment and traces. Simulate transient timeout, revoked session, storage failure and simultaneous clients without weakening checks. |

## Performance measurements

The baseline comparison used four sequential local HTTP document requests per route with verified synthetic member cookies, using Next.js on 127.0.0.1:4000 and the same hosted Supabase project. Values are time to first byte. Repeat medians use requests two through four. The first request represents the route's first encounter in the run, with warmness affected by prior browser visits and dev compilation. Publisher output, browser rendering, frontend API calls and database workload are separate measurements.

To repeat the comparison, start the web workspace in each mode on port 4000 with the same source state and database, alternate the order of webpack and Turbopack runs, and record the first response and median of at least three repeat reads. On Windows the equivalent commands are `npm run dev -w @ayinou/web -- --webpack` and `npm run dev -w @ayinou/web` from the optimized tree. Authenticate only with a disposable test account and keep the session cookie out of commands, logs and artifacts. Measure configuration and application changes independently when attributing an improvement.

| Route | Before first / repeat median | After first / repeat median |
| --- | ---: | ---: |
| Dashboard | 485 / 280 ms | 389 / 137 ms |
| Feed | 319 / 285 ms | 357 / 141 ms |
| Communities | 4,031 / 271 ms | 375 / 133 ms |
| Polls | 7,214 / 289 ms | 317 / 142 ms |
| Account settings | 19,218 / 335 ms | 324 / 132 ms |
| Ambassadors | 3,240 / 51 ms | 54 / 39 ms |
| Projects | 5,751 / 134 ms | 336 / 111 ms |

Warm protected-route responses roughly halved. The first settings request was an outlier and the first Feed request increased by 38 ms. The run supports retaining the local changes and tracking sampled ranges in future comparisons. It does not establish a universal speedup or a production SLA. The isolated committed Webpack build emitted 100 JavaScript files totaling 2,302,653 bytes raw and about 714,476 bytes when individually gzipped. These totals describe the build archive, while an individual route downloads a subset.

Feed hydrates attachment/topic metadata in batches and signs deduplicated avatar paths. Each API request still performs live auth and shared quota checks, which matter with avatar, notifications and activity requests. Progress entry images use ownership-checked transport, object URLs and cleanup. Public images use compact local assets. Measure API request counts and image timings with a smoke session before changing read policy. Notifications combine recipient keyset pages and per-row visibility. Benchmark list and unread count for recipients with many suppressed events. Ranking rollback fixtures cover 1,200 synthetic posts and 1,200 synthetic groups, with shared read quotas and snapshot bounds. Production query plans, peak load, browser paint metrics, and per-route compressed transfer were not measured.

The same shell review found capped workspace wrappers on Create Poll, poll detail, My Nominations, Create Group and onboarding, and centered wrappers on guest directories. Local changes widen those wrappers and make Create Poll two columns at wide breakpoints. Home, auth and standalone error screens retain purpose-built content layouts. Form controls, popovers, and paragraphs retain individual width constraints where appropriate. These layout changes belong to the working tree and not this commit.

## Test coverage matrix

The isolated baseline passed typecheck, lint, translation parity, five client error tests, 31 Fastify API tests and the API and web production builds. All 19 guarded hosted SQL suites passed and rolled back. The community recommendation fixture returned a 1,200-group first page in 1,556 ms inside PostgreSQL. The live Fastify poll race used synthetic accounts and one private group with verified cleanup. Browser checks for the performance and layout changes used the working tree, separate from the committed baseline. Create Poll filled its workspace at 320, 768, 1280 and 2560 pixels and saved a draft at 320 pixels. Create Group and My Nominations also filled the tested layouts.

| Domain | Evidence | Priority gaps |
| --- | --- | --- |
| Auth and account security | API role, session and recent MFA checks, hosted admin SQL, manual browser login/logout | Natural token expiry, multi-tab changes, recovery email and extended live reviewer loop |
| Member profile and aggregation | API validation and caller binding, hosted membership tests, manual profile and photo checks | Populated baseline and missing-group assertions, lost response and interrupted image replacement |
| Institutions and affiliations | API tests, private contacts, invite expiry, cases, organizational roles and affiliation consent SQL | Expiry while forms stay open, simultaneous invitations, broader live reviewer workflow |
| Verification and organization roles | Role-scoped API tests and rollback checks for grant/revoke, read boundaries and reviewed claims | Independent live reviewers, mobile end-to-end identity flow, appeals under revocation |
| Social feed, comments and reactions | Feed and engagement API and SQL, client recovery tests, tested pagination and authorization | Browser long-text, draft retention, interaction races and reduced-motion check |
| Recommendations | Snapshot, privacy, ranking benchmark and feedback SQL | Browser snapshot expiry and concurrent cross-device feedback at scale |
| Notifications and media | API and SQL for metadata, preference behavior, privacy, dedupe and safe image decoding | Failure during signed fetch, stale badge with navigation, large inbox and screen-reader interaction |
| Blocking, muting and appeals | Hosted safety regression, moderator separation and direct test injection | Live independent appeal handoff and adversarial moderation staffing exercise |
| Communities and groups | Department, groups and recommendation API/SQL, current group privacy and cursor snapshots | More locale and mobile checks, acceptance race with concurrent permission changes |
| Ambassadors | Hosted rollback lifecycle, consent and review checks | Independent live approval, human editorial and translation review |
| Project proposals and ownership | Fastify contract and rollback authorization, public/hidden revisions and verified owner restrictions | Live approved project with independent reviewer, pre-existing image loss and long reviewer queue |
| Volunteers and tasks | Fastify scope and hosted work/team SQL | Browser acceptance, restricted task assignment from stale client, resuming drafts |
| Milestones and outcomes | Progress API projection and hosted review/metrics SQL | Live report publication, media outage and archival correction rehearsal |
| Voting and ballots | Poll API, guarded SQL for vote, nominee, scope, RLS, quorum, project separation, plus live private ballot race | Long-open poll UI, effective electorate churn under load, privacy review for small aggregates, live higher-trust governance |

The legacy Phase 2 population-dependent fixture was inspected and deliberately skipped against hosted data. Docker pgTAP, uncontrolled live load, real mail, naturally elapsed token expiry and live production governance were not run. The isolated baseline archive reused the existing installed lockfile dependencies and did not perform a clean registry install. npm advisory checks were read-only. No new CI ran.

## Localization and accessibility

Dictionary parity verified 1,565 baseline Spanish keys against the same Haitian Creole, French and English keys and placeholder names. The language provider updates the document language and browser persistence, and original-language posts and polls carry a language attribute in key views. The baseline has localized errors, labels, skip navigation, live notices, time formatting and theme token surfaces. Human Creole, French and Spanish review is still necessary, especially for governance terms, dynamically composed labels, names, status tone and long translations at phone widths. Review focus placement after drawer changes, keyboard-only voting and reaction pickers, both themes' contrast, 200% zoom, long names, reduced motion and screen reader reading order. Automated parity validates keys and placeholders. It cannot validate copy or layout quality.

## Operational readiness

| Gate | Observation and owner action |
| --- | --- |
| Independent reviews | One active platform admin, zero operational identity reviewers and zero approved projects in the hosted read-only check. Staff independent reviewers and sufficient administrators without bypassing verification. |
| Real account email | Reliable custom SMTP and delivery monitoring are external dependencies. Exercise authentication callbacks and recovery on the configured sender before launch. |
| Data rights and evidence | Define account export, deletion, retention, review holds, access logging and purge procedures across identity evidence, post media, project progress and ballots. Exercise synthetic account deletion including storage. |
| Moderation and fraud | Establish staffed queues, escalation and recovery procedures for impersonation, project irregularities, person-selection consent, small cohort privacy and poll abuse. Recruit independent review capacity. |
| Monitoring and recovery | Establish sanitized API and database telemetry, alerts and tested backup restoration. Test cross-worker limits and scalable private projections in an isolated environment. |
| Developer and delivery | No committed CI workflow. Use lockfile installs, pinned Node and checked environment placeholders. Keep hosted checks gated and avoid privileged secrets on untrusted CI jobs. |

## Phase 6F remediation sequence

1. Establish regression contracts and hosted schema/read-only metadata checks. Investigate scope/grant questions and the esbuild advisory using compatible dependencies. Treat any proven integrity issue as a separately reviewable additive migration. Validate with role matrices and rollback SQL first.
2. Fix the poll clock and aggregation fixture issues with narrow reproducible tests. Preserve all status boundaries, safe retries and result disclosure. Merge already-local navbar and layout work separately if approved. Verify unaffected auth, theme and locale paths.
3. Add repeatable browser smoke coverage for session, responsiveness and recovery. Use a disposable project or an isolated local database and test-only identities. Keep each browser path independently resettable.
4. Standardize cancellation, deadlines and typed error handling without changing the error envelope, statuses or headers. First test network failures, auth failures, stale writes, unsupported input and concurrent reads. Revert shared helpers independently.
5. Split the Feed registration groups and selected frontend feature modules one group at a time. Preserve existing route and package exports. Compare test coverage, response contracts, manifest size and screen behavior after each extraction.
6. Split shared contracts by stable domain exports. Build both apps and check API enum compatibility and locale key parity. Avoid client-visible schema changes until migration policy exists.
7. Optimize query and rendering paths after controlled measurements. Compare scope-aware listing plans, notification counts, private media and concurrent poll writes while retaining access and consistency. Add indexes only where query evidence warrants them.
8. Add CI with pinned Node, lockfile installs, isolated parallel typecheck/lint/tests, translation parity and production builds. Run dependency reports and keep hosted jobs manual, serialized and restricted. Verify recovery procedures and capture final regression baselines.

## Phase 6F.1 results

| Finding | Status | Validation |
| --- | --- | --- |
| 6E-01 | Fixed and validated | The poll uses server time for its opening and closing refreshes. Controlled-clock tests cover skew, hidden tabs, focus, obsolete results and cleanup. A live private poll opened and closed on the same browser page and kept the selected option and unsent reason. Fastify and hosted tests covered a late vote, concurrent submissions, retry, result privacy and nominee consent. |
| 6E-02 | Fixed and validated for the navbar | Profile reads share an in-flight request for the same token. The navbar uses the authorized signed URL, updates after a profile upload, renews the URL before its normal expiry and clears identity state at session changes. Synthetic browser and API checks covered avatar delivery, replacement, navigation, refresh, sign-out and signing in as a different account. |
| 6E-03 | Fixed and validated | The guarded hosted fixture ran deployed aggregation function bodies against isolated temporary cohorts of 0, 9, 10 and 11. Missing rows and JSON null are checked explicitly. The fixture verifies suppression and excludes production member data. The transaction rolled back. |
| 6E-04 | Local improvements measured | Protected layout starts independent reads together and waits for the same access decisions. Provider and sidebar share platform access display state. Public footer status has a short cache and development uses Turbopack. Production performance and peak load remain unmeasured. |
| 6E-05 to 6E-09 | Outstanding | Module extraction, scoped poll query and lock behavior under load, the build dependency advisory, an automated browser suite, and failure and recovery simulation remain follow-up work. |

### Local development baseline

TTFB in milliseconds from authenticated loopback requests on the same machine, with the same hosted project, synthetic account and installed dependencies. Each archive ran Next.js 16.4.6 in development with a fresh compiler cache. The first sample is the first measured request for that route, and shared compiler work may carry over from earlier routes. Warm values are medians of three immediate repeats. This comparison measures the combined compiler and request changes under local conditions.

| Route | Audit Webpack first | 6F.1 Turbopack first | Audit warm median | 6F.1 warm median |
| --- | ---: | ---: | ---: | ---: |
| Dashboard | 4,642 | 1,984 | 343 | 137 |
| Feed | 1,075 | 429 | 273 | 125 |
| Communities | 750 | 388 | 256 | 115 |
| Polls | 703 | 339 | 269 | 130 |
| Account Settings | 737 | 335 | 270 | 128 |

Fastify logs from one direct browser load of the profile on each archive counted 10 and 7 successful API GETs respectively. Platform access dropped from 2 to 1, profile from 2 to 1, footer status from 2 to 1, and department lookup remained at 2. These exclude preflights, signed media and calls made directly to Supabase.

To repeat the sample, export the audit commit and the final code commit to separate directories. Use the same local environment and dependency versions, start Webpack for the audit export and Turbopack for the code export on separate loopback ports, and warm neither cache beforehand. Reuse one synthetic session to send four authenticated requests per route in table order. Measure response headers, verify the body contains the authenticated workspace and report the first sample and median of the remaining three. Compare successful Fastify GETs during a single full profile navigation on each origin.

The clean commit export passed typecheck, lint, translation parity for 1,567 keys across four languages, 31 API tests, seven client tests and both production builds. Guarded hosted rollback checks passed for admin and session rules, polls, department communities, member groups, media and notifications, and aggregation. Live tests passed for real TOTP, suspension with a previously issued token, independent review, global logout, and a concurrent ballot with an idempotent receipt. No migrations were needed.

Manual browser checks covered session restoration, community navigation, sidebar folding, both themes and localized Create Poll in all four languages. Create Poll used two columns at desktop width and stacked at 320 pixels. Dashboard, Feed, Communities, Polls, Profile, Settings, Institutions, Projects, Ambassadors and Verification fit their tested workspaces without horizontal overflow at 320 and 2560 pixels. The public landing page, auth cards and error text retain readable width limits.

The [6F.1 code comparison](https://github.com/XJOSCOX/AyiNou/compare/754764921003111a4d6bc730d490d529f373d060...30213274bbe5ee9ab127c5fb1a9b6f40595471b5) lists the exact files in the three implementation commits. The local logo, feed icons, draft database blueprint and screenshots remain outside those commits.

## Phase 6F.2 results

**6E-08 is addressed.** Playwright Test 1.65.1 ran 24 Chromium scenarios on the exported change set with zero failures, skips or blocked cases. Seven scenarios are tagged for the smoke command. The suite uses a fresh local Supabase project, a separate Fastify server and a disposable Next.js copy. A single worker uses unique synthetic accounts and the runner verifies removal of the test containers and volumes. Browser tests make no hosted writes.

Coverage includes sign-in, session restoration, logout, account suspension, real TOTP, the main member routes, private post and project drafts, a private group discussion, recipient notifications, blocking, and voter-bound receipts. Controlled network scenarios cover outages, a real client timeout, rate limits, invalid sessions, stale writes, retry and retained inputs. A scheduled poll crossed both boundaries with the page open, and a profile test used the file picker to upload and replace an avatar, advanced the browser clock to verify renewal, and changed accounts. It also confirmed one profile GET and one platform-access GET on the initial profile load.

The display suite measured key controls and page width at 320, 768, 1440 and 2560 pixels. It checked four-language persistence, localized errors and validation, both themes, skip-link and menu focus, and representative axe label, ARIA and contrast rules. Smooth scrolling now respects reduced motion. Tailwind scans application source so test artifacts cannot change the generated stylesheet.

Typecheck, lint, translation parity, all 31 API tests, seven client tests and both production builds passed. Six guarded hosted SQL suites passed and rolled back. No migration changes were needed. Cross-engine testing, assistive-technology review, natural token or signed URL expiry, and hosted mail delivery remain separate coverage gaps. Findings 6E-05, 6E-06, 6E-07 and 6E-09 remain open. [Browser test workflow](../WORKFLOW.md#browser-regression-tests)

## Phase 6F.3 results

Phase 6F.2 was verified on local and remote `571fcd5826fcaa59d2942eaa9042029cb1554d14`, which followed the brief's original `1b5b946` reference. Typecheck, lint, translation parity, 31 API tests, seven client tests, both builds, and all seven browser smoke tests passed before production code changed.

The backend portion of 6E-05 progressed. The 502-line Feed entry point is now a 47-line registrar. Eight registrars own the timeline, post mutations, engagement, moderation, post media, notifications, recommendations, and community feed routes. The largest extracted Feed file is 100 lines. Three Feed helpers cover request access, pagination and validation. Projects went from 146 to 99 lines after review and reporting moved to a 44-line registrar with shared project request schemas. Project work and progress keep their existing registration boundaries.

The review covered relative imports, validators, error translation, resource ownership, authentication hooks and per-process quotas. The 45 backend source files had no relative import cycles after extraction. Feed authentication and moderation remain shared within the Feed scope. Members, Institutions and Admin keep their own hooks and call order because they enforce different authentication and error semantics. The app still closes the member service on shutdown and the post upload keeps request-local state in a WeakMap. The shared Feed repository still batches attachments, reactions, topics and signed avatar metadata.

The recorded inventory matched all **290** registered method and path entries, including implicit HEAD and preflight, explicit body limits and route-local hooks. Source comparison matched **40 Feed and 14 Project** registration statements after accounting for the shared MFA helper and unchanged project path constant. The new injection tests passed on the baseline and candidate. They cover exact success and failure bodies, cache headers, generated request IDs, token and RPC forwarding, recent MFA, unavailable storage and database paths through the combined suite, and stale writes. Authorization and version checks remain enforced by the existing Fastify and PostgreSQL layers. No schema, migration, grant, translation, or frontend file was committed.

### Local Fastify measurements

Three interleaved before-and-after run pairs used the same Node runtime and synthetic adapters. Each run warmed two of 13 app instances. For each metric below, the table shows the median of the three run medians. Startup included a real loopback HTTP status request. Route timings use Fastify injection and exclude Supabase and network latency.

| Metric | Baseline | Refactor |
| --- | ---: | ---: |
| App creation | 0.976 ms | 0.934 ms |
| Fastify ready and route registration | 12.888 ms | 13.168 ms |
| Loopback listen after ready | 0.624 ms | 0.648 ms |
| Status injection | 0.070 ms | 0.076 ms |
| Public feed injection | 0.065 ms | 0.070 ms |
| Following feed injection | 0.064 ms | 0.066 ms |
| Notification count injection | 0.061 ms | 0.058 ms |
| Project directory injection | 0.178 ms | 0.187 ms |
| Post-close heap after collection | 34.259 MiB | 34.250 MiB |
| API build artifact | 163,829 bytes | 166,250 bytes |

Each revision made 1,560 verifier calls, 1,560 repository reads and 1,560 RPC-adapter calls per run, including warmup. Registration was 0.28 ms slower in this sample and the bundle grew 2,421 bytes. Timing and heap differences are local observations. Hosted latency, cold process startup and concurrent production load were outside this benchmark.

Final checks passed for typecheck, lint, translation parity, 33 API tests, seven client tests, both production builds, 24 isolated Chromium scenarios and 15 guarded hosted SQL suites. The local browser project and its fixtures were removed. Hosted suites rolled back across Feed, engagement, media and notifications, recommendations, departments, groups, safety, institutions, custom roles, trust, projects, project work, progress, polls and administration.

Members, Groups, Institutions and the Feed repository remain larger modules. Keep their distinct authorization and lifecycle behavior explicit if they are split in later work. The frontend portions of 6E-05 remain for a separate phase, including the Feed presentation, group workspaces, profile, project workspaces and their shared contract boundaries. Findings 6E-06, 6E-07 and 6E-09 remain open. [Backend module boundaries](../ARCHITECTURE.md#text-feed-and-error-handling)

## Phase 6F.4 results

The clean frontend baseline was `ea2c3a0b39e15fe68de852f1d5aa6b1aecca4f6d` on local and remote `main`. Typecheck, lint, translation parity, seven client tests, 33 Fastify tests, both production builds, and the original 24 Chromium scenarios passed. Existing browser logs include a smooth-scroll warning and a React script-tag warning on client navigation.

### Extracted modules and compatibility exports

The original files below remain client entry points under `apps/web/src/components`. The destinations are under `apps/web/src/features`. The line counts include imports and blank lines. The extraction adds file boundaries and explicit imports, so the largest module per feature is a more useful size comparison than the sum of lines.

| Existing entry point | Old → entry lines | Feature folder and extracted responsibilities | New files | Largest new file |
| --- | ---: | --- | ---: | ---: |
| `project-progress.tsx` | 417 → 3 | `projects/progress` has the public and private panel, milestone actions and review, metrics and observations, update and outcome forms, evidence display, and scoped mutation controls | 6 | 120 |
| `groups.tsx` | 423 → 9 | `communities` has directory, group form and settings, invitations, membership and governance, guest routes, and public discussion | 7 | 111 |
| `profile-form.tsx` | 393 → 3 | `profile` has the loader, editor, location fields, previews, form styles, and avatar upload | 6 | 255 |
| `project-work.tsx` | 314 → 4 | `projects/work` has the work index, workspace and progress navigation, team and invitations, volunteer applications and opportunities, tasks, execution management, and scoped mutation controls | 7 | 71 |
| `trust-workspace.tsx` | 293 → 6 | `verification` has impersonation reporting, member appeals, administrative assignment and cases, reviewer appeals, and trust form controls | 5 | 117 |
| `post-media.tsx` | 128 → 4 | `feed/media` has the editor, gallery and dialog, and local and remote previews | 3 | 60 |

- Progress exports `progressTabs`, `ProgressTab`, `PublicProjectProgress` and `ProjectProgressWork`.
- Groups exports `GroupMore`, `TopicSelect`, `GroupsDirectory`, `NewGroup`, `GroupInbox`, `GroupInvitationList`, `GroupManagement`, `ReadOnlyGroupPost`, `PublicGroups` and `PublicGroupRoom`.
- Profile and work export `ProfileForm`, `ProjectWorkIndexScreen` and `ProjectWorkScreen` through their respective entry points.
- Trust exports `ImpersonationReportForm`, `MyVerificationAppeals`, `TrustAdministration` and `VerificationAppealReview`. Feed media exports `PostImageEditor` and `PostMediaGallery`.

The client state still follows the existing loader and mutation boundaries. Project and group forms preserve their request keys, resource invalidation, permission checks, and localized errors. Browser image previews own their abort signals and object URLs. Profile draft state and validation remain together in the editor, and avatar updates use the same member identity provider. The public panels consume the existing server-filtered projections. Organization roles, verification applications, and platform bootstrap each keep their existing authorization path.

### Production build comparison

Both builds used clean Git exports on Node 22.18 with the same installed dependencies. The component and feature source inventory grew from 67 files and 8,949 lines to 101 files and 9,234 lines. All 51 App Router manifest entries matched. Compiled CSS hashes matched byte for byte.

The route rows sum unique JavaScript chunks referenced by each route's Next.js client manifest, including shared chunks. These are raw emitted sizes and include chunks that can load after the initial request.

| Output | Baseline bytes | Refactor bytes |
| --- | ---: | ---: |
| All emitted web JavaScript, 100 files in each build | 2,275,280 | 2,276,283 |
| API JavaScript build | 166,268 | 166,268 |
| `/` | 433,054 | 433,054 |
| `/feed` | 748,579 | 748,580 |
| `/profile` | 622,824 | 623,731 |
| `/onboarding` | 622,823 | 623,730 |
| `/communities` | 790,349 | 790,369 |
| `/communities/new` | 790,588 | 790,610 |
| `/projects/[id]` | 755,408 | 755,418 |
| `/projects/[id]/work` | 772,244 | 772,278 |
| `/verification/review` | 750,586 | 750,608 |

### Local browser measurements

The same Playwright scenario ran three times per clean revision in fresh Chromium contexts. It used Next.js development mode and a disposable local API and Auth stack. The work and progress responses used the test's controlled fixture. The sidebar navigation to My Profile used the local API. The table reports medians. Chromium layout and style counters cover the project interaction and image cleanup. The heap was sampled after explicit garbage collection.

| Measurement | Baseline | Refactor |
| --- | ---: | ---: |
| Open project work until the milestone appears | 390 ms | 342 ms |
| Switch to Outcomes until the report appears | 63 ms | 62 ms |
| Navigate to My Profile from the sidebar until the heading appears | 144 ms | 250 ms |
| Project work reads | 1 | 1 |
| Project progress reads | 1 | 1 |
| Chromium layouts | 28 | 28 |
| Chromium style recalculations | 44 | 43 |
| Post-collection JavaScript heap | 11.32 MiB | 11.31 MiB |

The profile navigation median was slower in the refactor sample. The ranges overlapped at 143–349 ms on the baseline and 118–879 ms on the candidate. The dev server can compile on demand, and these measurements characterize this local scenario only.

### Regression checks

The candidate passed typecheck, lint, translation parity across 24 namespaces and four languages, seven client tests, 33 Fastify tests, both production builds, and all 30 Chromium scenarios. All 23 compatibility exports matched the baseline. The 210 web source modules had no local import cycles. The browser suite exercised 320, 768, 1440, and 2560px, both themes, keyboard and reduced-motion behavior, locale persistence, and draft and session recovery.

Six browser scenarios cover stale milestone edits, outcome display and evidence URL cleanup, private group creation and TOTP-protected invitation acceptance, onboarding failure and resumption, project team and volunteer controls, direct admin and reviewer denial, and a published Feed image with a comment and reaction. Profile plus navbar still make one profile and one platform-access read on the checked initial load. The project team and volunteer tabs share a single project work read.

Seventeen hosted SQL suites passed in rollback-only transactions. The checks covered project eligibility, work, private evidence and independent publication, polling, official departments, member groups, community recommendations, Feed, engagement, following, recommendations, media and notifications, safety, institution authority, organization roles, verification trust, and administration. The production API, shared contracts, and database files had no diff. Hosted migration changes were outside this phase.

The layout checks were structural and included a compilation-level CSS comparison. Pixel diffs, individual React component profiling, cross-engine testing, screen-reader speech, natural token expiry, hosted email delivery, and production load remain outside this validation.

### Open work

6E-05 progressed across the six frontend entry points above. The Feed timeline and discussion still warrant review after the local icon work is integrated. Institutional management, organization roles, and verification applications were reviewed. Their existing forms and permission boundaries remain in their current modules. The profile editor, polls, project directory and detail, official department workspace, and authentication screens still have larger modules. Findings 6E-06, 6E-07 and 6E-09 remain open. Shared contracts belong to the next phase. [Frontend structure](../ARCHITECTURE.md#frontend-feature-modules)
