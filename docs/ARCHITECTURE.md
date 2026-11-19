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
Hosted Supabase PostgreSQL (five application tables, RLS)

Shared TypeScript contracts: packages/shared
Local main → checks → GitHub main
```

Next.js and Fastify remain independent local processes; hosted Supabase provides Auth and PostgreSQL. The browser uses the publishable key. The secret key exists only in ignored API environment settings and is never sent to browser or mobile clients. `GET /health` and `GET /api/v1/status` are public; `GET /api/v1/departments` exposes the ten reference departments. The API validates configuration with Zod, limits CORS to configured origins, and returns safe JSON errors.

Supabase Auth owns passwords, email confirmation, recovery, refresh tokens, and logout. Next.js uses Supabase SSR cookies and a PKCE callback. Protected layouts check claims, and the browser supplies an access token to Fastify. Future Android and iOS clients can use the same Auth and versioned Fastify API contract. Hosted Site URL and redirects use `http://localhost:4000`; see [DATABASE.md](DATABASE.md) for setup and email delivery limits.

Fastify's verifier calls Supabase `getClaims` to validate the token signature through JWKS or the Auth-server fallback, then checks issuer, `authenticated` audience/role, expiry, and UUID subject. It does not accept a user ID from a profile request body. Before protected profile reads or edits, Fastify calls narrow service-only `initialize_member_for_api` using that verified subject. The preserved private initializer creates public and private records atomically and idempotently; a failure is retryable. Profile reads and `update_my_profile` use the caller's bearer token, least-privilege grants, and RLS. The update RPC is security-invoker and updates both profile tables in one transaction. The secret key is not used for ordinary member reads or edits.

`GET` and `PATCH /api/v1/me/profile` require verified bearer tokens. PATCH accepts only display name, language, and broad optional location fields. The public profile remains hidden until a future trusted visibility workflow. The API never publishes private location to anonymous callers. Roles and verification records are server-managed future workflows and are not based on user-editable metadata.

## Current layout

```text
apps/
  api/src/{config.ts,app.ts,server.ts,routes/,services/}
  api/test/
  web/src/{app/,components/,lib/,messages/}
packages/shared/src/
scripts/check-hosted.mjs
supabase/{config.toml,migrations/,tests/}
```

The five current tables are `departments`, `profiles`, `member_private`, `role_assignments`, and `verification_records`. Member UUIDs reference `auth.users.id`. No passwords or raw identity documents are stored in application tables. Future phases may add aggregate counts, posts/moderation, groups, verification review, projects, evidence-based reports, radio listings, and partner-mediated contributions.

Residence country and optional Haiti department are separate from an optional diaspora department of connection. Location is voluntary and self-reported; no precise coordinate is retained. Future public counts require suppression for small cohorts. Required locales are `ht` (default), `fr`, and `en`; future user-generated translations must be labeled. Public launch still requires retention/deletion rules, moderation governance, abuse controls, custom email delivery, monitoring, and privacy review.

The pinned Supabase CLI manages hosted migration history. Docker and pgTAP remain optional for isolated local checks. Hosted integration tests use identifiable synthetic records and targeted cleanup. No hosted reset or destructive test workflow is used.

## References

- [Supabase Next.js Auth](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
