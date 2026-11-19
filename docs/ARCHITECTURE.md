# Technical Architecture — Phase 1A Database Foundation

## Local-first system

```text
Browser → Next.js App Router (port 4000, ht/fr/en)
             │ direct HTTP GET from dedicated API client
             ▼
          Fastify API (port 3000, /api/v1)
             │ future verified access token + user-scoped DB requests
             ▼
          Supabase Auth + PostgreSQL (local schema; not connected to apps yet)

Shared TypeScript response contracts: packages/shared
Local environment: independent Next.js and Fastify processes; Supabase in Docker for database tests
Git: local main → validated commits → GitHub main
```

The browser calls the versioned Fastify endpoint using `NEXT_PUBLIC_API_URL`. The API binds to localhost by default, validates configuration with Zod, logs structured events, allows only the configured web origins through CORS, and returns safe JSON errors. `GET /health` is a local health check; `GET /api/v1/status` is the web and future mobile client contract. Neither requires authentication.

Phase 1A adds the database schema without connecting either app to it. There are no signup, login, protected API, or registration routes. See [DATABASE.md](DATABASE.md) for tables, grants, policies, and local commands.

When Supabase Auth is introduced, web and native clients should obtain an access token from Supabase Auth and send it to the independent Fastify API. Fastify must verify the signature through the project JWKS (or validate with the Auth server for a symmetric signing configuration), issuer, audience, expiration, and subject before treating the request as authenticated. Authorization must use trusted database records, not user-controlled metadata or request fields. Normal database access should carry the verified user's token so RLS evaluates `auth.uid()` for that user. A server-only privileged connection is reserved for account initialization and audited administration; never expose a service-role/secret key to the browser or mobile client. PostgreSQL grants and RLS are defense in depth, including if a future route has a mistake.

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
