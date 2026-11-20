# Hosted Supabase Database and Auth

Next.js runs at `http://localhost:4000` and Fastify at `http://127.0.0.1:3000`. Auth and PostgreSQL run in the owner's hosted AyiNou project, reference `hcbxulyfmdmuyccgrujs`. Docker is not required for normal development. Neither local app is deployed.

## Setup and migrations

Install Node.js 20.9+ and npm, then run `npm install` for the pinned `supabase@3.2.0` CLI. Sign in with `npx supabase login` if needed. Copy values from [.env.example](../.env.example) to ignored `apps/api/.env` and `apps/web/.env.local`. The hosted URL and publishable key are used in both apps. Put the secret key **only** in the API file. No database password is needed to run the apps.

The initial migration `20261119160000_initial_schema.sql` creates five tables, RLS, grants, an initializer, and ten departments. `20261119173400_hosted_profile_rpc.sql` adds the profile RPCs. `20261119210000_phase2_community_stats.sql` adds the metric tables and aggregate RPC. `20261119220000_phase2b_membership.sql` adds profile details, settings, interests, private avatar storage, and the membership breakdown. `20261119230000_phase2c_accounts.sql` adds account codes, referrals, and profile write hardening. `20261120010000_phase2d_institutions.sql` adds institutions, delegated access, and verification. `20261120020000_phase2d1_affiliations.sql` adds ordinary organization membership. `20261120030000_phase2e_administration.sql` adds platform administration and live session enforcement. `20261120040000_require_verified_administrators.sql` requires active personal verification for new administrator promotions.

```bash
npx supabase link --project-ref hcbxulyfmdmuyccgrujs
npm run db:migrations
npm run db:push:dry
npm run db:push
```

Use `npx supabase migration new descriptive_name` to create another versioned migration. Never use `db reset --remote`, drops, or local pgTAP against the hosted project.

Phase 2F migration `20261120060000_spanish_locale.sql` expands `public.profiles.preferred_locale` to accept `ht`, `fr`, `en`, and `es`. The default remains `ht`, and existing preferences are preserved. Both Fastify profile PATCH routes retain their existing shapes and accept the same shared locale values for web and future mobile clients. Both PostgreSQL profile RPCs rely on the profile constraint and retain their existing authorization.

## Auth settings

Email/password signup and email confirmation are enabled. Site URL: `http://localhost:4000`. Allowed redirects: `http://localhost:4000/auth/callback` and `http://localhost:4000/reset-password`. Use `localhost` in the browser so PKCE cookies and callbacks share one host. Next.js restores and refreshes Supabase SSR sessions. Fastify validates bearer tokens before protected profile requests.

Supabase's default hosted email sender is limited to organization team addresses and low volume. Configure custom SMTP or use a controlled team mailbox for reliable confirmation and recovery tests. Keep confirmation enabled. Mailpit captures only optional local Docker mail, never hosted email. See [Auth testing](https://supabase.com/docs/guides/auth/testing-auth-flows) and [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) guidance.

## Tables and access

| Table | Purpose | Client access |
| --- | --- | --- |
| `public.departments` | Ten Haiti departments with stable codes | Anonymous and authenticated read |
| `public.profiles` | Public profile fields, locale, and trusted visibility | Visible and discoverable rows readable. Owners may read their own hidden row and edit allowed fields via the profile RPC. |
| `public.member_private` | Private names, preferences, stage, and optional residence and diaspora details | Owner read. Owner edits through profile RPC. |
| `public.role_assignments` | Future administrator/moderator roles | No client grants or policies |
| `public.verification_records` | Future identity/organization review state | No client grants or policies |
| `public.member_metric_exclusions` | Explicit synthetic-test and disqualified-account exclusions | Service role only; RLS enabled, no client policies |
| `public.user_activity_daily` | One marker per user and UTC day for qualifying profile activity | Service role only; RLS enabled, no client policies |

All application tables have RLS and least-privilege grants. `auth.users` is the source of identity. No application table stores a password, raw identification document, phone number, or precise GPS location. Clients cannot insert/delete profiles, set visibility, assign roles, or award verification. Locations are self-reported and private.

## Phase 2 community statistics

`GET /api/v1/community/stats`, `/api/v1/community/departments`, and `/api/v1/community/diaspora` are public, read-only Fastify routes. The database computes one aggregate snapshot in `private.build_community_stats()`, exposed only through service-role `public.community_stats_for_api()`. The public response contains no member IDs, emails, or private rows. No direct client role can read or write the two metric tables or call the aggregate RPC. Each route has a per-instance 60-requests-per-minute IP limit and a 30-second public cache header; clients cannot choose arbitrary filters or dates.

- **Registered:** non-anonymous `auth.users` rows not deleted or currently banned, excluding explicitly marked synthetic-test or disqualified accounts. A confirmed email is not required for this count.
- **Living in Haiti:** eligible members with `member_private.residence_country_code = 'HT'`, including those who did not select a department.
- **Department distribution:** those Haiti residents grouped by `residence_department_code`; all ten reference departments appear, including zero rows when geography is safe. `diaspora_department_code` is never used as residence.
- **Diaspora:** eligible members with a non-null residence country other than `HT`, grouped by that self-reported two-letter country code. Country names are localized by the client; a country reference table is not yet needed.
- **Unknown:** eligible members with no declared residence country, including Auth users whose profile has not been initialized.
- **Active:** eligible members with at least one successful authenticated profile GET/PATCH on a UTC day within the current day and preceding 29 days. This is a narrow product-activity measure, not general site usage. A service-only daily marker is recorded once per user/day; failed requests do not qualify.
- **Verified:** eligible members with at least one `verification_records.status = 'verified'` row of type `identity` or `notable_person`. Pending, revoked, and organization-only records do not count.

The provisional public minimum is **10**. A zero count is shown as zero; a nonzero count from 1–9 is returned as `null` and labeled suppressed. Geographic atomic groups are unknown country, Haiti without department, each Haiti department, and each diaspora residence country. If **any** nonempty group is under 10, the API returns `null` for all geography totals and distributions, including represented departments. This complementary suppression prevents deriving a hidden cell from totals or sibling groups. Country codes are omitted entirely while geography is suppressed. The response uses `updatedAt` for the calculation time. An unavailable service returns HTTP 503, never invented zeros.

Synthetic accounts are marked in `member_metric_exclusions` immediately after server-admin creation; hosted fixture SQL temporarily removes their exclusions only inside transactions that roll back. Account deletion cascades remove activity/exclusion rows. Daily activity markers need a reviewed retention job before public launch (the master plan proposes 90 days), and aggregates must not be treated as a census. No GPS or exact location is collected.

## API boundary and profile creation

Phase 2B migration `20261119220000_phase2b_membership.sql` adds private first and last names, self-declared membership, and persisted onboarding progress to `member_private`. It adds normalized unique usernames, optional biographies, and an opaque avatar reference to `profiles`. Existing rows can retain null names, username, and category until onboarding. The new RLS tables are owner-scoped `user_settings` and `member_interests`, plus the authenticated read-only `interest_catalog`.

The private `member-avatars` Storage bucket accepts only WebP objects up to 512 KiB. Fastify accepts JPEG, PNG, or WebP inputs up to 2 MiB and 16 megapixels, decodes and reencodes them as 384 px WebP without original metadata, and stores the derivative under an opaque reference. Clients have no direct bucket access. The owner can obtain a five-minute signed URL. The public projection can sign the derivative only for a profile with trusted visibility and discoverability enabled. Revoking discoverability stops new links immediately and existing links expire within five minutes.

The statistics RPC adds a separate three-way breakdown of self-declared Haitian members, international supporters, and unspecified membership. Any nonzero membership group below 10 hides the entire membership breakdown. Geography retains its existing independent suppression rules and registered, active, and verification definitions.

The hosted synthetic suite checks private-field isolation, normalized username collisions, onboarding resume and completion, blocked direct Storage access, and metadata removal. Transactional statistics fixtures check membership and geographic suppression. Synthetic identities and avatar objects are cleaned up after the run. External signup confirmation and password recovery delivery remain unverified until SMTP is configured.

Web and future native clients sign in through Supabase Auth and send an access token to Fastify. Fastify validates signature, issuer, audience, expiration, role, and subject. For profile GET/PATCH, it derives the UUID from the verified token and calls `public.initialize_member_for_api(uuid)` with the server-only secret key. This narrow RPC delegates to preserved `private.initialize_member` and is unavailable to client roles. Initialization creates hidden public and private rows atomically, tolerates retries, and does not block Auth signup through a trigger. If it fails, the Auth user remains and a later authenticated request can retry.

Fastify reads member data using the caller's access token and RLS. Both profile RPCs bind writes to `auth.uid()` and use one atomic validation path. Phase 2C revokes direct profile, private-details, privacy, and interest mutations, and requires both trusted visibility and discoverability for unauthenticated public profile reads. Owner-scoped private reads and writes require AAL2 when a verified Supabase MFA factor exists. Role and badge state remain server-controlled.

## Phase 2C account codes and referrals

`20261119230000_phase2c_accounts.sql` adds `private.member_codes`, `private.referral_codes`, and `private.referrals`. RLS is enabled on each. Ordinary client roles and the API service role have no direct table grants. Narrow security-definer RPCs are callable only by the API's server credential. The protected initializer assigns codes once and can be retried. The backfill allocates missing codes for existing non-anonymous, non-deleted Auth accounts and does not create or rewrite their profile rows.

- A member reference uses `M1-` followed by 32 uppercase hex characters from 128 random bits. It is permanent and only returned in its authenticated owner endpoint.
- A referral code uses `R1-` followed by 16 uppercase hex characters from 64 random bits. Input is normalized to uppercase. A unique active-code index allows future rotation while the composite foreign key preserves which code and owner were credited. Collision retries are bounded and database uniqueness is authoritative.
- The database captures an active code, if supplied, in the Auth account insertion transaction. It stores the referred account, code, and issuer before editable metadata can change. The first signed-in initializer or attribution request after email confirmation confirms that relationship. The referred account is the primary key and the two account IDs must differ. No rewards are issued. Hard-deleting either account cascades to its relationship. Pending rows remain bound to their unconfirmed Auth accounts until account cleanup. No automated cleanup schedule or rotation interface is active.

| Route | Access and result |
| --- | --- |
| `GET /api/v1/me/member-code` | Verified owner. Returns `{ memberCode }`. |
| `GET /api/v1/me/referral-code` | Verified owner. Returns `{ referralCode }`. |
| `POST /api/v1/referrals/validate` | Public. Accepts `{ code }`, returns `{ valid }`. Rate-limited per IP and per API instance. Returns no member data. |
| `POST /api/v1/me/referrals/attribution` | Verified owner. Empty body. Idempotently confirms the existing signup referral and returns `{ attributed }`. |
| `GET /api/v1/me/referrals` | Verified owner. Returns `{ summary: { confirmedCount } }`. |

The registration URL uses `/register?ref=<code>`. Neither code confers access, allows password recovery, or conveys verification. Supabase Auth handles passwords, sessions, and authenticator app TOTP. Future identity verification challenges are a separate design in the [master plan](DATABASE_MASTER_PLAN.md) and have no database table, issuance endpoint, delivery integration, or badge workflow in Phase 2C.

## Phase 2D institutions and verification

Eight new private-schema tables cover institutions, memberships, invitations, reviewer assignments, applications, evidence references, decisions, and an audit ledger. RLS is enabled on each. Anonymous, authenticated, and API service roles have no direct table grants. The API service uses narrow functions that recheck the signed-in actor's scope against the database. The public projection never returns contact email or internal team or review data.

| Role | Institution actions |
| --- | --- |
| Owner | Edit identity while unlocked, description, contact, and logo. Invite administrators, editors, and viewers. Revoke non-owner access. Submit institution verification. |
| Administrator | Edit description, contact, and logo. Invite and revoke editors and viewers. |
| Editor | Edit description and logo. |
| Viewer | Read scoped workspace details without private contact email. |
| Any active representative | Apply to verify their own current representative position. |
| Eligible outsider | Apply to claim an unverified or revoked profile. Two independent reviewers must authorize an ownership transfer. |

Invitations are in-app, expire after seven days, and can only be accepted by the exact account named by username. Acceptance rechecks the inviter's current authority and cannot be repeated. Optional membership terms run from acceptance for 1–730 days. New institutions are public with an **Unverified** label. Review locks identity fields while an institution application is pending and after verification. Ownership review binds to the initial institution snapshot and does not verify the institution. A completed transfer revokes prior access and pending invitations.

The private `institution-logos` bucket blocks direct client access. The API decodes and reencodes accepted logo images and returns a five-minute signed URL for the current published derivative. Institutional reference URLs are HTTPS without query strings or fragments. The app does not fetch evidence URLs or store uploaded identity documents. Evidence and written decisions are visible only through the authorized workflow. Receipts expose status and decision reason to the applicant.

Reviewer access starts closed. An authorized platform administrator can appoint a separate verification reviewer after that account enrolls verified TOTP. Fastify requires recent TOTP-backed AAL2 and the database enforces assignment and conflict rules for each action. Reviewers attest that they have no conflict. Applicants, founders, current or former institutional delegates, and members who have joined the organization are excluded by database checks. Two distinct currently eligible reviewers must approve. An independent reviewer may reject or revoke with a written reason. Individual and notable approvals write the preserved `verification_records`. Institutional approval updates public institution status. Representative approval marks only the current membership. No identity challenge, real reviewer, SMTP, SMS, or identity provider is provisioned here.

| Endpoints | Purpose |
| --- | --- |
| `GET /api/v1/institutions/by-handle/:handle` | Public institutional projection |
| `GET /api/v1/me/institution-accounts` | Own active institutions and invitation inbox |
| `POST /api/v1/institutions`, `GET/PATCH /api/v1/institutions/:id` | Create, load, or edit a scoped workspace |
| `POST /api/v1/institutions/:id/logo` | Upload a sanitized logo |
| `POST /api/v1/institutions/:id/invitations`, `POST /api/v1/institution-invitations/:id/:action` | Invite, accept, or revoke |
| `POST /api/v1/institutions/:id/representatives/:member/revoke` | Revoke a representative's access |
| `GET/POST /api/v1/me/verification` | Own applications and submission, including ownership claims |
| `GET /api/v1/verification/review`, `POST /api/v1/verification/review/:id` | Restricted pending or approved queue and decisions |

## Phase 2D.1 ordinary affiliations

Ordinary membership records live in `private.organization_affiliations`, separate from the representative roles in `private.organization_memberships`. The other new private tables are `organization_join_requests`, `organization_affiliation_invitations`, and `organization_affiliation_events`. All four have RLS and no direct grants to anonymous, authenticated, or service roles. Fastify calls narrowly scoped SQL functions that verify account eligibility and, for management writes, current owner or administrator authority. Only an owner can change membership or directory policy. Managers cannot decide their own requests or modify their own affiliation type or moderation status. Ordinary affiliations never appear in the account switcher and give no access to institutional contacts, editing, privileged invitations, or verification.

Every institution starts invitation-only. Eligible owners may choose open admission or approval required. Government kinds and institutions marked sensitive remain invitation-only. Open policies allow members, volunteers, and supporters to join directly. Staff affiliations still require approval or invitation. One current affiliation and one pending request are allowed per account and institution. Owners and administrators can suspend, reinstate, remove, or change a member's type. Members may leave or withdraw a pending request. Removed members require a new invitation to return.

Ordinary invitations use separate, recipient-bound IDs. They are visible in the recipient's Institutions inbox for seven days, can be revoked, and recheck the inviter's authority at acceptance. A successful acceptance can occur only once. Email and SMS are outside this workflow.

Private messages are visible to the institution's authorized reviewers. The requester can read the reason for a rejection in their private history. History exposes the latest 100 events to the affected member. The public directory is disabled by default. When enabled, it returns up to 100 eligible, active members who consented, with display name and affiliation type only. A change of type or participation clears consent. No admission path provides a verified badge. Private rows cascade on institution or subject deletion, while actor references can be cleared. No retention job was added.

| Fastify route | Purpose |
| --- | --- |
| `GET /api/v1/institutions/by-handle/:handle/affiliations` | Public policy and consent-filtered directory |
| `GET /api/v1/me/affiliations` | Own current memberships, pending invitations, and private history |
| `POST /api/v1/institutions/:id/affiliations` | Join or request membership under the current policy |
| `PATCH /api/v1/institutions/:id/affiliations/me` | Leave, withdraw, or change directory consent |
| `GET /api/v1/institutions/:id/affiliations/manage` | Scoped roster, pending requests, and outgoing invitations |
| `PATCH /api/v1/institutions/:id/affiliations/policy` | Owner-only membership and directory settings |
| `PATCH /api/v1/institutions/:id/affiliations/requests/:requestId` | Approve or reject an application |
| `PATCH /api/v1/institutions/:id/affiliations/members/:affiliationId` | Suspend, reinstate, remove, or change affiliation type |
| `POST /api/v1/institutions/:id/affiliations/invitations` | Issue an ordinary membership invitation |
| `POST /api/v1/affiliation-invitations/:id/:action` | Accept or revoke an ordinary invitation |

## Phase 2E platform administration and account security

The migration adds `private.account_restrictions`, `private.platform_admin_audit`, and `private.verification_review_work`. RLS is enabled and application actors have zero direct table grants. The existing `public.role_assignments` holds administrators and moderators. The existing `private.verification_reviewers` holds independent reviewer assignments. Direct service-role writes to platform roles are revoked. The moderator role is reserved for future moderation and grants no administration or reviewer access.

Suspended and banned accounts are blocked from protected Ayinou operations immediately, including direct PostgREST access to owner profile data and writes. The application records the restriction separately from any Supabase Auth ban. Reinstatement removes the application restriction. It leaves Auth bans in effect. Public pages remain accessible. Supabase continues to own credentials and recovery. Global sign-out revokes Auth sessions and protected Ayinou access checks each session against the live managed session row.

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/me/platform-access` | Current account’s administrator, reviewer, and TOTP status |
| `GET /api/v1/admin/overview` | Privileged member, organization, activity, restriction, and verification totals |
| `GET /api/v1/admin/accounts?q=&offset=` | 25 accounts per page, searched by public name, handle, or exact UUID |
| `PATCH /api/v1/admin/accounts/:id` | Change application status, grant or revoke a role, with written reason |
| `GET /api/v1/admin/audit` | Latest 100 account, role, verification, and institutional ownership events |
| `GET /api/v1/verification/review?status=` | Eligible applications in pending, assigned, approved, rejected, or revoked views |
| `PATCH /api/v1/verification/review/:id/work` | Claim or release own review work with `{ "claim": true/false }` |
| `POST /api/v1/verification/review/:id` | Record an independent decision with written rationale |

Platform administrators can view public name, handle, account UUID, confirmation and restriction status, creation date, TOTP state, and platform roles. Account email, residence, private names, private profile fields, and evidence do not appear in account search. Reviewers see evidence only through the separate conflict-filtered review queue. Review assignment never changes decision eligibility. The database checks both reviewers again before final approval. Write a short reason without placing personal documents or unnecessary personal details in it. Supabase Auth retains authentication activity in its own administrative logs.

An administrator can grant the platform administrator role only to an account with an active identity or public-figure verification and a verified TOTP factor. The account list shows the personal verification flag and disables ineligible promotions. Moderator and verification reviewer appointments still require verified TOTP. Reviewers can serve without any administrator assignment, so a single platform administrator can set up the two-reviewer workflow. Applicants cannot review their own application. The initial database-owner bootstrap does not confer personal verification.

The first real account can be verified and promoted once per database. Apply `20261120050000_first_account_bootstrap.sql`, then set `AYINOU_BOOTSTRAP_ADMIN_USER_ID` in the server-only `apps/api/.env` to the exact UUID of the first real account. Confirm its email and complete TOTP enrollment before restarting Fastify. The database checks registration order, excludes synthetic accounts, and refuses the bootstrap if another administrator already exists. The same first account may already hold administrator access from an earlier setup. The transaction creates an identity verification record with explicit bootstrap provenance and records the event in the audit history. No reviewer identity is attributed to the bootstrap. Regular registration and subsequent promotions still use the existing approval rules.

The same UUID is safe to leave in the API environment after success. It can also be removed. A persistent database marker prevents replay even after account deletion. Plan recovery access and a second eligible administrator before public use. Application role and restriction changes cannot disable the last eligible administrator. The MFA guard also protects that administrator’s final verified TOTP factor. Supabase project-owner operations remain outside the application workflow.

Run `npm run test:hosted:admin:sql -- --preflight` before first applying the migration and `npm run test:hosted:admin:sql` afterward. Run `npm run test:hosted:admin` for live synthetic Auth, TOTP, restriction, reviewer, audit, and sign-out checks. Set `AYINOU_HOSTED_TEST_PROJECT_REF=hcbxulyfmdmuyccgrujs` first. The SQL suite rolls back, and the Auth suite removes its exact synthetic fixtures. Custom SMTP remains required to test public email recovery reliably.

## Phase 3A text feed and moderation

`20261120070000_phase3a_text_feed.sql` introduces `feed_data.posts`, `post_submissions`, `content_reports`, `post_moderation_actions`, and `write_limits`. All tables have RLS. The schema stays outside the Supabase Data API. The read RPC runs under caller RLS. Restricted write functions check the authenticated subject and the live session within PostgreSQL. The service role has no direct feed table grants.

`20261120071000_feed_publication_time.sql` records the first publication time separately from creation. Drafts have no publication time. The displayed time survives edits and moderation actions, and pagination keeps using the stable creation cursor.

| Method and path | Behavior |
| --- | --- |
| `GET /api/v1/feed?scope=feed&limit=20&cursor=…` | Chronological page ordered by `created_at DESC, id DESC`. Maximum 40. `scope=mine` requires authentication and includes the caller’s published, draft, and hidden posts. |
| `GET /api/v1/posts/:id` | Read a post available to the caller. Unavailable posts return 404. |
| `POST /api/v1/posts` | Create or replay a submission. Body includes `body`, `language`, and `visibility`. Requires an `Idempotency-Key` UUID header. |
| `PATCH /api/v1/posts/:id` | Replace editable fields with an expected `version`. |
| `DELETE /api/v1/posts/:id?version=…` | Soft-delete an owned, editable post with the expected version. |
| `POST /api/v1/posts/:id/reports` | Report a visible post by another user with a category and optional note. |
| `GET /api/v1/me/feed-moderation` | Check whether the caller has a moderation assignment. |
| `GET /api/v1/moderation/feed?scope=reports&cursor=…` | Recent-MFA moderation list of pending reports or `scope=hidden` posts. Page size 25. |
| `PATCH /api/v1/moderation/posts/:id` | Record a reason and expected version for `hide`, `restore`, `remove`, or `dismiss`. |

Posts keep 1–2,000 characters of original text and one of four content language codes. Anonymous readers see published `public` posts. Eligible members also see `members_only` posts. The `private` visibility represents an author-only draft. Hidden posts remain available to their author and authorized moderation. Auth restrictions block protected actions and suppress the restricted author’s published posts. A public author name, handle, avatar, and verification badge are available when the profile is published and discoverable. Otherwise the feed uses a generic author label.

Create retries with the same author, UUID, and payload return the original ID. The database stores a digest and rejects reuse of the same key with a different payload. Version checks reject stale edits, deletes, and moderation decisions with 409. Author deletion sets `deleted_at`. Moderator removal sets `removed` and appends an audit action. Reports are unique per reporter and post. Pending reports remain in the queue until a reviewer records an explicit decision. Reports and notes have no public projection. A formal appeal flow, retention policy for deleted content, and audit retention after a hard account deletion remain launch work.

Per-minute database write quotas are 8 creations, 20 edits, and 5 reports per account. Successful duplicate create retries consume no quota. Feed read limits are 90 per anonymous IP and 120 per verified account per minute in the local API process. The bounded read limiter holds at most 10,000 active keys per window. Move the read counter to a shared store before running multiple API instances.

Run `npm run test:hosted:feed:sql -- --preflight` for the rollback-only migration rehearsal, `npm run test:hosted:feed:sql` for the deployed RLS suite, and `npm run test:hosted:feed` for the synthetic live API integration. Set `AYINOU_HOSTED_TEST_PROJECT_REF=hcbxulyfmdmuyccgrujs` first. Docker and SMTP are optional for this phase.

## Phase 3B comments, replies, and reactions

Migration `20261120080000_phase3b_engagement.sql` adds `comments`, `comment_submissions`, `post_reactions`, `comment_reactions`, `comment_reports`, and `comment_moderation_actions` under `feed_data`. RLS is enabled on all six tables. Anonymous, authenticated, and service roles have zero direct table grants. Caller-bound RPCs check the current post and comment state and return narrow projections.

| Fastify endpoint | Contract |
| --- | --- |
| `GET /api/v1/posts/:id/comments` | Oldest first by `created_at, id`. Pass `parent` for replies, `cursor` for the next page, and optionally `limit` from 1 to 25. Default 15. |
| `POST /api/v1/posts/:id/comments` | Original `body`, `language`, optional `parentId`, required UUID `Idempotency-Key`. Returns the comment UUID. |
| `PATCH /api/v1/comments/:id` | Replace the body and language with an expected edit version. |
| `DELETE /api/v1/comments/:id?version=…` | Soft-delete an eligible owned comment using the expected version. |
| `GET /api/v1/{posts,comments}/:id/reaction` | Aggregate counts for the target and the caller’s selection. |
| `PUT /api/v1/{posts,comments}/:id/reaction` | Add or replace the caller’s selected `kind`. Returns the authoritative summary. |
| `DELETE /api/v1/{posts,comments}/:id/reaction` | Remove the caller’s reaction and return the authoritative summary. |
| `POST /api/v1/comments/:id/reports` | Report a visible comment with a category and optional 500-character note. |
| `GET /api/v1/moderation/feed?target=comments&scope=reports` | Recent-MFA queue for pending reports or `scope=hidden`, with cursor pagination. |
| `PATCH /api/v1/moderation/comments/:id` | Review with expected version, action, and a written reason of 10–500 characters. |

A visible comment has 1–1,000 characters of original text and an explicit content locale. The parent key includes the post and a generated root flag, so PostgreSQL rejects cross-post parents and replies to replies. Threads inherit published public or members-only post visibility. Draft, hidden, removed, deleted, and restricted-author posts have no visible discussion. A hidden, removed, or deleted root with any eligible replies is projected as a generic tombstone with no body, author, edit metadata, or reactions. Visible replies can still be read. Unavailable roots accept no new replies.

React with `like`, `love`, `support`, or `celebrate`. Each reaction table has a unique target-and-account primary key. Counts are calculated from reaction rows, and responses expose only the caller’s selection. Posting and reacting require an eligible live Supabase session. Comment creation reuses the original UUID for a byte-equivalent payload and rejects conflicting reuse. Edits and moderation decisions use the current version. The client keeps unsent text and uses a bounded request deadline. If the response to a reaction write is lost, the client tries a read to reconcile the selection without replaying the write.

Database limits per account per minute are 12 new comments or replies, 24 edits or deletions, 40 reaction writes across posts and comments, and 5 comment reports. A combined 100-attempt limit also charges authenticated writes that reach PostgreSQL and return a known failure. Requests rejected during API shape validation never reach the database. Reads use the existing per-instance feed read limiter. A 429 includes `Retry-After`; edit conflicts and permission failures require checking the latest state. Shared responses return localized errors, safe request references, and retryability.

One report per reporter and comment is allowed. Reporter identities stay private, and reports stay pending until an authorized decision. Moderators and administrators require recent TOTP to view the queue or act. A decision records an append-only action and reason, and staff cannot decide their own comment. Authors cannot edit around a hide or removal. Assigned staff can use the original report and action history when reconsidering a decision. The user-facing appeals workflow and operational retention policy remain planned.

## Phase 3C following and discovery

Migration `20261120090000_phase3c_following_discovery.sql` adds `feed_data.member_follows` and `feed_data.institution_follows`. Their primary keys pair the caller with a typed member-profile or organization FK. Reverse indexes support follower lookups. Both tables use RLS and deny direct access to anonymous, authenticated, and service roles. RPCs bind the follower to `auth.uid()` and verify the current session.

| Fastify endpoint | Contract |
| --- | --- |
| `GET /api/v1/discover/people` | Signed-in prefix search on public display name and username. Pass `q`, `verified`, and a cursor or page size. |
| `GET /api/v1/discover/institutions` | The existing institution directory, searchable by name and handle, with optional `category`, `country`, `department`, and `verified` filters. |
| `GET /api/v1/discover/suggestions` | Up to three public members by username and three eligible institutions across distinct categories, excluding the viewer and accounts they already follow. |
| `GET /api/v1/{members,institutions}/:key/follow` | Public-safe counts and whether the signed-in viewer follows this target. Member keys are usernames. Institution keys are UUIDs. |
| `PUT /api/v1/{members,institutions}/:key/follow` | Follow. Duplicate requests return the current state. |
| `DELETE /api/v1/{members,institutions}/:key/follow` | Unfollow. Repeating a completed request returns the current state. |
| `GET /api/v1/me/following` | The caller’s eligible member and institution follows. |
| `GET /api/v1/members/:username/{followers,following}` | Privacy-filtered lists for an eligible member, accessible with a live authenticated session. |
| `GET /api/v1/institutions/:id/followers` | Public member projections of an eligible institution’s followers, accessible with a live authenticated session. |
| `GET /api/v1/feed?scope=following` | Eligible personal posts in the same descending creation-time and UUID order as Latest. |

Discovery uses case-insensitive prefix search with literal wildcard characters and a blank query or 2–80 characters. Search and list pages default to 15 and cap at 20. They use handle-based keyset cursors. Search projects public names, handles, genuine verification, and the existing institution description, category, and broad geography. Personal residence, contact details, private names, codes, evidence, and nonpublic posts are outside the contract.

A personal target must be visible, discoverable, named, and currently eligible. Hidden or suspended profiles disappear from discovery, lists, public follow counts, and the following timeline. A private member can follow eligible targets, and only that member’s own following view acknowledges their outgoing links. Public lists and counts omit private followers. Active institutions with unverified or verified status are eligible. Archived and verification-revoked institutions are omitted. Stored relationships to temporarily unavailable targets are dormant and reappear if eligibility is restored. Hard account or organization deletion cascades those relationships.

Database quotas allow 20 follow changes or attempts and 90 searches per account per minute, with up to 1,000 stored outgoing follows. Fastify limits discovery, list, and status reads to 60 per account per minute or 30 per guest IP. Those Fastify limits apply per running instance. Shared localized errors include request IDs and retry feedback. A lost follow response is reconciled with a read before showing the final state.

Following never changes representative, membership, or verification rights. The Following feed shows eligible public and members-only posts from followed members and retains the existing reaction and discussion contracts. Institution follows currently yield no feed posts. Search uses a deterministic order and does not infer interests or track behavior.

## Phase 3D For You recommendations

`20261120100000_phase3d_recommendations.sql` adds `post_topics`, `recommendation_feedback`, `recommendation_versions`, and `recommendation_snapshots` in `feed_data`. `20261120101000_recommendation_engagement_guard.sql` limits reaction scoring to posts already relevant through topics or follows. `20261120102000_optimize_recommendation_rank.sql` batches account checks across the bounded sample and disables JIT for the ranking query. All four tables have RLS and no direct app-role grants. Authors can choose zero to three unique catalog topics on posts and drafts. Older posts remain valid without tags. Topic changes use the same ownership and version checks as post edits, and topic-aware create retries include the sorted topic set.

| Fastify endpoint | Contract |
| --- | --- |
| `GET /api/v1/feed?scope=for_you` | Authenticated recommendations, `algorithmVersion`, per-post `recommendationReason`, and the next snapshot cursor. |
| `POST /api/v1/posts`, `PATCH /api/v1/posts/:id` | Optional `topics` from the existing catalog, up to three. An explicit empty array clears tags on edit. An omitted edit field preserves tags. |
| `GET /api/v1/recommendations/settings` | Caller’s selected topics and feedback count. |
| `PUT /api/v1/recommendations/settings` | Replace the caller’s selected topics. The same choices appear in My Profile. |
| `POST /api/v1/posts/:id/recommendation-feedback` | Private `not_interested`, `less_author`, or `hide_author`, bound to the visible post and its author. |
| `DELETE /api/v1/recommendations/feedback` | Clear the caller’s explicit recommendation feedback. |

The `v1` weights live in a private configuration row. A post gets 18 points per matching topic, capped at two matches, 25 for a followed author, 6 for matching the saved language, and up to 20 for freshness, with one point subtracted per 12 hours. For a topic or follow match, up to three eligible reactors add two points each. The deterministic sample checks up to 12 reaction rows and excludes the viewer, the author, and accounts less than seven days old. Reports, badges, and raw engagement totals carry no weight. Show less subtracts 45. A second post by the same author loses 8, and repeat primary topics lose two per position up to 12. Each snapshot contains at most two posts per author. Ties use publication time and UUID. Cold-start and unmatched posts are ordered by freshness, language, and variety.

An indexed query considers up to 420 recent published posts in a 30-day window. It excludes the viewer’s own posts, private or restricted authors, drafts, hidden or removed posts, and explicit post or author hides before ranking. The caller must have a live member session, and current eligibility is checked again on each page. The feed uses selected interests, follows, saved language, and limited eligible reactions. It collects no browsing history, precise location, inferred sensitive interests, or verification evidence.

Snapshots store up to 80 ordered IDs and explanation codes for ten minutes, with up to three snapshots per viewer. New snapshot builds reclaim expired rows in bounded batches. Expired cursors return `FEED_REFRESH_REQUIRED`. Current hides take effect on each page, and new Show less feedback also suppresses that author on an older snapshot. Fresh snapshots apply its downrank. Feedback stays until the member clears it or the target or account is deleted. Later blocks and mutes require their own authorization integration.

Limits are ten snapshot builds and 20 preference or feedback writes per account per minute, plus the existing per-instance Fastify read limit. The rollback-only benchmark uses 1,200 synthetic posts by 150 authors with 7,200 reactions and sets a six-second budget for one personalized page. This guards the bounded query on hosted Supabase Free. Concurrent production throughput, longer windows, and behavior beyond the fixed candidate cap need separate measurement.

## Phase 3E post images and notifications

`20261120110000_phase3e_post_media.sql` adds `feed_data.post_attachments`, post submission media digests, and the private `post-media` bucket. `20261120111000_phase3e_notifications.sql` adds `notifications` and `notification_preferences` in `feed_data`. The tables have RLS enabled and no direct anonymous, authenticated, or service-role table grants. Clients use narrowly granted RPCs. Storage policies deny direct app-role access to this bucket, including for the uploader.

| Fastify endpoint | Contract |
| --- | --- |
| `POST /api/v1/me/post-media` | Stage a still JPEG, PNG, or WebP as JSON `{ image: base64 }`. Supply a UUID in `Idempotency-Key`. Returns `{ id }`. Identical retries reuse the stage. |
| `POST /api/v1/posts` | Optional ordered `attachments: [{ id, alt? }]` attaches ready uploads atomically with the post, including drafts. Post idempotency covers text, audience, language, topics, and the ordered attachments. |
| `PATCH /api/v1/posts/:id` | With the existing `version`, an explicit attachment list replaces and reorders the post’s images or detaches all with `[]`. Omission preserves attachments. |
| `GET /api/v1/posts/:id/attachments/:attachmentId/image` | WebP bytes. `variant=thumbnail` is the default. Use `variant=display` for the larger image. `review=true` requires a live moderation role and recent TOTP. |
| `GET /api/v1/posts/:id/comments/:commentId` | Viewer-scoped comment detail for links. Inaccessible targets return 404. |
| `GET /api/v1/me/notifications` | Latest-first inbox with optional `cursor` and `limit` (default 20, max 30). |
| `GET /api/v1/me/notifications/unread-count` | `{ count }` for currently visible unread events. |
| `PATCH /api/v1/me/notifications/:id` | Set `{ read: true }` on a notification owned by the caller. |
| `POST /api/v1/me/notifications/read-all` | Mark all current retained inbox entries as read. |
| `GET/PUT /api/v1/me/notification-preferences` | Read or replace the caller’s `reactions`, `comments`, `replies`, and `followers` booleans. All four default to true. |

Sharp checks the decoded format and geometry. The input ceiling is 3 MiB, 12 million pixels, 6,000 pixels on either axis, and one still frame. The service applies orientation, strips metadata including GPS, and never stores the original. Display images are at most 1,440 px and 512 KiB, and thumbnails are at most 480 px and 128 KiB. The server processes at most two uploads concurrently per Fastify instance. Each member may attempt eight uploads per minute and hold up to 16 unattached stages and 12 MiB of derivatives. The existing post edit rate and optimistic version checks cover attachment changes. Alt text is optional and limited to 240 characters.

Feed and detail responses include attachment UUIDs, dimensions, and descriptions. They omit object paths. The binary route rechecks current post visibility for each request, allows own drafts and eligible members-only posts, and returns `Cache-Control: private, no-store`. Signed links and URL expiry are unnecessary with this proxy. Any bytes already received by a viewer are beyond server revocation. The moderation view can read hidden images through the existing recent-TOTP boundary. Deleted or permanently removed posts hide and discard their attachments.

Unattached uploads expire after 24 hours. Failed uploads keep a retryable reservation, and two-minute leases prevent overlapping writes or cleanup. Upload, detach, and deletion requests can trigger a bounded cleanup batch. An operator can also set `AYINOU_MEDIA_PROJECT_REF=hcbxulyfmdmuyccgrujs` and run `npm run db:cleanup:post-media` with the API env configured. The runner only claims expired, discarded, or orphaned attachments and removes their exact object keys. Run it periodically if usage is low. A cleanup failure retains state for a later retry.

The inbox uses transactional capture and unique recipient/event keys for post reactions, post comments, comment replies, and new personal followers. Self-actions generate no alert. Reaction changes or repeat follows reuse the existing event during retention. Preferences apply to future activity. An unavailable post, comment, actor, or follow edge removes details from the response and excludes the item from the unread count. Notification reads and writes are recipient-scoped. Read-state and preference writes are limited to 40 per member per minute. The inbox displays 30 days, and new unique events reclaim expired records in bounded batches. Physical expiry depends on activity. Email, SMS, native push, and institution-authored notifications are separate phases.

## Testing and optional local stack

Set `AYINOU_HOSTED_TEST_PROJECT_REF=hcbxulyfmdmuyccgrujs`. Run `npm run test:hosted:media:sql` to validate storage and inbox permissions, lifecycle, and stale targets using a rollback-only SQL transaction. Add `-- --preflight` before applying both Phase 3E migrations. Run `npm run test:hosted:media` to check the API and private Storage with synthetic accounts and known test object keys.

Use `npm run test:hosted:recommendations:sql` for rollback-only security, ranking, cursor, and performance checks. Use `-- --preflight` before all Phase 3D migrations, `-- --engagement-preflight` before the guard and optimization, or `-- --ranking-preflight` before the optimization alone. Run `npm run test:hosted:recommendations` for live synthetic-account API checks.

Run `npm run test:hosted:following:sql` for rollback-only RLS, visibility, and quota checks. Before applying the migration, add `-- --preflight`. Run `npm run test:hosted:following` for live synthetic-account API, concurrency, and privacy checks.

Run `npm run test:hosted:engagement:sql` for rollback-only tests of grants, reply constraints, projection privacy, moderation history, and abuse limits. Before applying Phase 3B, append `-- --preflight` to rehearse the migration inside the same rollback transaction. Run `npm run test:hosted:feed` for the Phase 3A and Phase 3B hosted API suites with disposable accounts and targeted cleanup.

Set `AYINOU_HOSTED_TEST_PROJECT_REF=hcbxulyfmdmuyccgrujs` in the shell and run `npm run test:hosted` and `npm run test:hosted:aggregation`. The guard must match the API URL. The scripts create uniquely named, confirmed synthetic Auth users, mark them excluded from public metrics, check API/RLS and aggregate cases, then delete only those returned IDs. The aggregation script requires the pinned CLI's hosted SQL access and an empty eligible-member baseline; its SQL assertions roll back each transaction. Real email confirmation, password reset, and natural token expiry require controlled mailbox testing or a disposable environment and are not asserted by these scripts.

Run `npm run test:hosted:accounts` for concurrent allocation, Auth-time referral capture, subsequent metadata changes, code separation, direct PostgREST permissions, and Supabase TOTP assurance checks. The test uses service-created synthetic accounts and does not send mail. `npm run test:hosted:accounts:preflight` is a rollback-only SQL and backfill rehearsal for the selected project **before** applying Phase 2C. After applying, inspect the version with `npm run db:migrations`.

Run `npm run test:hosted:institutions:sql` and `npm run test:hosted:affiliations:sql` to test authorization and lifecycle behavior in rollback-only transactions. Each runner accepts `-- --preflight` before applying its migration. Run `npm run test:hosted:institutions` for hosted Auth, PostgREST and API integration covering institutions and affiliations, with disposable users, organizations, and logo objects.

The existing pgTAP suite is optional and isolated to a local Docker stack:

```bash
npm run db:local:start
npm run db:local:reset
npm run db:local:test
npm run db:local:stop
```

`db:local:reset` discards **only local** data and reapplies migrations. `supabase/config.toml` is for this optional stack. Run app validation with `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Account deletion/export, administrator assignment, and verification workflows remain future work. The proposed tables for later phases are in [DATABASE_MASTER_PLAN.md](DATABASE_MASTER_PLAN.md); they have not been migrated.
