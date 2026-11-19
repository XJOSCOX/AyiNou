# Technical Architecture — Phase 1B Accounts and Profiles

## Local-first system

```text
Browser → Next.js App Router (port 4000, ht/fr/en)
      │                │ Supabase SSR cookies and PKCE callback
      │                ▼
      │            Supabase Auth (port 54321)
      │ bearer access token
      ▼
Fastify API (port 3000, /api/v1)
      │ verified subject; server-only PostgreSQL connection
      ▼
Supabase PostgreSQL (port 54322, RLS)

Shared TypeScript response contracts: packages/shared
Local environment: independent Next.js and Fastify processes; Supabase in Docker for database tests
Git: local main → validated commits → GitHub main
```

The browser calls the versioned Fastify endpoint using `NEXT_PUBLIC_API_URL`. The API binds to localhost by default, validates configuration with Zod, logs structured events, allows only the configured web origins through CORS, and returns safe JSON errors. `GET /health` is a local health check; `GET /api/v1/status` is the web and future mobile client contract. Neither requires authentication.

Phase 1B connects Supabase Auth to the web client and Fastify to the existing database. Supabase owns email/password credentials, email confirmation, refresh tokens, and password recovery. The Next.js SSR client uses cookies and PKCE; its proxy refreshes sessions on protected routes. Protected layouts check claims server-side, while the browser supplies the access token to Fastify. See [DATABASE.md](DATABASE.md) for tables, grants, policies, and local commands.

Web and future native clients obtain an access token from Supabase Auth and send it to Fastify. The reusable API verifier uses Supabase `getClaims` for signature validation (JWKS or Auth-server fallback for symmetric signing), then checks issuer, `authenticated` audience and role, expiration, and UUID subject. It never accepts a user ID from profile request bodies. On each authenticated profile operation, the server calls `private.initialize_member(subject)` in a transaction, switches to PostgreSQL's `authenticated` role, sets the transaction-local JWT subject, and runs allowed queries under existing grants and RLS. A failed initialization rolls back and can be retried on the next request without losing the Auth account. This privileged database connection and any secret or service-role key remain server-only. Database role and verification records are never sourced from user-editable metadata.

`GET /api/v1/departments` is public. `GET` and `PATCH /api/v1/me/profile` require a verified bearer token; PATCH accepts only display name, preferred locale, and optional broad location fields. The public profile remains hidden until a future trusted visibility workflow. The API returns no email or private fields to anonymous callers. These versioned contracts are reusable by Android and iOS clients.

## Current project layout

```text
apps/
  api/src/{config.ts,app.ts,server.ts,routes/,services/}
  api/test/
  web/src/{app/,components/,lib/,messages/}
packages/shared/src/
supabase/{config.toml,migrations/,tests/}
```

Feature modules will be added when their phase begins. The web has no fake authentication or social actions.

## Data entities planned (introduce only when needed)

**Phase 1A:** `departments`, `profiles` (public-safe fields), `member_private` (private location), `role_assignments`, and `verification_records`. Member identity keys reference `auth.users.id`. No passwords or raw identity documents are stored in application tables.

**Phase 2:** aggregated views/functions for counts of resident members by department, diaspora by country, and missing/undisclosed region. Membership is self-reported; no claim of official population coverage.

**Phase 3–4:** `posts`, `comments`, `reactions`, `follows`, `content_reports`, `moderation_actions`, `communities`, `community_members`.

**Phase 5:** `verification_requests`, `verification_reviews`, `verified_entities`, `ambassador_invitations`.

**Phase 6:** `projects`, `project_milestones`, `project_roles`, `volunteer_offers`, `project_updates`.

**Phase 7:** `community_claims`, `claim_evidence`, `claim_reviews`, `claim_appeals`, `claim_status_history`.

**Phase 8:** `radio_stations`, `radio_streams`, `radio_programs`.

**Phase 9:** partner-mediated contribution records and opportunity listings as required by compliance review.

## Location handling

- Ask current country of residence; in Haiti, optionally select one of ten departments.
- Ask a separate optional 'department of connection/origin' from diaspora members.
- Never silently infer a resident's department from coarse IP or a one-time GPS reading.
- Geolocation permission should be optional, purpose-specific, and coarse by default; don't retain raw GPS coordinates for member analytics.
- Public dashboard uses aggregation, suppression of small cohorts, and no exact household-level location.

## Internationalization

- Required locales: `ht` default, `fr`, `en`.
- Localize routes/labels, form errors, onboarding, accessibility strings and notifications.
- Preserve original text for community posts; future translations must be marked as machine-generated when appropriate.
- Avoid machine-translating legal/safety notices without human review.

## Security baseline

- All exposed tables: least-privilege grants and RLS with positive and negative tests.
- Future clients authenticate through Supabase Auth; Fastify verifies access tokens and applies route authorization before user-scoped database access.
- Rate-limit registration, posting, verification submissions and report APIs.
- Separate untrusted uploads from privileged admin processes; restrict file size/type and signed URL lifetime.
- Moderators/verification staff use narrowly scoped admin authorization and auditable actions.
- Encrypt sensitive information, define retention/deletion, and do not expose reviewer evidence by default.
- No secrets, production dumps or personal identity documents in GitHub.

## External references

- Supabase Next.js quickstart: https://supabase.com/docs/guides/auth/quickstarts/nextjs
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase local development: https://supabase.com/docs/guides/local-development
