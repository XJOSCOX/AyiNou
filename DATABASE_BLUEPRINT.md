# Ayinou — Master Database Blueprint

**Status:** Proposed design; not yet migrated or deployed

**Basis:** `XJOSCOX/AyiNou` initial migration `20261119160000_initial_schema.sql`, Phase 1B documentation and product roadmap, reviewed 2026-11-19.

**Workflow:** Local Next.js/Fastify, hosted Supabase development project, GitHub `main` only. Do not modify the database while hosted transition is in progress.

## Principles

1. Supabase `auth.users` owns identity; do not duplicate passwords or email credentials.
2. Fastify is the application API boundary for web/Android/iOS; Supabase Auth flows may use official client SDKs.
3. Keep personally sensitive information in private, restricted tables. Prefer user-selected broad location; no GPS for population analytics.
4. Use UUID primary keys, explicit foreign keys, `timestamptz` dates, uniqueness and check constraints, and indexed hot query paths.
5. Enable RLS on every exposed table, revoke default grants, and explicitly grant least privilege. Privileged review actions must be authenticated, audited and server-authorized.
6. Each domain has a clear owner, status workflow, data retention policy, and abuse case. No automatic right to publish sensitive reports.
7. App languages `ht`, `fr`, `en`. Store original user-generated content with a content-language code, translate UI labels through application dictionaries. Preserve original content; label machine translations.
8. Historical records and public metrics must not be corrupted when users edit profile locations or when content is moderated.
9. Plan the entire domain model, but only apply migrations once a feature's requirements, privacy policy and tests are ready, except small safe common reference tables.
10. One hosted Supabase Free project is for development with test data. Never run `db reset` or destructive experiments on hosted cloud. Keep old pgTAP tests available for isolated local execution; add non-destructive hosted checks and disposable isolated test databases as feasible.

## Current existing schema: preserve as-is until migration review

- `public.departments`: 10 codes (HT-AR, HT-CE, HT-GA, HT-NI, HT-ND, HT-NE, HT-NO, HT-OU, HT-SD, HT-SE).
- `public.profiles`: `user_id -> auth.users.id`, `display_name`, `preferred_locale`, `is_visible`, timestamps.
- `public.member_private`: `user_id -> profiles.user_id`, residence country, optional Haiti residence department, separately optional diaspora connection department, timestamps.
- `public.role_assignments`: user_id + platform role (`administrator`, `moderator`), grantor, timestamp.
- `public.verification_records`: user_id/type/status/reviewer/verified date.
- `private.initialize_member(uuid)`: atomic idempotent profile/private row initialization after verified authentication.

**Compatibility:** Preserve API behavior and profile table names. Improve via additive migrations; do not alter initial migration history. Phase 1B introduced no schema changes according to repository documents.

## Proposed domain entity catalog

Status legend: **Existing**, **Near-term**, **Later**, **Conditional**. Names are planned, not applied.

### A. Identity, settings, trust

| Table | Timing | Key fields / relationship | Notes |
|---|---|---|---|
| `profiles` | Existing | `user_id`, display_name, locale, visible | Add later: unique optional handle, avatar media ID, bio, onboarding completion state; enforce safe limits. |
| `member_private` | Existing | `user_id`, residence country/department, diaspora connection | Add optional privacy preferences if appropriate; avoid exact GPS. |
| `role_assignments` | Existing | user_id, role, granted_by | Consider scoped roles separately; avoid expanding unrestricted global roles. |
| `verification_records` | Existing | user_id, type/status/reviewer | Existing design tied to user; organizations need distinct entity verification workflow. |
| `user_settings` | Near-term | `user_id PK`, default privacy, discovery, notification/translation settings | Account-specific settings not part of public profile. |
| `user_blocks` | Near-term | `blocker_id`, `blocked_id`, created_at; UNIQUE pair | Prevent self-block, enforce block across social interactions. |
| `user_mutes` | Near-term | `user_id`, `muted_user_id`, created_at; UNIQUE pair | Mute without exposing mute state. |
| `user_sessions_audit` | Conditional | id, user_id, event category, coarse device info, time | Avoid duplicating Supabase's full session token data; strict retention. |
| `account_deletion_requests` | Before launch | id, user_id, status, requested_at, processed_at | Must handle related content/retention obligations. |
| `account_data_exports` | Before launch | id, user_id, status, file reference, expiration | Private signed access, deletion after expiry. |

### B. Geography and safe analytics

| Table | Timing | Fields / relationship | Notes |
|---|---|---|---|
| `departments` | Existing | code PK, name | Already seeded. |
| `countries` | Near-term | ISO alpha-2 PK, localized names, active | Validate country selection. |
| `communes` | Later | id PK, department_code FK, official code/name | Optional, verified geographic source; do not require commune at registration. |
| `analytics_daily_aggregates` | Phase 2 | date, metric, scope_kind, scope_id, value | Server-produced; public outputs suppress small cohorts. |
| `user_activity_daily` | Phase 2/3 | user_id/date, limited qualifying-action counter | Private, bounded retention; avoid tracking sensitive movement. |

**Important:** `residence_department_code` and `diaspora_department_code` are different concepts. Never sum them together as 'residents'. Show unknown/undisclosed counts. Exclude test/spam/deleted accounts from public totals using defined policy.

### C. Social feed, media, reactions

| Table | Timing | Fields / relationship | Notes |
|---|---|---|---|
| `posts` | Phase 3 | id, author_user_id, community_id nullable, body, language, visibility, status, created/updated/deleted | Original text retained; soft deletion and moderation states. |
| `post_media` | Phase 3 | id, post_id, media_asset_id, position | Attach managed media objects. |
| `comments` | Phase 3 | id, post_id, author_id, parent_comment_id nullable, body, status, timestamps | Bound nesting depth and rate limits. |
| `reactions` | Phase 3 | actor_id, target_post_id OR target_comment_id, reaction_kind | Explicit constraint one target; per-target unique reactions. Could split `post_reactions`/`comment_reactions` for simpler FKs/RLS. |
| `follows` | Phase 3 | follower_id, followed_id, created_at, unique pair | No self-follow; blocks affect visibility. |
| `bookmarks` | Later | user_id, post_id, created_at, unique pair | Private. |
| `hashtags` | Later | id, normalized_tag unique | Avoid unnecessary complexity early. |
| `post_tags` | Later | post_id, hashtag_id | Unique pair. |
| `media_assets` | Phase 3 | id, owner_user_id, storage_path, bucket, mime_type, bytes, moderation_state | Database metadata only; actual bytes in Supabase Storage; private by default with explicit access. |
| `notifications` | Phase 3 | id, recipient_id, type, actor_id nullable, object references, read_at, created_at | No private incident data in notification previews. |
| `notification_preferences` | Phase 3 | user_id, channel/event opt-ins | Explicitly consented communication. |
| `push_devices` | Phase 10 | id, user_id, platform, encrypted or protected push token, last_seen | Native push registrations; revoke on logout. |

**Target modeling:** Avoid unchecked `target_type + target_id` without referential integrity. Prefer explicit FKs, target-specific join tables, or validated service logic where a polymorphic design is justified.

### D. Communities, local participation

| Table | Timing | Fields / relationship | Notes |
|---|---|---|---|
| `communities` | Phase 4 | id, slug unique, name, description, kind(department/diaspora/topic), department_code nullable, visibility, status | Department communities seeded in one safe migration. |
| `community_members` | Phase 4 | community_id, user_id, member_state, joined_at; unique pair | Bans/suspensions not simply deleted. |
| `community_roles` | Phase 4 | community_id, user_id, role, granted_by, created_at | Scoped moderators distinct from global admins. |
| `community_rules` | Phase 4 | id, community_id, rule text, position, updated_at | Moderation rules visible. |
| `community_join_requests` | Later | id, community_id, user_id, status | Needed for private groups only. |
| `community_bans` | Phase 4 | community_id, user_id, actor, reason, expiry | Audit / appeals. |

### E. Public figures, organizations, representatives

| Table | Timing | Fields / relationship | Notes |
|---|---|---|---|
| `organizations` | Phase 5 | id, name, kind(nonprofit/business/media/school/other), slug, status, description | An organization is not necessarily a user. |
| `organization_members` | Phase 5 | organization_id, user_id, role, status | One organization can have several authorized representatives. |
| `verification_applications` | Phase 5 | id, subject_kind, target refs, requested_type, applicant_id, status, created_at | Avoid accepting arbitrary target IDs without FK validation. |
| `verification_reviews` | Phase 5 | id, application_id, reviewer_id, decision, rationale, created_at | Independent and auditable, reviewer conflicts handled. |
| `organization_verifications` | Phase 5 | organization_id, status, reviewer_id, verified_at, revoked_at | Distinct from existing `verification_records` on users. |
| `ambassador_invitations` | Phase 5 | id, invited_person/contact reference, sponsor/admin, status, expires_at | No public disclosure of private invitee details. |
| `ambassador_assignments` | Phase 5 | user_id, start_at, end_at, status, scope | Ambassador isn't an admin role or truth badge. |
| `verification_evidence` | Phase 5 | application_id, private media asset ID, retention deadline | Sensitive; no public URL, strict access/deletion. |

### F. Initiatives, projects, volunteers

| Table | Timing | Fields / relationship | Notes |
|---|---|---|---|
| `projects` | Phase 6 | id, owner_user_id/organization_id, title, description, department_code nullable, status, created_at | Require accountable owner; no precise vulnerable-site coordinates publicly. |
| `project_members` | Phase 6 | project_id, user_id, role, status | Team, organizer, reviewer roles separately. |
| `project_milestones` | Phase 6 | id, project_id, title, due_at nullable, status, completed_at | Outcome audit. |
| `project_updates` | Phase 6 | id, project_id, author_id, body, status, created_at | Progress history; corrections rather than silent edits. |
| `project_needs` | Phase 6 | id, project_id, need_type(skill/supply/time), description, quantity, status | No money custody in initial projects release. |
| `volunteer_offers` | Phase 6 | id, user_id, project_id, need_id nullable, offer_type, status | Contact details remain private. |
| `project_outcomes` | Phase 6 | id, project_id, metric, value, verified_by nullable, methodology | Distinguish claimed versus independently verified outcome. |
| `project_reviews` | Phase 6 | id, project_id, reviewer_id, decision, reason, created_at | Conflict-of-interest checks. |

### G. Citizen reports, evidence and fact checking

| Table | Timing | Fields / relationship | Notes |
|---|---|---|---|
| `community_claims` | Phase 7 | id, submitted_by, claim_kind(incident/need/public_claim), summary, language, broad_department, risk_level, publish_state, review_status, timestamps | Separate publication safety from truth determination. |
| `claim_sources` | Phase 7 | id, claim_id, source_url or citation metadata, source_kind | Validate URLs; no arbitrary scripts. |
| `claim_evidence` | Phase 7 | id, claim_id, submitter_id, private media reference, evidence_kind, visibility, retention | Evidence private by default; redact faces/locations as needed. |
| `claim_attestations` | Phase 7 | id, claim_id, user_id, stance(confirm/dispute/uncertain), firsthand flag, rationale | ONE per user per claim; counts do not determine truth. |
| `claim_reviews` | Phase 7 | id, claim_id, reviewer_id, assessment, explanation, created_at | Editorial decision with reason/evidence and audit. |
| `claim_status_history` | Phase 7 | id, claim_id, old/new status, actor_id, reason, created_at | Immutable history. |
| `claim_appeals` | Phase 7 | id, claim_id, appellant_id, reason, status, resolved_by | Independent appeals where feasible. |
| `claim_safety_actions` | Phase 7 | id, claim_id, action, reviewer_id, reason, created_at | Delay/restrict incident details that could endanger others. |

**Critical:** Reports of fires/violence are *not* emergency dispatch; don't expose live actionable whereabouts, alleged perpetrators, or private witness identities. Claim 'verified' should require documented credible evidence, not popularity.

### H. Radio, official stations and media

| Table | Timing | Fields / relationship | Notes |
|---|---|---|---|
| `radio_stations` | Phase 8 | id, organization_id FK, name, department_code nullable, languages, description, verified status | Each station represented by an organization where possible. |
| `radio_streams` | Phase 8 | id, station_id, authorized_stream_url, format, rights_confirmed_at, active | Verify permission and licensing; server-side controls. |
| `radio_programs` | Phase 8 | id, station_id, title, description, language | Programs/catalog. |
| `radio_schedules` | Phase 8 | id, program_id, local timezone, weekday/start/end | Proper timezone handling, not user's device timezone. |
| `radio_episodes` | Later | id, program_id, media asset/reference, published_at | Recording/distribution rights. |

### I. Opportunities and donations (conditional after legal review)

| Table | Timing | Fields / relationship | Notes |
|---|---|---|---|
| `opportunities` | Phase 9 | id, org/project owner, kind(job/scholarship/mentorship/training), description, deadline, status | Anti-fraud and expiration. |
| `opportunity_applications` | Phase 9 | id, opportunity_id, applicant_id, status | Private applicant data, bounded retention. |
| `funding_campaigns` | Conditional | id, project_id, approved_partner, goal_currency_minor, goal_amount_minor, status | Partner-approved only; no payment custody. |
| `contribution_records` | Conditional | id, campaign_id, processor_reference unique, donor_id nullable, amount_minor, currency, state | Derived from verified provider webhooks only; do not store card numbers. |
| `campaign_financial_updates` | Conditional | id, campaign_id, milestone/expense references, reviewer_id | Receipts held privately; publish transparency summaries. |
| `payment_webhook_events` | Conditional | provider, external_event_id unique, processed_at, status | Idempotency and webhook signature validation. |

### J. Moderation, abuse controls, platform administration

| Table | Timing | Fields / relationship | Notes |
|---|---|---|---|
| `content_reports` | Phase 3 | id, reporter_id, explicit target FK or validated target, reason_code, status | Private reports; anti-brigading controls. |
| `moderation_cases` | Phase 3 | id, subject, state, assigned_reviewer, opened_at | Reviewer workflow. |
| `moderation_actions` | Phase 3 | id, case_id, actor_id, action, reason, created_at | Append-only history. |
| `moderation_appeals` | Phase 3 | id, case_id, appellant_id, status, adjudicator_id | Do not let same reviewer adjudicate their own appeal. |
| `user_restrictions` | Phase 3 | id, user_id, kind, starts_at, ends_at, issuer_id | Enforced in API permissions. |
| `audit_events` | Early (with privileged workflows) | id, actor_id, event, subject, safe metadata, created_at | Append-only restricted access; redact personal data. |
| `consent_records` | Before launch | user_id, policy_version, consent_kind, granted_at, revoked_at | User rights and legal requirements to be reviewed. |
| `feature_flags` | Near-term | key, enabled, rollout rules, updated_by | Must be read server-side for sensitive actions. |
| `system_outbox` | Later | id, event_type, payload_minimized, status, retry info | Durable notifications/async tasks only when needed. |

## Core relationships

```text
auth.users 1 ── 1 profiles 1 ── 1 member_private
            ├── * posts ── * comments
            ├── * follows / reactions / notifications
            ├── * community_members ── 1 communities
            ├── * organization_members ── 1 organizations
            ├── * project_members ── 1 projects ── * project_milestones
            ├── * claim_attestations ── 1 community_claims
            ├── * verification_applications
            └── * content_reports / audit_events
organizations 1 ── * radio_stations ── * radio_streams / radio_programs
projects 1 ── * project_needs ── * volunteer_offers
community_claims 1 ── * claim_evidence / claim_reviews / claim_appeals
```

## Recommended migration waves

1. **Wave A: Hardening and common references** (after hosted migration finished): `countries`, `user_settings`, optional handles/avatars, appropriate uniqueness and indexes, audit infrastructure. Preserve compatibility with Phase 1B.
2. **Wave B: Phase 2 analytics:** private counter definitions/aggregate tables or read-only views, safe refresh logic, small-cohort suppression. Don't count diaspora origin as residence.
3. **Wave C: Phase 3 social & moderation:** posts, comments, reactions, follows, blocks, media metadata, notifications, moderation. Require abuse workflows before public posts.
4. **Wave D: Phase 4–5:** communities, membership, organizations, formal verification and ambassadors.
5. **Wave E: Phase 6–7:** projects, volunteers, claims and evidence safety.
6. **Wave F: Phase 8–9:** radio, opportunities, conditional payments after rights/legal readiness.
7. **Wave G: Phase 10:** mobile push devices, outbox/queues, scalable event processing if necessary.

## Index/query priorities

- `profiles`: optional normalized handle unique, visible profile search indexes only when search ships.
- `member_private`: current composite residence index retained; diaspora connection indexed separately; not publicly enumerable.
- `posts`: `(status, created_at DESC, id DESC)`, `(author_user_id, created_at DESC)`; community timeline `(community_id, created_at DESC)`.
- `comments`: `(post_id, created_at, id)` and parent lookup if threaded.
- `follows`: `(follower_id, followed_id)` unique, reverse `(followed_id, follower_id)` for follower lists.
- `community_members`: unique `(community_id,user_id)` and reverse user lookup.
- `projects`: `(status, department_code, created_at DESC)`; project milestones `(project_id, status)`.
- `community_claims`: `(review_status, created_at DESC)` and `(broad_department_code, created_at DESC)` with restricted publication filters.
- `notifications`: `(recipient_id, read_at, created_at DESC)`.
- Idempotency unique keys on external transaction/webhook identifiers.
- Use keyset pagination for feeds; no unbounded offsets or unbounded table scans.

## RLS and API authorization matrix (summary)

| Data | Anonymous | Member | Moderator/reviewer | Admin/backend |
|---|---|---|---|---|
| Public profile | visible only | visible + own hidden | same unless assigned access | narrowly scoped admin |
| Private member location | none | own only | generally none | exceptional audited support |
| Posts/comments | published public | eligible community + own | assigned case actions | controlled |
| Claims/evidence | published safe summaries | own submissions + permitted records | assigned review, restricted evidence | highly restricted |
| Organizations/radio | published approved info | read | authorized representative edits | verified approval |
| Project data | published projects | member permissions | assigned review | controlled |
| Role/badge grants | none | none | none unless delegated | audited, server-side only |
| Analytics | privacy-safe aggregated totals | same | internal authorized | restricted raw data |
| Financial records | no raw data | own contributions if applicable | approved audit | processor/server-only |

All privileged checks must be enforced in Fastify as well as relevant database grants/RLS. Never trust user-editable app metadata for roles, badges or source-verification outcomes. For media, apply Supabase Storage policies and signed URLs, not only table RLS.

## Design questions to settle before implementation

1. Are members restricted by nationality, self-identification, or an open supportive community? Avoid collecting nationality documents in ordinary signup.
2. Can users choose anonymous/pseudonymous public display names? Recommended yes with internal abuse safeguards.
3. How should organization ownership and official radio station authorization be verified?
4. Who will review sensitive reports, and what is the incident safety escalation procedure?
5. How will community moderation work across `ht`, `fr`, `en`?
6. What counts as an active member? Suggested: authenticated qualifying action in previous 30 days, explicit definition and exclusions.
7. What retention and deletion policies are appropriate for claim evidence, audits and user exports?
8. Is future fundraising run via licensed partner or separate nonprofit? Do not write a cash-custody ledger prematurely.

## Codex sequence after hosted migration

1. Fetch `origin/main` and inspect resulting hosted Supabase changes. No changes while hosted transition is underway.
2. Produce `docs/DATABASE_MASTER_PLAN.md` based on this blueprint, and an ERD plus phase-to-table inventory. Reconcile any differences with the actual latest remote migration history.
3. Review with the project owner. Do **not** apply the entire master schema to hosted Supabase in a single push.
4. Implement Wave A via additive versioned migrations with grants/RLS/tests, no unsafe remote reset. Run non-destructive hosted checks and code validations.
5. Commit validated work directly to `main` (no PR, no branches). Continue waves only as their corresponding features begin.
