# Ayinou — Roadmap and Phase Gates

**Updated:** 2026-11-19
**Development mode:** Local only
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

## Phase 1B — Registration, login, onboarding, profiles

- [ ] Supabase Auth: email/password or email OTP, email verification, password recovery, session handling and logout.
- [ ] Registration: display name; email; optional real name/phone (only if necessary and consented); preferred language.
- [ ] Ask residence country and, for those living in Haiti, optional department; diaspora can optionally choose a department of connection separately.
- [ ] Never require GPS. Location permission is opt-in; no precise coordinates stored by default.
- [ ] User can edit profile, privacy settings, and location; include deletion/export planning.
- [ ] Connect the Phase 1A profile tables to authenticated API workflows without exposing private data.
- [ ] Anti-spam rate limits and appropriate verification for signups.

**Gate:** Signup → verification → onboarding → session refresh → editing → logout works in three languages; RLS blocks access to another user's private fields.

## Phase 2 — Community dashboard and member counts

- [ ] Count authenticated, non-deleted members without exposing identifiable data.
- [ ] Count users who self-report residence in each of Haiti's ten departments.
- [ ] Count diaspora members by country and separate department-of-origin/connection metrics.
- [ ] Display 'Unknown / undisclosed' as needed; never conflate voluntary location with verified residency.
- [ ] Protect small groups from re-identification (minimum display thresholds, grouped statistics).
- [ ] Separate total registered, active, and verified users with documented definitions.
- [ ] Add telemetry/analytics only with clear privacy notices and retention limits.

**Gate:** Dashboard totals are accurate against seeded test data; no user-level location or private profile disclosure.

## Phase 3 — Social network MVP

- [ ] Create/edit/delete text posts; read feed; pagination.
- [ ] Comments, reactions, follows, basic notifications.
- [ ] Optional image attachments with storage rules, upload limits and security scanning where feasible.
- [ ] Report content; moderators can review, hide and appeal moderation actions.
- [ ] Blocking/muting and spam/rate controls.
- [ ] No unmoderated live broadcast or unlimited DMs at this phase.

**Gate:** Feeds behave correctly at load; user permissions enforced; reports can be reviewed; moderation tested.

## Phase 4 — Communities and groups

- [ ] Ten department spaces; create diaspora and topic groups.
- [ ] Group membership, roles, admins, rules and member reports.
- [ ] Basic discussions; discoverability and privacy settings.
- [ ] Group moderation and anti-harassment controls.

**Gate:** Group access and moderation policy tests pass; reporting/escalation is practical for moderators.

## Phase 5 — Verified identities and founding ambassadors

- [ ] Verification application process for public figures, radio stations, and organizations.
- [ ] Manual review with reproducible evidence and audit history; do not sell authenticity badges.
- [ ] Distinguish `Identity verified`, `Notable public figure`, and `Verified organization`.
- [ ] Founding Ambassador invitations and transparent selection criteria; no special voting power.
- [ ] Impersonation reporting and revocation/appeal procedures.

**Gate:** Badges mean what policies say; impersonation and appeals tested; sensitive evidence is not exposed.

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
- [ ] Accessibility and all three locales checked
- [ ] Security, privacy and abuse cases considered
- [ ] README, roadmap, decisions and migration notes updated
- [ ] Small meaningful commits pushed directly to `main` after review

## Not included at launch

Cryptocurrency, direct cash custody, official elections, algorithmic truth-by-majority, unattended crisis mapping, unverified celebrity endorsements, or sensitive-location tracking.
