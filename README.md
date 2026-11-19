# Ayinou 🇭🇹

**Domain (planned):** ayinou.com
**Status:** Phase 0, Phase 1A, and Phase 1B implemented; local development only
**Mission:** Unite Haitians in Haiti and the diaspora around peaceful dialogue, trust, collaboration, and measurable community progress.

> Yon sèl pèp. Yon sèl avni. Ansanm pou Ayiti.

Ayinou is a Haitian-first, multilingual community platform. It connects people and organizations, helps communities surface needs and ideas, supports accountable initiatives, and makes it possible for members to contribute knowledge, effort, and resources. The platform is nonpartisan, and account prominence does not confer decision-making power over other users.

## Product principles

1. **Peaceful and inclusive:** No threats, incitement, intimidation, or harassment.
2. **Haiti-led:** Priorities affecting a community should be guided by people from that community; the diaspora can partner and contribute.
3. **Trust with evidence:** Account verification proves identity; claim verification assesses specific evidence; neither guarantees a person's opinions are true.
4. **Privacy and safety:** Users choose a broad location; GPS is optional and never a condition of joining. Never publish sensitive precise locations by default.
5. **Practical impact:** Measure completed projects and real outcomes—not only engagement.
6. **Equal participation:** Invite prominent figures as launch ambassadors, but give ordinary members equal access to participation and proposals.

## Supported languages

- Haitian Creole (`ht`) — default
- French (`fr`)
- English (`en`)

All interface strings are translated from day one; user-generated posts remain in their original language. User-generated translations can be added as a separately labeled feature later. Use language selection during onboarding and make it changeable in settings.

## Current technology stack

- Next.js App Router, React, TypeScript, Tailwind CSS (`apps/web`)
- Independent Node.js, Fastify, TypeScript API with Zod environment validation (`apps/api`)
- Shared API response contracts (`packages/shared`)
- Haitian Creole, French, and English translation dictionaries; Creole by default
- Local Supabase Auth and PostgreSQL with versioned schema, RLS, confirmation email testing, and authenticated Fastify profile routes.

We start with a responsive web app to validate UX and product flows. Android/iOS clients are later phases and can reuse Supabase-backed services.

## First milestone

**Phase 1B: Accounts and profiles** (see [ROADMAP.md](ROADMAP.md)). The web and API run independently; Auth handles credentials, while Fastify handles member profiles. Social features are not active.

## Key features by phase

1. Registration, onboarding, profiles, language, optional geographic information
2. Aggregate member statistics by department, plus diaspora summaries
3. Posts, comments, reactions, follows, media, moderation
4. Local/interest communities and groups
5. Verified identities, organizations and founding ambassadors
6. Community projects, volunteers and milestone reporting
7. Community reports and evidence-based claim review
8. Participating Haitian radio stations and authorized streams
9. Compliant contributions, volunteering and opportunities
10. Mobile apps, accessibility/performance improvements, expansion

## Local development

Requires Node.js 20.9+ and npm 10+. From the repository root:

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

API: `http://127.0.0.1:3000/health` and `http://127.0.0.1:3000/api/v1/status`. Web: `http://127.0.0.1:4000`. Run `npm run dev:api` or `npm run dev:web` to start only one app. The API binds to localhost. The web app displays an unavailable message if the API is offline.

Copy the server variables from [.env.example](.env.example) to `apps/api/.env` and browser variables plus `WEB_ORIGIN` to `apps/web/.env.local`, filling in the local values reported by `npx supabase status -o json`. Both files are ignored by Git. `DATABASE_URL` must exist only in the API file. `NEXT_PUBLIC_` variables are browser-readable and must contain only the local API URL, Supabase URL, and publishable key. `API_HOST`, `API_PORT`, and `WEB_ORIGINS` configure the API; `WEB_ORIGIN` sets the canonical callback redirect host. Use `127.0.0.1` consistently for Supabase email redirects and the web app.

On Windows, if npm scripts fail while launching Git Bash, set `npm_config_script_shell` to `C:\Windows\System32\cmd.exe` in that terminal. Docker Desktop must be running for Auth and profile development.

Do not put real credentials, production database dumps, identity documents, or sensitive user content in source control.

## Local database (Phase 1A)

Requires Docker Desktop with its Linux engine running, plus Node.js and npm. `npm install` installs the exact Supabase CLI version pinned in `package.json`; no global CLI is required. From the repository root:

```bash
npm install
npm run db:start   # first run downloads local images and applies migrations
npm run db:reset   # rebuilds only the local database and reapplies every migration
npm run db:test    # pgTAP schema, constraint, and RLS tests
npm run db:stop
```

The local Supabase API defaults to `http://127.0.0.1:54321`, PostgreSQL to port `54322`, Studio to `http://127.0.0.1:54323`, and Mailpit to `http://127.0.0.1:54324`. Run `npx supabase status` to inspect local service URLs. Never copy secret or service-role keys into source files, browser code, or `NEXT_PUBLIC_` variables. Start Supabase before the apps for Phase 1B.

Migrations are in `supabase/migrations/`; create the next one with `npx supabase migration new descriptive_name`, then reset and test locally. The initial department reference rows are inserted by the migration. `db:reset` discards local database data, including local Auth users; it does not target a linked or hosted project. Never pass `--linked`, `--remote`, or a production URL to a reset command for this workflow. See [docs/DATABASE.md](docs/DATABASE.md) for schema and profile initialization.

For a full local account flow, run `npm run db:start`, set both app environment files, then `npm run dev`. Open [register](http://127.0.0.1:4000/register), submit a disposable email address, open [Mailpit](http://127.0.0.1:54324), and follow the confirmation link. Onboarding saves the public display name and optional broad residence/connection information. The [login](http://127.0.0.1:4000/login), [forgot password](http://127.0.0.1:4000/forgot-password), [profile](http://127.0.0.1:4000/profile), and [dashboard](http://127.0.0.1:4000/dashboard) pages complete this phase. If signup remains disabled after changing `supabase/config.toml`, run `npm run db:stop` and `npm run db:start` to reload Auth settings.

## GitHub workflow: main only

- **One branch: `main`.** No pull requests, no feature/development branches, no automatic merges.
- Develop and validate locally; commit small, reviewed increments to local `main`.
- Run required checks before pushing to GitHub `main`.
- Never push `.env.local`, secrets, tokens, service-role keys, uploaded identity documents, production data, or locally generated confidential artifacts.
- Schema changes are versioned migrations with tests; fixes are committed as new commits rather than rewriting shared history.
- Use meaningful commit messages, e.g. `feat(auth): add multilingual registration`.
- Keep `main` usable at the end of each phase. Disable unfinished features instead of deploying incomplete flows.

See [docs/WORKFLOW.md](docs/WORKFLOW.md) for local Git commands and validation checklist.

## Documentation

- [ROADMAP.md](ROADMAP.md) — ordered development phases and acceptance gates
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design and data boundaries
- [docs/DATABASE.md](docs/DATABASE.md) — local migrations, RLS, and profile initialization
- [docs/PRODUCT.md](docs/PRODUCT.md) — MVP scope, users, roles, and privacy
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — branch-free Git process and quality gates
- [docs/DECISIONS.md](docs/DECISIONS.md) — agreed decisions and open questions

## Governance and safety

Ayinou is not a political party or an official election system. Community polls are consultative. Claims must be evaluated on evidence, not popularity. A prominent or verified account receives no automatic truth rating. The team should define clear, public moderation standards, an appeal process, and heightened safeguards for crisis reports before these modules are released.

## Ownership and licensing

Licensing, legal entity, official organization, trademark, and domain ownership are **not yet decided/verified**. No open-source license is granted by this planning package. Confirm name/domain and legal readiness before public launch.
