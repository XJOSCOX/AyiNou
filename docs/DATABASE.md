# Local Database Foundation (Phase 1A)

This phase defines data and access rules. Neither the Next.js app nor the Fastify API connects to Supabase yet. There is no signup, login, onboarding, or protected API route. Local Auth signups are disabled in `supabase/config.toml` until Phase 1B.

## Prerequisites and commands

- Node.js 20.9+, npm, and Docker Desktop with its Linux engine running.
- `npm install` installs the exact `supabase` CLI version pinned in the root `package.json` and lockfile.
- Run these commands from the repository root:

```bash
npm run db:start
npm run db:reset
npm run db:test
npx supabase status
npm run db:stop
```

`db:start` starts the local stack and applies migrations. `db:reset` recreates **only the local** database, reapplies all `supabase/migrations/*.sql` files, and discards any local data. `db:test` runs the pgTAP files under `supabase/tests/database/`. No seed file is used; the ten departments are reference data in the first migration. To add a migration, use `npx supabase migration new descriptive_name`, write SQL in the generated file, then reset and test. Do not run remote or linked resets as part of this workflow.

## Tables

| Table | Purpose | Identity and constraints |
| --- | --- | --- |
| `public.departments` | Ten Haiti departments | Stable `HT-XX` code and unique name |
| `public.profiles` | Public-safe display name and locale | `user_id` is a UUID primary key referencing `auth.users.id`; locale is `ht`, `fr`, or `en` (default `ht`); hidden until a trusted workflow sets `is_visible` |
| `public.member_private` | Optional broad residence and diaspora connection | UUID key references `profiles`; optional two-letter country; residence department only with `HT`; diaspora department is separate and unavailable when residence is `HT` |
| `public.role_assignments` | Future administrators and moderators | Composite unique key `(user_id, role)`; grantor references `auth.users` when present |
| `public.verification_records` | Minimal identity, notable-person, or organization verification state | UUID primary key; unique `(user_id, verification_type)`; verified status requires a reviewer and timestamp |

Every member record is tied to `auth.users`, which remains the source of identity. No password, raw identification document, GPS coordinate, phone number, or email is copied into the application tables. `residence_country_code` is format-checked as a two-letter code but is not yet validated against a complete country reference list. All location details are self-reported and private; future statistics need minimum cohort thresholds before publication.

## Access rules

| Data | Anonymous | Authenticated member | Trusted server |
| --- | --- | --- | --- |
| Departments | Read | Read | Manage reference data |
| Public profiles | Read visible rows only | Read visible rows and own hidden row; edit own `display_name` and `preferred_locale` only | Set visibility after future checks |
| Private member data | No access | Read and edit own location fields only | Manage for approved workflows |
| Role assignments | No access | No access | Assign/revoke with a future audited authorization workflow |
| Verification records | No access | No access | Manage with a future audited review workflow |

All five tables have RLS enabled. The migration revokes Supabase's possible default client grants and grants only the operations above. No client insert or delete grants exist. Role and verification tables have no client policies or grants. Authenticated members cannot set `is_visible`, grant themselves a role, or create a verification record. A verified account does not gain special governance power by itself.

The 30 pgTAP assertions exercise the department seed, schema checks, initializer retry and failure behavior, anonymous access, owner access and allowed updates, other-user denial, and privilege escalation denial. The tests run in a transaction and roll back their synthetic Auth users. An RLS policy is never a substitute for an API authorization check.

## Future profile creation

Phase 1B should verify the caller's Supabase access token in Fastify, derive the user UUID from its trusted `sub` claim, and call `private.initialize_member(uuid)` through a **server-only privileged database connection**. Never accept the UUID for initialization from request input. The function inserts a hidden public profile and a private row in one database transaction. `ON CONFLICT DO NOTHING` makes retries safe and preserves existing edits. A missing Auth user fails the foreign key check and leaves no partial profile. If initialization fails after Auth created a user, the Auth account remains; the backend should report a recoverable error and retry initialization on the next authenticated request. Do not place this function on an `auth.users` trigger that could block account creation.

For ordinary future protected routes, Fastify should send a verified user token to Supabase so PostgreSQL RLS runs as that user. Privileged credentials must remain in server-only environment variables and never be sent to browsers, native apps, logs, or Git. Validate issuer, audience, signature, expiration, and subject before using a token. Read roles and verification state from trusted database tables, not user-editable JWT metadata.

## References

- [Supabase local development](https://supabase.com/docs/guides/local-development)
- [Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Auth user data](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts)
