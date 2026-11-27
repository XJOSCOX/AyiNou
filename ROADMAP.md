# Ayinou — Roadmap and Phase Gates

**Updated:** 2026-11-19
**Development mode:** Local Next.js/Fastify with hosted Supabase Auth/PostgreSQL
**Repository strategy:** One `main` branch, direct commit + push; no PRs

**Rule:** Work on one phase at a time. Each phase is complete only when its acceptance checklist is met, documentation is updated, and local quality checks pass. Do not use calendar deadlines as a substitute for testing.

## Moderation and enforcement

- [x] M1 audited moderation, enforcement, appeal and audit coverage.
- [x] M2.1 adds a read-only Moderation Center to private Platform Administration. Local acceptance and hosted migration status are recorded separately.
- [x] M2.2 adds temporary account suspensions, Founder-only bans, authorized reinstatement and member notices.
- [x] M2.3 adds scoped capability restrictions and explicit moderator delegation.
- [x] M2.4 adds independent account, feature restriction, and event appeals and report-linked event moderation. Hosted database rollout verified.

- [x] M2.5 adds Founder moderation policy limits, approved categories and delegations, and audited version restoration. Hosted database rollout and the connected local application were verified. [M2.5 implementation](docs/moderation/M2_5_IMPLEMENTATION_REPORT.md)

- [x] M3 audits moderation integration, authority, and lifecycle. The project guard is verified on the hosted database and the connected local app passed its read-only checks. [M3 audit](docs/moderation/M3_AUDIT_SUMMARY.md)

- [ ] P1 verified launch boundaries and prepared two database corrections. Public release remains blocked on recovery and operating requirements and a Founder poll privacy decision. [P1 audit](docs/production-readiness/P1_AUDIT_SUMMARY.md)

[M1 audit](docs/moderation/M1_AUDIT_SUMMARY.md) · [M2.1 implementation](docs/moderation/M2_1_IMPLEMENTATION_REPORT.md) · [M2.2 implementation](docs/moderation/M2_2_IMPLEMENTATION_REPORT.md) · [M2.3 implementation](docs/moderation/M2_3_IMPLEMENTATION_REPORT.md) · [M2.4 implementation](docs/moderation/M2_4_IMPLEMENTATION_REPORT.md) · [Approved policy baseline](docs/moderation/M2_APPROVED_POLICY_BASELINE.md)

## Phase 0 — Foundation (COMPLETE)

**Outcome:** A secure, runnable, maintainable local application without premature social features.

- [x] Create npm workspaces with Next.js + TypeScript + Tailwind web, Fastify + TypeScript API, and shared response contracts.
- [x] Set up environment example, `.gitignore`, and Zod API environment validation.
- [x] Add locale dictionaries and a functional language switcher for `ht` (default), `fr`, `en`.
- [x] Build a responsive placeholder homepage and API connection indicator, including an offline message.
- [x] Add structured API logging, safe CORS, centralized errors, `/health`, and `/api/v1/status`.
- [x] Add typecheck, lint, API endpoint tests, and production build scripts.
- [x] Update README, roadmap, architecture, and workflow documentation.

Supabase setup, migrations, RLS, authentication, and registration were deferred from Phase 0. CI and abuse prevention will be planned with functional features.

**Gate:** Clean install works; all three languages display; API and web run locally; tests, lint, typecheck, and build pass; no secrets committed.

## Phase 1A — Supabase database foundation (COMPLETE)

- [x] Pin the Supabase CLI and add local Docker development configuration.
- [x] Add a versioned migration for ten Haiti departments, public profiles, private member details, role assignments, and verification records.
- [x] Reference `auth.users` for identity and distinguish residence from diaspora department of connection.
- [x] Support `ht`, `fr`, and `en` preferences with Haitian Creole as the default.
- [x] Enable RLS and explicit grants on every application table; deny client writes to roles and verification.
- [x] Add an idempotent, server-only, atomic profile initialization function for later signup integration.
- [x] Reset the local database and pass 30 pgTAP schema, constraint, and RLS assertions.
- [x] Preserve the independent Fastify API and existing web behavior.

**Gate:** Local migration reset, RLS tests, typecheck, lint, API tests, and builds pass. No signup or login is implemented.

## Phase 1B — Registration, login, onboarding, profiles (COMPLETE)

- [x] Supabase Auth: email/password, email confirmation, password recovery, session refresh/restoration, and logout.
- [x] Registration: display name, email, password, and preferred language; no real name or phone collected.
- [x] Ask optional residence country and Haiti department, or diaspora department of connection.
- [x] Never require GPS or store precise coordinates.
- [x] Edit profile and broad location; document future account deletion and export lifecycle. Public visibility remains under a trusted future workflow.
- [x] Connect Phase 1A tables to authenticated Fastify API routes with token verification and RLS.
- [x] Use Supabase Auth rate limits and email confirmation for the local flow.

**Gate:** Signup → verification → onboarding → session refresh → editing → logout works in three languages; RLS blocks access to another user's private fields.

## Hosted Supabase transition — Phase 1B infrastructure (IMPLEMENTED; email flow validation pending)

- [x] Confirm the owner's AyiNou project reference `hcbxulyfmdmuyccgrujs` before remote changes.
- [x] Preserve the Phase 1A schema and policies; apply its migration and the versioned API RPC migration to the hosted project.
- [x] Make hosted Supabase the default development service while keeping Next.js on port 4000 and Fastify on port 3000.
- [x] Keep privileged keys only in Fastify; retain Docker/pgTAP as optional isolated checks.
- [x] Configure hosted email confirmation and localhost callback/reset redirects without weakening Auth protections.
- [x] Add guarded synthetic-account integration checks with targeted cleanup.

**Gate:** Hosted schema, API, RLS, profile edits, refresh and logout checks pass; typecheck, lint, unit tests, and builds pass. End-to-end registration, email confirmation, password reset, and real token expiry remain unverified until controlled mailbox testing is available.

## Phase 2 — Community dashboard and member counts (COMPLETE)

- [x] Count eligible registered, non-deleted members without exposing identifiable data.
- [x] Count self-reported residence in Haiti and its ten departments.
- [x] Group diaspora members by current residence country; never count department of connection as residence.
- [x] Distinguish unknown/undisclosed location from zero or suppressed values.
- [x] Suppress all geography together when any nonempty atomic location group is below 10.
- [x] Define registered, active (profile activity in 30 UTC days), and approved verified counts separately.
- [x] Store only one daily activity marker per member and document its purpose and retention requirement.

**Gate:** Hosted synthetic fixtures verify grouping, exclusions, zero state, and suppression; no user-level location or private profile disclosure. Email delivery remains outside this phase.

## Phase 2B — Welcome and member profiles (COMPLETE)

- Multilingual welcome, sign-in, registration, and resumable onboarding.
- Private names and self-declared membership with a username, optional photo, biography, and interests.
- Member privacy settings, a public profile preview, and privacy-filtered membership statistics.
- External email delivery remains unverified. Synthetic confirmed accounts cover the hosted profile and authorization flows.

## R2.2 — Registration, signup and referrals

- Independent Personal Signup and Organization Signup controls, trusted Auth enforcement, registration invitations and referral settings. Hosted status follows the [implementation report](docs/rules/R2_2_IMPLEMENTATION_REPORT.md).

## Phase 2C — Account settings and referrals

- [x] Harden profile writes at the database boundary and keep both profile RPCs compatible.
- [x] Generate stable private member codes and separate, shareable referral codes.
- [x] Capture optional referral attribution at account creation and confirm it after email confirmation.
- [x] Add localized account settings, Supabase Authenticator MFA, and a full-width responsive dashboard.
- [x] Document the future identity verification challenge model.

## Phase 2D — Institutional accounts and manual verification

- [x] Create institutional profiles with separate public and private contact fields, sanitized logos, unique handles, broad geography and explicit verification status.
- [x] Add in-app invitations, scoped representation, expiry, revocation, and an account switcher using the same personal session.
- [x] Add pending evidence-reference applications, ownership claims, restricted two-reviewer approvals, written decisions, and audit history.
- [x] Rework My Profile to use the full responsive member workspace.

Activation of temporary proof challenges and external evidence delivery remains deferred. Prospective reviewers must be provisioned separately after conflict, retention, and operational policies are approved.

## Phase 2D.1 — Ordinary institutional affiliations

- [x] Separate member, volunteer, staff, and supporter affiliations from authorized representation.
- [x] Support direct joins, approvals, recipient-bound invitations, member actions, and private history.
- [x] Keep official institutions invitation-only and require consent for public directory entries.
- [x] Add localized membership and management controls to the existing responsive institution pages.

## Phase 2E — Platform administration and account security

- [x] Add the MFA-gated platform workspace, operational metrics, scoped account search, restrictions, roles, and audit history.
- [x] Enforce live session and account eligibility in Fastify and owner-facing database access.
- [x] Extend independent verification review with assigned work and decision history.
- [x] Add password change with reauthentication, sign-out everywhere, and administrator authenticator protection.
- [ ] Provision the first operational administrator through the controlled bootstrap and agree on audit retention, escalation, reviewer assignments, and appeals before public use.

## Phase 2F — Spanish localization (COMPLETE)

- [x] Add Spanish across the current public, member, institution, verification, and administrator screens.
- [x] Keep Haitian Creole as the default and let members save any of the four languages.
- [x] Validate dictionary keys and placeholders, hosted profile persistence, and responsive screens in both themes.

## Phase 3A — Text feed, reporting, and error handling

- [x] Add chronological pages, text posting, private drafts, and versioned edits and deletion.
- [x] Add private reports, MFA-gated moderation, and recorded hide, restore, removal, and closure decisions.
- [x] Share safe request references and localized errors across application clients.
- [x] Add durable per-member write quotas and bounded local read quotas.

## Phase 3B — Comments, replies, and reactions

- [x] Add paginated text comments with one reply level, versioned edits, and private report submission.
- [x] Add one reaction per member per post or comment, with counts and replacement.
- [x] Add comment review queues and versioned MFA-gated decisions. Reuse localized errors and database-enforced abuse limits.

## Phase 3C — Following and discovery

- [x] Add indexed member and institution search, public profile follow controls, and limited account suggestions.
- [x] Add privacy-filtered follower lists, counts, and a chronological following feed.
- [x] Keep institutional following independent from membership, representation, and verification.

## F2.1 — Social interactions and following (COMPLETE AND DEPLOYED TO HOSTED DEVELOPMENT DATABASE)

- [x] Extend the existing graph with mutual follows, organization posts, and per-account repost preferences.
- [x] Add reposts, quote posts, private saves, canonical mentions, Unicode hashtags, and interaction notification preferences.
- [F2.1 implementation and release evidence](docs/F2_1_SOCIAL_INTERACTIONS.md)

## F2.2 — Feed experience and conversations (IMPLEMENTED; LOCAL VALIDATION)

- [x] Improve image gallery navigation, conversation context, post attribution, feed loading, and composer drafts.
- [F2.2 implementation report](docs/F2_2_FEED_EXPERIENCE_IMPLEMENTATION_REPORT.md)

## F2.3 — Organization publishing and social integration

- [x] Add organization announcements, profile Posts, scoped pins, organization quotes and public project links.
- [ ] Finish organization engagement, announcement notifications and release verification.
- [F2.3 implementation report](docs/F2_3_ORGANIZATION_PUBLISHING_IMPLEMENTATION_REPORT.md)

## F2.4 — Discovery, member profiles, following and privacy

- [x] Add member and post discovery, profile activity, follow requests, and a personal Followers audience.
- [x] Verify the hosted schema and the local application connected to it against the tested release.
- [F2.4 implementation and release evidence](docs/F2_4_SOCIAL_PRIVACY_IMPLEMENTATION_REPORT.md)

## F2.5 — Community Events and Multilingual Feed

- [x] Add scoped Events discovery, organizer tools, RSVP capacity, event notices, and event sharing to Feed.
- [x] Add independent content-language preferences and explicit translation controls with a provider-unavailable state.
- [Implementation and release notes](docs/F2_5_EVENTS_AND_FEED_IMPLEMENTATION_REPORT.md)

## Phase 3D — For You recommendations

- [x] Add an optional rules-based feed with explicit topics, explanations, and member controls.
- [x] Keep Latest and Following chronological and preserve My Posts and Drafts.
- [x] Apply privacy and moderation eligibility before ranking and again during snapshot pagination.

## Phase 3E — Post images and in-app notifications

- [x] Add private post images, bounded WebP derivatives, previews, alt text, reordering, and guarded cleanup.
- [x] Add a member inbox, unread count, read controls, and four event preferences.
- [x] Recheck live permissions for image requests, notification previews, and linked targets.

## Phase 3F — Member safety and moderation appeals

- [x] Block or mute an individual account with private self-service lists.
- [x] Appeal eligible hide decisions and require an independent, recently authenticated reviewer.
- [x] Add shared read quotas, safety counts, and bounded cleanup with evidence holds.

## Remaining Phase 3 — Social network MVP

- [ ] Institution-authored posts.
- [ ] Additional media abuse detection and operational monitoring before launch.
- [ ] Confirm retention and account-deletion policies, staffing for independent appeals, and production quota tuning.
- [ ] No unmoderated live broadcast or unlimited DMs at this phase.

**Gate:** Feeds behave correctly at load; user permissions enforced; reports can be reviewed; moderation tested.

## Phase 4A — Official department communities

- [x] Seed a stable space for each authoritative Haiti department.
- [x] Add voluntary multi-room membership, rules, and an opt-in member directory.
- [x] Reuse posts, media, discussions, reports, and appeals behind a members-only room boundary.
- [x] Add room-scoped moderation roles with platform-admin oversight.

## Phase 4B — Diaspora and topic groups

- [x] Define group policy, discovery, ownership and scoped governance.
- [x] Support group creation, public joins, requests, invitations, private discussions and scoped moderation.
- [ ] Add a group archival and removal-review workflow if needed for launch.

**Gate:** Group access and moderation policy tests pass; reporting/escalation is practical for moderators.

## Phase 4C — Community discovery and recommendations

- [x] Add recommended communities, private feedback, and public category discovery filters.
- [x] Show joined and managed communities, pending requests, and invitations in the existing workspace.
- [ ] Add reversible archival, membership-removal appeal operations and recipient-safe group notification events.

## Phase 5A — Identity verification, impersonation and appeals

- [x] Separate administrator bootstrap trust from public identity and public-figure badges.
- [x] Extend reviewer assignment governance and the two-reviewer approval workflow from Phases 2D and 2E.
- [x] Add private impersonation reports, independent verification appeals and in-app decision updates.
- [ ] Establish an approved independent channel for proof-of-control challenges and an operational evidence-retention schedule.
- [ ] Staff independent review before launch.

## Phase 5B — Institutional verification and trust governance

- [x] Apply assignment and evidence privacy rules to institutional, ownership and representative cases.
- [x] Publish category-specific institution badges and opt-in representative badges that follow current authority.
- [x] Record institutional impersonation decisions with independent administrator and authenticator checks.
- [x] Reuse verification appeals and private decision notices for institutional cases.
- [ ] Appoint eligible operational reviewers and adopt the evidence retention and restriction review procedures before public operation.

## Phase 5C — Founding Ambassadors

- [x] Publish nonpartisan selection criteria and a searchable, opt-in directory.
- [x] Record private nominations and recipient-bound invitations with written reasons and recent TOTP.
- [x] Require independently reviewed identity for public recognition while allowing private participation.
- [x] Support voluntary withdrawal, suspension, revocation, and independent reconsideration.
- [ ] Staff identity review and independent program reconsideration before inviting real participants.

## Phase 5D — Custom organization roles and team permissions

- [x] Add scoped operational roles, multiple assignments per member, and an effective-permission matrix.
- [x] Connect description editing and ordinary affiliation operations to separate capability checks.
- [x] Require recent TOTP for role changes and audit assignments, edits, deactivation, and lifecycle revocations.
- [x] Show authorized team details and private role notices.
- [x] Enable organization proposal permissions with Phase 6A.
- [ ] Enable task, volunteer, recruitment, finance, and announcement permissions alongside their backend workflows.

## Phase 6 — Initiatives, projects and volunteers

- [x] Phase 6A supports proposals with broad geography, an accountable owner, and immutable revisions.
- [x] Phase 6A adds independent review, eligible public discovery, private reports, and audit history.
- [x] Phase 6A.1 keeps ordinary drafts private and gates submission and publication on reviewed identity and current accountability.
- [ ] Staff independent identity review so eligible applicants can complete verification.
- [ ] Set staffing, review targets, retention, and a publication restriction reconsideration process before public operation.
- [x] Phase 6B adds project execution status, scoped teams, volunteer applications, and task assignment and review.
- [x] Phase 6C adds reviewed milestones, public progress updates, private evidence, self-reported measures, and versioned final reports.
- [x] Phase 6D adds scoped polls and private ballots, frozen higher-trust eligibility, nominee consent, and auditable recommendations.
- [ ] Phase 6E audits the codebase, architecture, authorization, privacy, tests, and operational readiness.
- [x] Phase 6F closes the tested engineering stabilization scope. Public launch readiness remains open. [Final engineering review](docs/audits/PHASE_6F_FINAL_REVIEW.md)
- [x] Phase 6F.1 consolidates responsive workspaces, improves local request performance, refreshes scheduled polls and navbar avatars, and isolates the aggregation regression fixture.
- [x] Phase 6F.2 adds automated browser regression tests with an isolated local Supabase stack and verified fixture cleanup.
- [x] Phase 6F.3 splits Fastify Feed and Project Review into domain modules and verifies the existing route contracts.
- [x] Phase 6F.4 extracts project, community, profile, trust, and Feed media modules while preserving the web routes and client entry points. [Test and build comparison](docs/audits/PHASE_6E_AUDIT.md#phase-6f4-results)
- [x] Phase 6F.5 organizes shared TypeScript contracts by domain and adds automated checks for public compatibility. [Contract and build comparison](docs/audits/PHASE_6E_AUDIT.md#phase-6f5-results)
- [x] Phase 6F.6 improves scoped poll lookups, updates the affected build dependency, bounds remote API calls, and adds main-branch CI. [Performance and reliability validation](docs/audits/PHASE_6E_AUDIT.md#phase-6f6-results)
- [x] Phase 6F.7 completes the integration, authorization, privacy and release-readiness review. [Final review](docs/audits/PHASE_6F_FINAL_REVIEW.md) · [Data lifecycle inventory](docs/audits/PRIVACY_DATA_INVENTORY.md)
- [ ] Define independent outcomes validation, retention, fraud escalation, quorum standards, and operational voting governance.
- [x] C2.1 private outcome validation requests in Project Work. Source revision and evidence binding were verified and the hosted database migration is applied. Live intake remains closed. [Implementation report](docs/project-outcomes/C2_1_IMPLEMENTATION_REPORT.md)
- [x] C2.2 independent project outcome evidence review. Scoped assignments, private findings, corrections and challenges passed disposable verification. The hosted database migration is verified. Live processing remains closed. [Implementation report](docs/project-outcomes/C2_2_IMPLEMENTATION_REPORT.md)
- [x] C2.3 adds controlled publication of current independent findings with exact organizer consent and a separate departmental decision. Hosted database rollout verified. Live publication remains disabled. [Implementation report](docs/project-outcomes/C2_3_IMPLEMENTATION_REPORT.md)
- [x] C2.4 adds department and national Impact reporting, an independently governed measurement catalog, exact source mappings, and complementary disclosure controls. Hosted database rollout verified. Real reporting remains disabled. [Implementation report](docs/project-outcomes/C2_4_IMPLEMENTATION_REPORT.md)
- [x] C2.5 completed the gated C2 development audit, corrected report invalidation and verified the hosted database. Public launch remains gated. [Completion decision](docs/project-outcomes/C2_FINAL_COMPLETION_DECISION.md)
- [x] C2.6 separates Founder configuration and reviewer readiness from C2 live activation. The hosted database migration is verified with all live gates closed. [Implementation report](docs/project-outcomes/C2_6_CONFIGURATION_ACTIVATION_SEPARATION.md)
- [ ] Non-monetary contributions first (time, skills, supplies); no platform-held funds yet.

**Gate:** An initiative can be proposed, reviewed, organized, updated, completed and archived with transparent responsibility.

Feature development pauses here for owner review of the engineering results and public launch blockers before advancing the product roadmap.

## Phase 7 — Community reports and evidence-based verification

- [x] C1.1 private Community Needs foundation in Communities. Drafts, confirmed submissions, withdrawal, revision receipts and owner-only access are implemented. The hosted database migration was applied and verified on November 24, 2026. Real intake remains disabled. [Implementation report](docs/community-needs/C1_1_IMPLEMENTATION_REPORT.md)
- [x] C1.2 private triage, independent evidence review, author corrections, challenges, and scoped intake restriction. The hosted C1.2 database migration was applied and verified on November 24, 2026, with 132 applied migrations and zero pending. Live intake and review remain disabled. [Implementation report](docs/community-needs/C1_2_IMPLEMENTATION_REPORT.md)
- [x] C1.3 community-only publication snapshots, independent approval, attribution consent, participation and publication challenges. The hosted C1.3 database migration was applied and verified on November 24, 2026, with 133 applied migrations and zero pending. Live intake, review and publication remain disabled. [Implementation report](docs/community-needs/C1_3_IMPLEMENTATION_REPORT.md)
- [x] C1.4 consent-based associations between reviewed Community Needs and project proposals. The scoped hosted database migration was verified on November 24, 2026, with 134 migrations applied, zero pending, and all four gates closed. Hosted application release remains separate. [Implementation report](docs/community-needs/C1_4_IMPLEMENTATION_REPORT.md)
- [x] C1.5 Community Needs integration and controlled Ouest pilot readiness review. The native lifecycle and authorization passed in disposable Supabase. The verified hosted cursor repair brings the database to 135 applied migrations and zero pending. The proposed pilot remains gated. [Integration report](docs/community-needs/C1_5_INTEGRATION_REPORT.md)
- [x] C1.6 Founder-controlled Ouest pilot preparation, enrollment, capacity, pause and readiness checks. The approved hosted migration was verified with 136 applied and zero pending. Real processing remains closed. [Implementation report](docs/community-needs/C1_6_IMPLEMENTATION_REPORT.md)
- [x] C1.7 Prepare operations for all ten departments with Ouest as the proposed first controlled pilot. Add protected readiness detail and document independent staffing, privacy, recovery, hosting, and the no-go decision. Hosted schema verified at 137 applied and zero pending. Live processing remains closed and hosted applications await an authorized destination. [Operational readiness](docs/community-needs/C1_7_OPERATIONAL_READINESS.md)
- [x] C1 development closure. The integrated workflow passed in all ten departments. Hosted preservation and closed stages were verified. Ouest remains the only eligible initial pilot scope. Public launch remains no-go. [Completion decision](docs/community-needs/C1_FINAL_COMPLETION_DECISION.md)
- [x] C1 nationwide department configuration. Isolated settings, cohorts, staffing, limits, pause and readiness were verified for all ten existing department communities. The hosted database migration is verified and public processing remains disabled. [Implementation report](docs/community-needs/C1_NATIONWIDE_IMPLEMENTATION_REPORT.md)
- [ ] Authorize and activate a real Ouest pilot after production activation, reviewer staffing, privacy and recovery approvals. [Owner decisions](docs/community-needs/C1_5_OWNER_DECISIONS.md)
- [ ] Extend structured reporting to local events and general public claims.
- [ ] Support confirmations, challenges, credible sources, and safe evidence submission.
- [ ] Review statuses: unverified, under review, verified, misleading, false, inconclusive.
- [ ] Separate witness attestations and popularity from editorial verification.
- [ ] Independent review, written rationale, corrections, appeals, version history.
- [ ] Crisis protections: no live precise locations, no doxxing, escalation of credible threats, consent rules.

**Gate:** Review and appeal workflows are independently tested; safety/abuse threat review completed.

## Phase 8 — Radio and media

- [ ] Station onboarding and verified official accounts.
- [ ] Add station-provided authorized streaming links and rights review.
- [ ] Browsing by department, genre and language; schedule and show listings.
- [ ] Audio player with reliable states; respect audio licensing and stream provider rules.
- [ ] Moderation for station discussion features.

**Gate:** All listed streams have explicit authorization and usable playback; rights and abuse processes documented.

## Phase 9 — Compliant contributions and opportunities

- [x] C3.1 private volunteer profile, versioned skills catalog, independent consent and Founder preparation. Hosted database verified with live participation closed. [Implementation report](docs/volunteering/C3_1_IMPLEMENTATION_REPORT.md)
- [x] C3.2 structured opportunity requirements, approved-scope checks, applicant history and Founder configuration. Hosted database verified with live processing closed. [Implementation report](docs/volunteering/C3_2_IMPLEMENTATION_REPORT.md)
- [x] C3.3 private volunteer recommendations, scoped organizer discovery and Founder matching preparation. Hosted schema verified with live matching and discovery closed. [Implementation report](docs/volunteering/C3_3_IMPLEMENTATION_REPORT.md)
- [x] C3.4 recruitment invitations, separate contact consent, and native application integration. Hosted schema verified with live recruitment closed. [Implementation report](docs/volunteering/C3_4_IMPLEMENTATION_REPORT.md)
- [x] C3.5 protected volunteer activation and emergency pause, integration audit and development verification. Database rollout verified with all operational gates closed. [Final decision](docs/volunteering/C3_FINAL_COMPLETION_DECISION.md)
- [x] C4.1 private, versioned professional and educational opportunities and protected Founder preparation. Hosted database verified with all operational gates closed. [Implementation report](docs/opportunities/C4_1_IMPLEMENTATION_REPORT.md)

- [x] C4.2 independent opportunity publication, external destination review, native Event association and expressions of interest. Hosted schema verified. Live operations remain closed. [Implementation report](docs/opportunities/C4_2_IMPLEMENTATION_REPORT.md)
- [x] C4.3 private mentor and mentee profiles, independent consent and Founder preparation. Hosted schema verified. Live operations remain closed. [Implementation report](docs/opportunities/C4_3_IMPLEMENTATION_REPORT.md)
- [x] C4.4 private mentorship matching, discovery, requests, agreements and coordination. Hosted schema and connected Founder/member access verified. All live stages remain closed. [Implementation report](docs/opportunities/C4_4_IMPLEMENTATION_REPORT.md)
- [x] C4.5 Opportunities directory, private saved listings and independent personalization. Hosted schema verified and live operations remain closed. [Implementation report](docs/opportunities/C4_5_IMPLEMENTATION_REPORT.md)
- [x] C4.6 final integration, exact independent review acceptance, ten stage controls and scoped emergency pauses. Hosted database verified with all ten stages disabled. Public launch remains gated. [Completion decision](docs/opportunities/C4_FINAL_COMPLETION_DECISION.md)

### Approved future milestones

| Milestone | Scope |
| --- | --- |
| C4 | Mentorship, Education and Opportunities |
| C5 | Trusted Haitian Media and Information |
| C6 | Donor Connections, Resource Assistance and Organization Donor Recognition |
| C7 | Mobile Access and Expansion |
| C8 | Recognition, Honors and Annual Awards |
| G-Series | Governance and Operational Readiness |

Integrated project payments, financial custody, fund distribution, and escrow are deferred indefinitely. Each future release requires its own protections, readiness evidence and approval.

## Phase 10 — Native apps and expansion

- [ ] A0 remote API readiness. Render is deployed and signup is closed. Provider ingress confirmation and authenticated checks remain pending. [Setup guide](docs/deployment/A0_RENDER_BACKEND_SETUP.md)
- [x] A1 native Android foundation and local development APK. [Implementation report](docs/android/A1_FOUNDATION_IMPLEMENTATION_REPORT.md)
- [ ] Determine Android/iOS architecture and shared API/data contracts.
- [ ] Push notifications, efficient networking, offline/low-bandwidth modes.
- [ ] Accessibility and device testing; App Store / Play policy review.
- [ ] Infrastructure, monitoring, incident response and production readiness review.
- [ ] Gradual, safeguarded public rollout.

**Gate:** Security, performance, reliability, governance and incident-response readiness approved before public launch.

## Standard completion checklist for EVERY phase

- Legal L3.2 adds a private, synthetic-only foundation for privacy case intake, tracking and withdrawal. Live intake, assigned review, data export and erasure remain gated. [L3.2 implementation report](docs/privacy/L3_2_IMPLEMENTATION_REPORT.md)
- Legal L3.3 adds field-allowlisted synthetic exports with encrypted artifacts and authenticated downloads. Real export availability, legally approved disclosure categories and account erasure need separate approval. [L3.3 implementation report](docs/privacy/L3_3_IMPLEMENTATION_REPORT.md)
- Legal L3.4 adds deletion dependency plans, independent synthetic hold authority and reversible reconciliation. Live erasure and retention enforcement are disabled. [L3.4 implementation report](docs/privacy/L3_4_IMPLEMENTATION_REPORT.md)
- Legal L3.5 verifies synthetic intake, export and lifecycle boundaries. Production privacy operations, provider-backed restoration, legal-policy readiness and public launch remain blocked. Owner review precedes L4 policy revisions. [L3.5 verification and readiness](docs/privacy/L3_5_FINAL_VERIFICATION.md)
- Legal L4 expands the English core policies and prepares specialized policy, internal governance, and future-capability drafts. Everything remains pending owner and qualified legal review. L5 translation and approval preparation is a separate milestone. [L4 report](docs/legal/L4_FINAL_REPORT.md) · [Approval register](docs/legal/L4_APPROVAL_AND_GAP_REGISTER.md)
- Legal L5 freezes the L4 English drafting source and prepares Haitian Creole, French and Spanish working translations of the ten public core and specialized policies. Structural checks and review/version registers support owner, qualified linguistic and jurisdiction-specific legal review. No version is adopted or published; L6 and legal acceptance controls remain future work. [L5 report](docs/legal/L5_FINAL_REPORT.md) · [Readiness gates](docs/legal/L5_PUBLICATION_READINESS.md)

- [ ] Scope and acceptance criteria documented
- [ ] Typecheck, lint, unit/integration tests and build pass locally
- [ ] Relevant RLS allow/deny and migration tests pass
- [ ] Accessibility and all four locales checked
- [ ] Security, privacy and abuse cases considered
- [ ] README, roadmap, decisions and migration notes updated
- [ ] Small meaningful commits pushed directly to `main` after review

## Not included at launch

Cryptocurrency, direct cash custody, official elections, algorithmic truth-by-majority, unattended crisis mapping, unverified celebrity endorsements, or sensitive-location tracking.
# L6.1 Legal Center infrastructure

Public, anonymous legal routes and a fail-closed empty release registry are implemented. Actual policy publication and versioned acceptance remain gated for L6.2. See [L6.1 report](docs/legal/L6_1_IMPLEMENTATION_REPORT.md).

## L6.2A legal administration foundation

The platform administrator can inspect versioned publication settings and audit history. All policies start as disabled drafts. Public release visibility requires both the server control and an approved immutable release. Legal approval, acceptance collection and privacy processing remain separate gated work. [L6.2A controls](docs/legal/L6_2A_ADMIN_PUBLICATION_CONTROLS.md)



## Organization expansion initiative

- [x] O1 design and database impact review. [Architecture](docs/organizations/O1_ONBOARDING_ARCHITECTURE.md) · [Owner decisions](docs/organizations/O1_OWNER_DECISION_BRIEF.md)
- [x] O2 personal signup paths and resumable organization intent. [Implementation report](docs/organizations/O2_IMPLEMENTATION_REPORT.md)
- [x] O3 Founder Verified provenance and synthetic lifecycle. Real issuance awaits separate approval.
- [x] [Preserve regular identity application history after explicit supersession consent](docs/organizations/FOUNDER_VERIFICATION_POLICY_UPDATE.md). The newer consent policy supersedes the historical closure behavior. Founder Verified issuance remains disabled.
- [x] Separate Founder issuance and independent review assignments. The follow-up consent migration was applied in hosted development during F1.
- [x] [Recognize the formal Founder role and reserve its powers](docs/governance/FOUNDER_AUTHORITY_AND_POWERS.md). The hierarchy has [explicit capability and approval boundaries](docs/governance/FOUNDER_CAPABILITY_MATRIX.md). Protected succession and hosted activation remain separately governed.
- [x] [Reserve the founding identity and separate the four badge styles](docs/governance/FOUNDER_BOOTSTRAP_AND_BADGES.md). Hosted development has the reservation migration. F1 private setup has a separate pending migration, and succession remains closed.
- [x] [O4 identity-gated setup](docs/organizations/O4_IMPLEMENTATION_REPORT.md), private registration declarations and reviewed claims. The development schema was applied during D2.
- [x] [O5 scoped corrections and governance proposals](docs/organizations/O5_IMPLEMENTATION_REPORT.md). Protected execution and succession remain closed.
- [x] [O6 Early Partner synthetic foundation](docs/organizations/O6_IMPLEMENTATION_REPORT.md). Real enrollment remains closed.
- [x] [O7 integration and development rollout verification](docs/deployment/D2_FINAL_READINESS.md). Public launch readiness is separate.

Future implementation depends on documented owner decisions and separate authorization. [Phase dependencies and exit criteria](docs/organizations/O1_IMPLEMENTATION_ROADMAP.md)

## S1 permanent engineering and audit governance

S1 establishes repository-wide [engineering standards](docs/standards/ENGINEERING_STANDARDS.md), [audit coverage review](docs/standards/AUDIT_COVERAGE_MATRIX.md), and a [completion checklist](docs/standards/FEATURE_COMPLETION_CHECKLIST.md) for O3–O7 and all later phases. Maintain the feature review register, run the standards gate, and track deployment and unresolved policy decisions.

- [x] [O3 Founder Verified infrastructure](docs/organizations/O3_IMPLEMENTATION_REPORT.md). Production authority and proof activation are separately gated.
- [x] O4 institution authority and registration checks with legacy creation and claim entry points closed.
- [x] O5 signup corrections and governance decision history. Protected succession remains closed.
- [x] O6 synthetic Early Partners and O7 development rollout verification. Real enrollment remains closed.
- [ ] Unified Audit Center with permission-scoped read projections and approved summary export.
- [ ] Organization Programs, applications and waitlists, volunteer coordination, provider referrals and separately authorized financial support integrations.
- [ ] Expanded community reporting, radio and media, and native mobile apps.

These initiatives remain planned. [S1 implementation report](docs/standards/S1_IMPLEMENTATION_REPORT.md)


## O5 administrative corrections and governance

O5 adds auditable administrative corrections and governance proposals. D2 applied its schema in hosted development. Operational recovery still requires separate approval. See [O5 implementation](docs/organizations/O5_IMPLEMENTATION_REPORT.md).


## O6 Early Partners

O6 implements synthetic-first Early Partner participation. Real enrollment, an effective legal release, public opt-in visibility and O7 organization-program policy remain separate milestones. See [O6 implementation](docs/organizations/O6_IMPLEMENTATION_REPORT.md).

## O7 integration and release readiness

O7 pairs the organization migrations with disposable end-to-end tests and shared authentication screens. D2 completed the approved hosted development rollout. Operational feature decisions remain separate. [O7 readiness](docs/organizations/O7_READINESS_MATRIX.md)

## D1 controlled deployment preparation

The reviewed six-file database rollout has read-only hosted evidence and disposable compatibility tests. Production remains blocked on verified recovery, Auth readiness and separate operator approval. [D1 readiness](docs/deployment/D1_MIGRATION_READINESS.md)

## D2 recovery and hosted development deployment

The reviewed O2–O7 migrations are deployed to the owner-approved development database and passed hosted postflight. Synthetic recovery passed. Public release waits for verified provider or independent recovery points, protected Storage recovery, staffed operators, and Auth/email validation. [D2 readiness](docs/deployment/D2_FINAL_READINESS.md)

## S2A absolute session lifetimes

**S2A COMPLETE AND DEPLOYED — hosted development database.** Applied `20261121142000` and verified 77 applied migrations with zero pending. The policy gives the recognized Founder and Administrators six hours, ordinary remembered sessions 30 days, and ordinary unchecked sessions 12 hours. The default browser session is nonpersistent. Promotion requires a new sign-in and MFA. Existing role revocation and 15-minute privileged TOTP rules apply. [Implementation and development rollout](docs/security/S2A_DEPLOYMENT_AND_TEST_RESULTS.md)

## S2B session management and private workflow links

**S2B COMPLETE AND DEPLOYED — hosted development database.** Applied `20261121143000` and verified 78 applied migrations with zero pending. S2B adds owner-scoped session inventory and revocation, account-bound organization draft links, and original-session leadership confirmation. The existing F1 paths stay available. [Implementation and hosted rollout](docs/security/S2B_IMPLEMENTATION_REPORT.md).

## S2C private staff workspaces

Platform Administration and independent verification review use short-lived links tied to the initiating account and session. Routine member and public routes retain their stable URLs. The hosted development database is verified at 80 applied migrations with zero pending. The matching application is on main and verified locally. [S2C implementation and rollout](docs/security/S2C_IMPLEMENTATION_REPORT.md)

## U1 public usernames

U1 adds username selection and availability to both signup choices. Its migrations were applied to hosted development during F1. Long-term cooldown, retention and support operations remain policy decisions. See the [U1 implementation report](docs/identity/U1_IMPLEMENTATION_REPORT.md).

## F1 and the Account, Roles & Security Master Blueprint

**F1 and F1.1 COMPLETE AND DEPLOYED — hosted development database.** Applied `20261121140000` and `20261121141000` in order. F1 postflight recorded 76 applied migrations and zero pending. Verified matching local Fastify/Next.js compatibility without deploying a hosted application. [Deployment evidence](docs/deployment/F1_F1_1_DEVELOPMENT_DEPLOYMENT.md)

Only the active recognized Founder can directly authorize a new Administrator appointment. The named member accepts with fresh MFA and the one-time code. Legacy proposals retain independent approval. [F1.1 implementation](docs/governance/F1_1_IMPLEMENTATION_REPORT.md)

The F1/F1.1 development rollout is closed. S2 absolute session lifetimes and promotion handling remains next and has not started. Session inventory, private user-bound links, and identity and audit integration follow the approved sequence. [Master Blueprint](docs/blueprints/README.md) · [Owner decisions](docs/blueprints/OWNER_DECISIONS_AND_OPEN_QUESTIONS.md)

## A1A unified audit infrastructure

A1A adds scoped activity queries, nine existing ledger adapters and a permanent audit integration register. The hosted development database is verified at 81 migrations with zero pending. A1B will add the graphical Audit Center. [A1A report](docs/audit/A1A_IMPLEMENTATION_REPORT.md)

## Founder authority consolidation

The recognized Founder inherits routine platform administration and can decide eligible regular blue applications through the private administration workspace. Ordinary reviewers retain two approvals. The approved migration is deployed to hosted development with 89 applied migrations and zero pending. [Implementation report](docs/governance/FOUNDER_AUTHORITY_CONSOLIDATION.md)

## Founder Verified integration

The direct proof workflow adds the recognized Founder’s session-bound authority, member authenticator confirmation, a structured identity attestation and scoped gold badge display. Version-specific optional ordinary-application closure remains transactional. The hosted development schema is staged at 82 applied migrations with zero pending. Both live gates remain closed pending owner-approved operations. [Integration report](docs/identity/FOUNDER_VERIFIED_COMPLETION_REPORT.md)

## FV-FINAL — Founder Verified development release

FV-FINAL adds an exact approved development cohort and policy window, independent appeal review and live gold eligibility for eligible new nongovernment organizations. The hosted development schema is deployed and verified. Operational activation remains closed and requires a separate approval. See the [implementation report](docs/identity/FOUNDER_VERIFIED_FINAL_IMPLEMENTATION_REPORT.md) and [operations policy](docs/identity/FOUNDER_VERIFIED_ACTIVATION_POLICY.md).

- [x] D1 shared member Dashboard, private overview and customization, Founder settings and official announcements: hosted database deployed with preservation checks; connected Test02 local application and disposable Founder browser verified. Hosted web/API deployment remains separate. [Implementation report](docs/dashboard/D1_MEMBER_DASHBOARD_IMPLEMENTATION_REPORT.md)
