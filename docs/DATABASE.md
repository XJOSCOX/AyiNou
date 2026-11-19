# Hosted Supabase Database and Auth

Next.js runs at `http://localhost:4000` and Fastify at `http://127.0.0.1:3000`. Auth and PostgreSQL run in the owner's hosted AyiNou project, reference `hcbxulyfmdmuyccgrujs`. Docker is not required for normal development. Neither local app is deployed.

## Setup and migrations

Install Node.js 20.9+ and npm, then run `npm install` for the pinned `supabase@3.2.0` CLI. Sign in with `npx supabase login` if needed. Copy values from [.env.example](../.env.example) to ignored `apps/api/.env` and `apps/web/.env.local`. The hosted URL and publishable key are used in both apps. Put the secret key **only** in the API file. No database password is needed to run the apps.

The initial migration `20261119160000_initial_schema.sql` creates five tables, RLS, grants, an initializer, and ten departments. `20261119173400_hosted_profile_rpc.sql` adds the profile RPCs. `20261119210000_phase2_community_stats.sql` adds the metric tables and aggregate RPC. `20261119220000_phase2b_membership.sql` adds profile details, settings, interests, private avatar storage, and the membership breakdown. All four are applied to the confirmed project. Inspect migration history and dry-run future changes before applying them.

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
| `public.profiles` | Display name, `ht`/`fr`/`en` preference, hidden visibility | Visible rows readable; owner may read hidden row and edit only name/locale |
| `public.member_private` | Optional residence country and Haiti department, separate diaspora connection | Owner read and edit only |
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

Fastify reads member data using the caller's access token, so grants and RLS enforce owner scope. PATCH uses the security-invoker `public.update_my_profile` RPC; both table updates occur in one transaction under the caller's token. The API returns safe errors. The secret key is not used for ordinary member reads or edits. Role and verification state never come from user-editable metadata.

## Testing and optional local stack

Set `AYINOU_HOSTED_TEST_PROJECT_REF=hcbxulyfmdmuyccgrujs` in the shell and run `npm run test:hosted` and `npm run test:hosted:aggregation`. The guard must match the API URL. The scripts create uniquely named, confirmed synthetic Auth users, mark them excluded from public metrics, check API/RLS and aggregate cases, then delete only those returned IDs. The aggregation script requires the pinned CLI's hosted SQL access and an empty eligible-member baseline; its SQL assertions roll back each transaction. Real email confirmation, password reset, and natural token expiry require controlled mailbox testing or a disposable environment and are not asserted by these scripts.

The existing pgTAP suite is optional and isolated to a local Docker stack:

```bash
npm run db:local:start
npm run db:local:reset
npm run db:local:test
npm run db:local:stop
```

`db:local:reset` discards **only local** data and reapplies migrations. `supabase/config.toml` is for this optional stack. Run app validation with `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Account deletion/export, administrator assignment, and verification workflows remain future work. The proposed tables for later phases are in [DATABASE_MASTER_PLAN.md](DATABASE_MASTER_PLAN.md); they have not been migrated.
