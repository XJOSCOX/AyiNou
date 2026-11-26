# C3.4 Volunteer coordination and recruitment

## Scope

C3.4 adds a manual invitation to apply from Project Work’s opportunity-specific discovery. It adds an invitation inbox under Volunteer profile and links to it from Project Work and Notifications. The invitation points to the existing volunteer application. Applications, offers, decisions, acceptance, team memberships, tasks and milestones remain under native Project Work. No invitation can publish an opportunity or create a team role.

## Data model and API

Five private relations store an empty disposable gate, purpose-specific current contact consent, Founder configuration, exact-revision invitations and lifecycle receipts. An optional reference identifies the native application when an eligible, visible pending invitation exists at application insertion. The service command binds the actor and Auth session. Organizer selection is encrypted and expires after five minutes. It binds the discovered handle and published version to the actor, session, project and opportunity. Read pages contain at most 20 items and have private cache headers. See the [recruitment policy](C3_4_RECRUITMENT_POLICY.md).

## Permissions and audit

An eligible organizer needs native recruitment authority, current identity and account standing, and a current actionable opportunity. Recipients need both discovery and contact consent along with current privacy, availability, account, community and project eligibility. Screening-flagged opportunities are excluded. Member projections expose current invitation content only for the authorized parties while eligible. Founder preparation requires current recognized authority, recent MFA, original private workspace, expected version, recorded reason and confirmation. There is no live activation permission or action. Invitation sends, decisions, invalidations and native application links commit with their event receipts. Report delivery reuses the existing project moderation queue.

## Privacy and lifecycle

Contact permission defaults off. Withdrawing it invalidates pending invitations while preserving applications and existing commitments. Expired and invalidated invitations lose their invitation content and action links. Native blocks and mutes affect eligibility and notification visibility. Messages are bounded plain text. The notice payload has only an invitation ID and status. Ownership, privacy export and legal-hold integration require operational review before launch. See [privacy and safeguarding](C3_4_PRIVACY_AND_SAFEGUARDING.md).

## Localization and accessibility

English, Haitian Creole, French and Spanish cover consent, readiness, invitation actions, statuses, notice labels and safety copy. Screens use the existing member shell, adaptive layout, native controls, keyboard-accessible disclosure, and current light and dark theme values.

## Reliability and recovery

Native application creation, invitation attribution, and the resulting notice are transactional. Each protected command has an expected version and receipt. A fixed discovery cohort and indexed pending and recent invitation queries limit work. A bounded SQL update reconciles each invitation page. Targeted triggers record invalidation on common eligibility changes and are inert with empty fixture gates. For a release defect, keep matching and invitation operations disabled and make a forward correction. See the [activation design](C3_4_ACTIVATION_DESIGN.md).

## Validation and CI

Enabled workflows use disposable Supabase and test-only accounts. Hosted verification uses the connected local app, the existing Test02 and Founder sessions, and read-only database checks. Routine GitHub Actions were skipped. The 29-scenario disposable regression run passed across Community Needs, Outcomes, Impact, Project Work, and C3.1–C3.4. The corrected release passed the four C3.4 cases and the affected C3.1–C3.3 and native Project Work regressions. A combined rerun exposed pre-existing fixture coupling between suites sharing a catalog. Matching and volunteer profiles passed in separate disposable databases. Local type checking, lint, unit tests, shared contracts, translation validation, engineering standards, and both local and production-mode builds passed. A disposable test caught a SQL argument collision. Final review also identified an invalidation gap for membership in a project’s associated community and indirect organizer authority changes. The corrected migration covers those dependencies, and the leave-and-rejoin regression passed. See the [security tests](C3_4_SECURITY_TESTS.md).

## Hosted rollout

- Target AyiNou `hcbxulyfmdmuyccgrujs`, identified by the CLI as production.
- Verified release `de4271b050b0f245bf34ef9676ae1ff56fe1e0c5`.
- Applied only `20261125133000_c34_volunteer_recruitment.sql`.
- SHA-256 `0683747e830271c03eddc7cc59faddf17f280818eee16e22a2a021e4642b8c5c`.
- Fresh preflight found 147 applied and only C3.4 pending. Postflight found 148 applied and zero pending.
- All 110 legacy data fingerprints matched, including member data, profile consent, opportunity requirements, applications, team invitations, team memberships, reports and existing notification fields. Legacy table grants, RLS policies and triggers matched. The two extended notification routines kept their grants and checked bodies.
- Five new private tables have RLS and deny direct app-role access. The command is service-only and session-bound. Postflight verified 13 new function bodies, two modified notification function bodies and 13 explicit indexes. The initial index assertion included indexes generated by constraints. A corrected read-only comparison verified each explicit index by name.
- C1, C2 and C3 gates stayed closed. Recruitment fixture, consent, configuration, invitation, event and notification records remained empty.

## Connected local application

All 58 read-only HTTP checks passed after migration. Test02 saw the closed contact preference and inbox, found the recruitment link in Project Work, and was denied Founder settings. J0SC0X opened the original private workspace, saw version zero, all ten department choices and the default expiry, caps and cooldown. The staged readiness view kept live recruitment closed and marked public skills disclosure unimplemented. The browser check saved no configuration or recruitment records. Next.js and Fastify ran locally against hosted Supabase.

## Documentation and operations

The [recruitment policy](C3_4_RECRUITMENT_POLICY.md) specifies the default expiry, caps and cooldowns.

## Disposable performance

A 1,000-row invitation history returned 20 items and one continuation. Three loopback inbox reads took 18, 15 and 14 ms, with 4,093-byte responses. Three creation requests took 65, 66 and 82 ms. A simultaneous retry through the second API instance took 71 ms and returned the same invitation ID. The recipient index read 21 keys with a 0.093 ms PostgreSQL plan execution time. These samples cover short, warm, isolated runs with terminal invitation history. They do not establish production throughput or concurrent performance for large active populations.

Recruitment preview checks only the selected candidate. It avoids running the broader C3.3 discovery cohort query again. C3.3 discovery remains the slower step and preserves its bounded cohort. Before live recruitment, replace or validate the short global quota and invalidation lock with wider concurrent load, and measure pending-heavy reads and policy invalidation on a representative workload.

## Remaining blockers

Approve separately scoped activation and pause controls, operational safeguarding, abuse monitoring, capacity thresholds, member notice policy and lifecycle integration. Validate contention under concurrent writes and verify provider-backed recovery before live rollout. C3.4 introduces no live activation or public skills disclosure.
