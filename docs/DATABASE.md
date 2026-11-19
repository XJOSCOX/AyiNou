# Hosted Supabase Database and Auth

Next.js runs at `http://localhost:4000` and Fastify at `http://127.0.0.1:3000`. Auth and PostgreSQL run in the owner's hosted AyiNou project, reference `hcbxulyfmdmuyccgrujs`. Docker is not required for normal development. Neither local app is deployed.

## Setup and migrations

Install Node.js 20.9+ and npm, then run `npm install` for the pinned `supabase@3.2.0` CLI. Sign in with `npx supabase login` if needed. Copy values from [.env.example](../.env.example) to ignored `apps/api/.env` and `apps/web/.env.local`. The hosted URL and publishable key are used in both apps. Put the secret key **only** in the API file. No database password is needed to run the apps.

The initial migration `20261119160000_initial_schema.sql` creates five tables, RLS, grants, an initializer, and ten departments. `20261119173400_hosted_profile_rpc.sql` adds the profile RPCs. `20261119210000_phase2_community_stats.sql` adds the metric tables and aggregate RPC. `20261119220000_phase2b_membership.sql` adds profile details, settings, interests, private avatar storage, and the membership breakdown. `20261119230000_phase2c_accounts.sql` adds account codes, referrals, and profile write hardening. `20261120010000_phase2d_institutions.sql` adds institutions, delegated access, and verification. `20261120020000_phase2d1_affiliations.sql` adds ordinary organization membership. `20261120030000_phase2e_administration.sql` adds platform administration and live session enforcement. All eight are applied to the confirmed project.

```bash
npx supabase link --project-ref hcbxulyfmdmuyccgrujs
npm run db:migrations
npm run db:push:dry
npm run db:push
```

Use `npx supabase migration new descriptive_name` to create another versioned migration. Never use `db reset --remote`, drops, or local pgTAP against the hosted project.

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

For the first real administrator, use a controlled database-owner operation after confirming the intended project, account UUID, confirmed identity, and verified TOTP. Insert an `administrator` record into `public.role_assignments` for that exact UUID and record a `role_granted` event in `private.platform_admin_audit` in the same transaction. Leave the actor ID empty for a database-owner bootstrap and identify the operator in the separate access log. Subsequent grants and revocations use the audited application workflow. Plan recovery access and a second eligible administrator before public use. Application role and restriction changes cannot disable the last eligible administrator. The managed MFA guard also protects that administrator’s final verified TOTP factor. Supabase project-owner operations such as deleting an Auth account remain outside the application workflow.

Run `npm run test:hosted:admin:sql -- --preflight` before first applying the migration and `npm run test:hosted:admin:sql` afterward. Run `npm run test:hosted:admin` for live synthetic Auth, TOTP, restriction, reviewer, audit, and sign-out checks. Set `AYINOU_HOSTED_TEST_PROJECT_REF=hcbxulyfmdmuyccgrujs` first. The SQL suite rolls back, and the Auth suite removes its exact synthetic fixtures. Custom SMTP remains required to test public email recovery reliably.

## Testing and optional local stack

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
