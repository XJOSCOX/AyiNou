# Ayinou — Roadmap and Phase Gates

**Updated:** 2026-11-19
**Development mode:** Local Next.js/Fastify with hosted Supabase Auth/PostgreSQL
**Repository strategy:** One `main` branch, direct commit + push; no PRs

**Rule:** Work on one phase at a time. Each phase is complete only when its acceptance checklist is met, documentation is updated, and local quality checks pass. Do not use calendar deadlines as a substitute for testing.

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
- [ ] Enable future project, task, volunteer, recruitment, finance, and announcement permissions alongside their backend workflows.

## Phase 6 — Initiatives, projects and volunteers

- [ ] Propose projects with location region (not dangerous exact coordinates), objectives and owners.
- [ ] Project review, milestones, volunteer roles, updates, outcomes.
- [ ] Moderation, conflict-of-interest disclosures and audit history.
- [ ] Non-monetary contributions first (time, skills, supplies); no platform-held funds yet.

**Gate:** An initiative can be proposed, reviewed, organized, updated, completed and archived with transparent responsibility.

## Phase 7 — Community reports and evidence-based verification

- [ ] Report local events, needs, and public claims.
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

- [ ] Volunteer and mentorship matching; jobs/education opportunities with anti-fraud checks.
- [ ] Financial contributions only after legal/compliance review and approved payment-partner integration.
- [ ] Verified project recipients, budgets, disclosures and transparent expense/milestone reports.
- [ ] Refund/dispute and donor-privacy workflows; do not hold money directly without required permissions.

**Gate:** Legal/payment risk review signed off; partner transaction and audit flows validated.

## Phase 10 — Native apps and expansion

- [ ] Determine Android/iOS architecture and shared API/data contracts.
- [ ] Push notifications, efficient networking, offline/low-bandwidth modes.
- [ ] Accessibility and device testing; App Store / Play policy review.
- [ ] Infrastructure, monitoring, incident response and production readiness review.
- [ ] Gradual, safeguarded public rollout.

**Gate:** Security, performance, reliability, governance and incident-response readiness approved before public launch.

## Standard completion checklist for EVERY phase

- [ ] Scope and acceptance criteria documented
- [ ] Typecheck, lint, unit/integration tests and build pass locally
- [ ] Relevant RLS allow/deny and migration tests pass
- [ ] Accessibility and all four locales checked
- [ ] Security, privacy and abuse cases considered
- [ ] README, roadmap, decisions and migration notes updated
- [ ] Small meaningful commits pushed directly to `main` after review

## Not included at launch

Cryptocurrency, direct cash custody, official elections, algorithmic truth-by-majority, unattended crisis mapping, unverified celebrity endorsements, or sensitive-location tracking.
