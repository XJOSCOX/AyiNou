# Technical Architecture — Hosted Supabase Development

```text
Browser → Next.js App Router (localhost:4000, ht/fr/en)
   │         │ Supabase SSR cookies, PKCE callback, refresh
   │         ▼
   │    Hosted Supabase Auth
   │ bearer access token
   ▼
Fastify API (127.0.0.1:3000, /api/v1)
   │ verified subject; caller token for RLS; server-only secret for initialization
   ▼
Hosted Supabase PostgreSQL (public projection and private account tables, RLS)

Shared TypeScript contracts: packages/shared
Local main → checks → GitHub main
```

Next.js and Fastify remain independent local processes; hosted Supabase provides Auth and PostgreSQL. The browser uses the publishable key. The secret key exists only in ignored API environment settings and is never sent to browser or mobile clients. `GET /health` and `GET /api/v1/status` are public; `GET /api/v1/departments` exposes the ten reference departments. The API validates configuration with Zod, limits CORS to configured origins, and returns safe JSON errors.

Supabase Auth owns passwords, email confirmation, recovery, refresh tokens, and logout. Next.js uses Supabase SSR cookies and a PKCE callback. Protected layouts check claims, and the browser supplies an access token to Fastify. Future Android and iOS clients can use the same Auth and versioned Fastify API contract. Hosted Site URL and redirects use `http://localhost:4000`; see [DATABASE.md](DATABASE.md) for setup and email delivery limits.

Fastify's verifier calls Supabase `getClaims` to validate the token signature through JWKS or the Auth-server fallback, then checks issuer, `authenticated` audience and role, expiry, UUID subject, and non-anonymous session. Accounts with a verified Auth MFA factor require an `aal2` session in Fastify, the protected web layout, and database owner access. Before protected profile reads or edits, Fastify calls narrow service-only `initialize_member_for_api` using the verified subject. Profile reads use the caller's bearer token and RLS. Both profile-write RPCs bind to `auth.uid()` and use the same constrained atomic write path. Direct client writes to the profile, privacy, and interest tables are revoked.

`GET` and `PATCH /api/v1/me/profile` require verified bearer tokens. PATCH accepts only display name, language, and broad optional location fields. The public profile remains hidden until a future trusted visibility workflow. The API keeps private location out of anonymous responses. PostgreSQL role assignments and verification records drive access independently of user-editable metadata.

## Current layout

Phase 2B keeps Auth credential handling in Supabase. `PATCH /api/v1/me/profile/details` accepts owner-scoped partial updates and saves related fields atomically through `save_member_profile_v2`. `POST /api/v1/me/profile/avatar` validates and reencodes images before the server writes to private Storage. `GET /api/v1/profiles/:username` returns a limited public projection when trusted visibility and owner discoverability both permit it. `GET /api/v1/me/profile` returns saved onboarding progress and owner details. Stage completion, the public projection, and storage handling are available through Fastify for future native clients.

```text
apps/
  api/src/{config.ts,app.ts,server.ts,routes/,services/}
  api/test/
  web/src/{app/,components/,lib/,messages/}
packages/shared/src/
scripts/check-hosted.mjs
supabase/{config.toml,migrations/,tests/}
```

The database includes `departments`, `profiles`, `member_private`, `role_assignments`, `verification_records`, `member_metric_exclusions`, `user_activity_daily`, `user_settings`, `interest_catalog`, and `member_interests`. Member UUIDs reference `auth.users.id`. Fastify serves cohort-safe aggregates through versioned read-only routes.

Phase 2C stores member codes, referral codes, and attribution in three private-schema tables. Fastify's account endpoints derive the caller from the verified bearer token and invoke narrowly scoped server-only RPCs. Anonymous referral validation accepts a code in the request body and returns a rate-limited boolean. The account creation transaction captures a valid initial code. Later Auth metadata edits cannot rewrite attribution, and the authenticated completion endpoint accepts no referrer or code. Native clients can use the same versioned API and submit the optional `referral_code` during Supabase signup.

The site uses fluid page layouts that adapt to phones, tablets, and wide monitors. New signed-in pages use `MemberShell` for the full-width workspace, navbar, responsive sidebar, and footer. Use shrinkable grid columns and apply line-length limits to text inside the layout. My Profile uses the shared workspace and keeps its public preview separate from private fields. Account Settings links to editor sections, uses Supabase Auth for recovery and authenticator enrollment, and keeps the private member code out of profile and dashboard payloads.

### Institutional authorization

A Supabase subject always represents a person. The switcher navigates to one institution workspace and conveys no authority by itself. Each Fastify request verifies the bearer subject before it calls a service-only RPC. Institutional mutations lock the organization row, recheck active membership and term, and derive all application changes from the checked actor and resource. The anonymous public projection has a separate route and omits contact, membership, invitations, applications, and evidence. Mobile clients can use the same resource IDs and REST endpoints.

Manual verification is separate from authentication and ownership. Applicants submit up to three HTTPS public references. Reviewers must hold an explicit reviewer assignment and meet the privileged TOTP requirement. The database excludes applicants, founders, current or former representatives, and members who have joined the organization from reviewing a related application. Two independent approvals are required before a badge or ownership transfer. Decisions and sensitive changes are recorded in restricted audit history. No reviewer is provisioned by the migration. Temporary verification challenges remain a separate planned proof system.

Phase 2D.1 keeps ordinary members, volunteers, staff, and supporters in `private.organization_affiliations`. The representative switcher and Phase 2D permission checks continue to use `private.organization_memberships` alone. Affiliation endpoints share Fastify's institution authentication hook and a service-only repository. Each write serializes through the institution row, checks current policy and representative authority, and records an immutable event alongside its state change. Public roster access uses a separate limited projection. Web and future native clients can use the same endpoints without reading private tables.

### Platform administration and session enforcement

After verifying JWT signature and claims, Fastify checks the active Supabase session row, account eligibility, application restrictions, and MFA requirements. Next.js checks its cookie session before rendering the protected shell. Owner-facing database policies and RPCs check their own authenticated session. Privileged API calls require AAL2, a TOTP authentication claim from the last 15 minutes, and a live session bound to a currently verified TOTP factor. Refreshing an access token does not extend the TOTP window. Admin and reviewer RPCs verify current assignments in PostgreSQL. Account state and role changes serialize together and write an audit event in the same transaction. Operational statistics use dedicated administrator-only queries. The account switcher never provides platform authority.

Residence country and optional Haiti department are separate from an optional diaspora department of connection. Location is voluntary and self-reported; no precise coordinate is retained. Future public counts require suppression for small cohorts. Required locales are `ht` (default), `fr`, and `en`; future user-generated translations must be labeled. Public launch still requires retention/deletion rules, moderation governance, abuse controls, custom email delivery, monitoring, and privacy review.

The pinned Supabase CLI manages hosted migration history. Docker and pgTAP remain optional for isolated local checks. Hosted integration tests use identifiable synthetic records, exclusion from public metrics, transaction rollback for aggregate assertions, and targeted cleanup. No hosted reset or destructive test workflow is used.

## References

- [Supabase Next.js Auth](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
