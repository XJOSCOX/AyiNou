# Ayinou 🇭🇹

**Domain (planned):** ayinou.com
**Status:** Phase 2B welcome and member profiles with hosted Supabase for development
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
- Hosted Supabase Auth and PostgreSQL for development, with versioned migrations, RLS, and authenticated Fastify profile routes.

We start with a responsive web app to validate UX and product flows. Android/iOS clients are later phases and can reuse Supabase-backed services.

## First milestone

**Phase 2B: Welcome, registration, and member profiles** (see [ROADMAP.md](ROADMAP.md)). The welcome page shows privacy-filtered community statistics, and members can resume onboarding from their last saved stage. Haitian members and international supporters can both join. The shared light and dark themes are available across the web app.

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

Requires Node.js 20.9+, npm 10+, and access to the hosted AyiNou Supabase project. Docker is not required. From the repository root:

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

API: `http://127.0.0.1:3000/health` and `http://127.0.0.1:3000/api/v1/status`. Web: `http://localhost:4000`. Run `npm run dev:api` or `npm run dev:web` to start only one app. The API binds to localhost. The web app displays an unavailable message if the API is offline.

Copy the relevant values from [.env.example](.env.example) to `apps/api/.env` and `apps/web/.env.local`. Use the project URL and publishable key from the [AyiNou dashboard](https://supabase.com/dashboard/project/hcbxulyfmdmuyccgrujs); put the **secret key only in the API file**. Both files are ignored by Git. `NEXT_PUBLIC_` variables are browser-readable. `API_HOST`, `API_PORT`, and `WEB_ORIGINS` configure Fastify; `WEB_ORIGIN=http://localhost:4000` sets the canonical Auth callback host. Start the apps with `npm run dev`, then open `http://localhost:4000`. The API remains on `http://127.0.0.1:3000`.

On Windows, if npm scripts fail while launching Git Bash, set `npm_config_script_shell` to `C:\Windows\System32\cmd.exe` in that terminal.

Do not put real credentials, production database dumps, identity documents, or sensitive user content in source control.

## Hosted Supabase database

The pinned Supabase CLI is installed by `npm install`. The confirmed hosted project is **AyiNou** (`hcbxulyfmdmuyccgrujs`). To inspect and apply future versioned migrations, verify the target in CLI output and use:

```bash
npx supabase link --project-ref hcbxulyfmdmuyccgrujs
npm run db:migrations
npm run db:push:dry
npm run db:push       # review the CLI prompt before applying
```

The hosted database has versioned migrations through Phase 2D. Remote migration commands never reset, drop, or seed the hosted database. Do not run `db reset --remote`. The SQL files and optional local pgTAP tests remain in `supabase/`. See [docs/DATABASE.md](docs/DATABASE.md).

For non-destructive hosted integration checks, set `AYINOU_HOSTED_TEST_PROJECT_REF=hcbxulyfmdmuyccgrujs` in the shell and run `npm run test:hosted` and `npm run test:hosted:accounts`. These scripts create uniquely named, confirmed synthetic Auth users, exclude them from public metrics, and delete only their returned IDs. The optional `npm run test:hosted:aggregation` requires an empty eligible-member baseline and rolls back its SQL assertions. Do not run the scripts against an unrelated project.

The dashboard is at `http://localhost:4000/dashboard` after login. Public API routes are `GET /api/v1/community/stats`, `/api/v1/community/departments`, and `/api/v1/community/diaspora`. Geographic data is hidden together when any nonempty underlying location group has fewer than 10 members. Zero, suppressed, and unavailable are distinct states. See [docs/DATABASE.md](docs/DATABASE.md) for exact metric definitions.

The dashboard uses a full-width member layout with a navbar, navigation sidebar, and shared footer. At smaller widths, navigation moves above the content. Open **Account settings** from the sidebar or avatar to manage profile preferences, request a password reset, configure an authenticator app, view your private member reference, or share a referral link. Referral attribution is set at signup and counted after email confirmation and a signed-in request. Member and referral codes never grant access or verification.

**My Profile** uses the full member workspace, with a live public preview beside the editor on wide displays and above it on phones. **Institutions** lets one personal account create an institutional profile, accept invitations, or switch between personal and institutional workspaces. New institutional profiles display **Unverified**. **Verification** accepts public evidence references and shows the applicant their status. Restricted reviewers use an MFA-elevated session. Approval requires two independent reviewers. No real reviewers are provisioned by the migration.

Phase 2D hosted checks are `npm run test:hosted:institutions:sql` and `npm run test:hosted:institutions`. Use the same explicit linked project guard as the account checks. SQL fixtures roll back. The API fixtures remove only the test organization, its logo files, and the synthetic members created by that run.

Hosted Auth has email/password signup and confirmation enabled. Its site URL is `http://localhost:4000`, with `http://localhost:4000/auth/callback` and `http://localhost:4000/reset-password` allowed as redirects. The hosted default email sender reaches only organization team addresses and allows very few messages per hour; use a controlled team mailbox for limited testing or configure custom SMTP for reliable signup and password-reset testing. Do not turn off confirmation to bypass this. Local Mailpit is available only with the optional Docker stack; it is not the hosted project's inbox. See [docs/DATABASE.md](docs/DATABASE.md) for testing limits and troubleshooting.

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
- [docs/DATABASE.md](docs/DATABASE.md) — hosted migrations, RLS, and profile initialization
- [docs/DATABASE_MASTER_PLAN.md](docs/DATABASE_MASTER_PLAN.md) — proposed full database architecture and phased migration order
- [docs/PRODUCT.md](docs/PRODUCT.md) — MVP scope, users, roles, and privacy
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — branch-free Git process and quality gates
- [docs/DECISIONS.md](docs/DECISIONS.md) — agreed decisions and open questions

## Governance and safety

Ayinou is not a political party or an official election system. Community polls are consultative. Claims must be evaluated on evidence, not popularity. A prominent or verified account receives no automatic truth rating. The team should define clear, public moderation standards, an appeal process, and heightened safeguards for crisis reports before these modules are released.

## Ownership and licensing

Licensing, legal entity, official organization, trademark, and domain ownership are **not yet decided/verified**. No open-source license is granted by this planning package. Confirm name/domain and legal readiness before public launch.
