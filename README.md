# Ayinou 🇭🇹

**Domain (planned):** ayinou.com
**Status:** Phase 6D community polls and auditable recommendations with hosted Supabase for development
**Mission:** Unite Haitians in Haiti and the diaspora around peaceful dialogue, trust, collaboration, and measurable community progress.

> Yon sèl pèp. Yon sèl avni. Ansanm pou Ayiti.

Ayinou is a Haitian-first, multilingual community platform. It connects people and organizations, helps communities surface needs and ideas, supports accountable initiatives, and makes it possible for members to contribute knowledge, effort, and resources. The platform is nonpartisan, and account prominence does not confer decision-making power over other users.

## Product principles

1. **Peaceful and inclusive:** No threats, incitement, intimidation, or harassment.
2. **Haiti-led:** Priorities affecting a community should be guided by people from that community; the diaspora can partner and contribute.
3. **Trust with evidence:** Account verification proves identity; claim verification assesses specific evidence; neither guarantees a person's opinions are true.
4. **Privacy and safety:** Users choose a broad location; GPS is optional and never a condition of joining. Never publish sensitive precise locations by default.
5. **Practical impact:** Measure completed projects and real outcomes—not only engagement.
6. **Equal participation:** All members have equal access to participation and proposals. Founding Ambassadors are invited for constructive community contributions.

## Supported languages

- Haitian Creole (`ht`) — default
- French (`fr`)
- English (`en`)
- Spanish (`es`)

The language menu updates the current screen and remembers the choice in that browser. Members can save an account preference during onboarding or under My Profile. Ayinou restores that preference after sign-in in a browser without a language choice. User-generated text stays in its original language.

Translation files live under `apps/web/src/messages`. Each namespace ships an `ht.json`, `fr.json`, `en.json`, and `es.json` with the same keys and interpolation placeholders. Run `npm run test:i18n` to check every dictionary. Normal `npm test` also runs this check.

## Current technology stack

- Next.js App Router, React, TypeScript, Tailwind CSS (`apps/web`)
- Independent Node.js, Fastify, TypeScript API with Zod environment validation (`apps/api`)
- Shared API response contracts (`packages/shared`)
- Haitian Creole, French, English, and Spanish translation dictionaries with Creole as the default
- Hosted Supabase Auth and PostgreSQL for development, with versioned migrations, RLS, and authenticated Fastify profile routes.

We start with a responsive web app to validate UX and product flows. Android/iOS clients are later phases and can reuse Supabase-backed services.

## First milestone

**Phase 2B: Welcome, registration, and member profiles** (see [ROADMAP.md](ROADMAP.md)). The welcome page shows privacy-filtered community statistics, and members can resume onboarding from their last saved stage. Haitian members and international supporters can both join. The shared light and dark themes are available across the web app.

Phase 3A adds the text feed at `/feed`. Signed-in members can publish, save private drafts, edit or delete their posts, and report visible posts. Assigned platform moderators and administrators use `/feed/moderation` after recent authenticator verification. [Feed endpoints, permissions, and testing](docs/DATABASE.md#phase-3a-text-feed-and-moderation)

The feed keeps the composer and timeline together, with sections for account suggestions and community news alongside them on wide screens. Those sections show empty states while the underlying features are planned. Members can browse the existing institution directory from the feed.

Open **Comments** on a post to read or contribute to the discussion. Comments support one level of replies. Members can react to posts and comments, edit or delete their own comments, and report a comment for moderator review. The post composer places visibility and language beside the character count. [Discussion permissions, API and tests](docs/DATABASE.md#phase-3b-comments-replies-and-reactions)

Open **Discover** to find public members and institutions, manage the accounts you follow, and see privacy-filtered follower lists. **Following** in the feed shows recent eligible posts from the personal accounts you follow. Institution follows are available ahead of institution posting. [Discovery privacy, API and tests](docs/DATABASE.md#phase-3c-following-and-discovery)

**For You** is an optional feed tab. It ranks eligible posts using selected topics, follows, language, and freshness, with a small reaction score for posts already relevant through topics or follows. Members can see why a post appeared, change their topics, or hide posts and accounts from recommendations. [Ranking and controls](docs/DATABASE.md#phase-3d-for-you-recommendations)

Posts and private drafts can include up to four still images with optional descriptions. The member navbar bell opens private notifications for reactions, comments, replies, and new followers. Account Settings lets members turn each event type on or off. [Image limits, API contracts, and hosted checks](docs/DATABASE.md#phase-3e-post-images-and-notifications)

Members can block or mute another account from its profile and manage those choices in Account Settings. Members can appeal an active hide decision from **Account Settings → Moderation appeals**. The moderation workspace has a separate appeals queue. [Phase 3F behavior and maintenance](docs/DATABASE.md#phase-3f-member-safety-and-appeals)

Open **Communities** to find Haiti’s ten official Ayinou department spaces. Joining is voluntary. Each room has a members-only discussion feed and an opt-in directory. [Phase 4A membership, moderation, and API](docs/DATABASE.md#phase-4a-official-department-communities)

## Key features by phase

1. Registration, onboarding, profiles, language, optional geographic information
2. Aggregate member statistics by department, plus diaspora summaries
3. Text posts and basic moderation first, then comments, reactions, follows, and media
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

## Browser regression tests

The Chromium suite uses pinned Playwright Test and a disposable local Supabase stack. Start Docker, then run these commands from the repository root.

```sh
npx playwright install chromium
npm run test:e2e:smoke
npm run test:e2e
```

Regular development and unit tests can run independently. Browser tests use separate ports, generated fixture accounts, and local Auth, Fastify, PostgreSQL and Storage. [Browser testing, targeted runs, and cleanup](docs/WORKFLOW.md#browser-regression-tests)

The app keeps route entry points in `apps/web/src/app`, shared UI in `apps/web/src/components`, and extracted project, community, profile, verification, and Feed media workflows in `apps/web/src/features`. [Frontend module boundaries](docs/ARCHITECTURE.md#frontend-feature-modules)

Backend contract checks run in `npm run test -w @ayinou/api`. The Feed and Project Review modules share the existing Fastify registration scopes and the versioned endpoints. [API structure and contract checks](docs/ARCHITECTURE.md#text-feed-and-error-handling)

Run `npm run test:shared` to check the shared TypeScript exports and runtime constants used by the web and API workspaces. [Shared contract checks](docs/WORKFLOW.md#shared-contract-checks)

## Hosted Supabase database

The pinned Supabase CLI is installed by `npm install`. The confirmed hosted project is **AyiNou** (`hcbxulyfmdmuyccgrujs`). To inspect and apply future versioned migrations, verify the target in CLI output and use:

```bash
npx supabase link --project-ref hcbxulyfmdmuyccgrujs
npm run db:migrations
npm run db:push:dry
npm run db:push       # review the CLI prompt before applying
```

The hosted database has versioned migrations through Phase 2D.1. Remote migration commands never reset, drop, or seed the hosted database. Do not run `db reset --remote`. The SQL files and optional local pgTAP tests remain in `supabase/`. See [docs/DATABASE.md](docs/DATABASE.md).

For non-destructive hosted integration checks, set `AYINOU_HOSTED_TEST_PROJECT_REF=hcbxulyfmdmuyccgrujs` in the shell and run `npm run test:hosted` and `npm run test:hosted:accounts`. These scripts create uniquely named, confirmed synthetic Auth users, exclude them from public metrics, and delete only their returned IDs. The optional `npm run test:hosted:aggregation` uses temporary cohorts and rolls back its SQL assertions. Do not run the scripts against an unrelated project.

Open **Projects** to browse approved, eligible proposals. Manage private drafts and review status from **Manage proposals**. Reviewers use **Project reviews** with a verified authenticator. Run `npm run test:hosted:projects:sql` for rollback-only database checks and `npm run test:hosted:projects` for synthetic hosted API checks with targeted cleanup. Both use the linked project guard. [Project workflow, permissions, and API](docs/DATABASE.md#phase-6a-project-proposals)

Members can save private drafts while identity review is pending. Submitting or resubmitting requires independently reviewed personal identity and current authority for the owner. Organization-owned proposals also require independent institutional verification for public listing. The red administrator icon identifies a platform role in signed-in views. The green check identifies reviewed personal claims. [Eligibility and publication rules](docs/DATABASE.md#phase-6a1-verified-project-eligibility)

Open **Project work** from Projects to view your teams, invitations, and volunteer opportunities. Eligible owners can activate approved proposals, invite a team, and coordinate private work. Tasks and volunteer offers require recipient consent. Run `npm run test:hosted:project-work:sql` with the linked-project guard for the rollback-only operations suite. [Project work and permissions](docs/DATABASE.md#phase-6b-project-operations)

In an eligible project workspace, use **Milestones**, **Project progress**, **Updates and evidence**, and **Outcomes** to document work. The public proposal page shows eligible reviewed progress. Measurements are labeled as self-reported. Run `npm run test:hosted:project-progress:sql` for rollback-only Phase 6C checks. [Progress, evidence and reporting rules](docs/DATABASE.md#phase-6c-project-progress)

The member **Polls** workspace supports community opinions, project priorities, task or proposal decisions, and consent-based candidate selection. Eligible accounts can submit one private, final ballot. Organizers publish rules before voting opens and explicitly finalize results after voting ends. High-trust polls require reviewed identity and a frozen electorate. Recorded recommendations leave operational decisions to the existing review and appointment workflows. For the linked project, set `AYINOU_HOSTED_TEST_PROJECT_REF` to its project reference and run `npm run test:hosted:polls:sql` for rollback fixtures or `npm run test:hosted:polls` for a synthetic private-group concurrency test. [Poll rules and endpoints](docs/DATABASE.md#phase-6d-polls)

The dashboard is at `http://localhost:4000/dashboard` after login. Public API routes are `GET /api/v1/community/stats`, `/api/v1/community/departments`, and `/api/v1/community/diaspora`. Geographic data is hidden together when any nonempty underlying location group has fewer than 10 members. Zero, suppressed, and unavailable are distinct states. See [docs/DATABASE.md](docs/DATABASE.md) for exact metric definitions.

The dashboard uses a full-width member layout with a navbar, navigation sidebar, and shared footer. At smaller widths, navigation moves above the content. Open **Account settings** from the sidebar or avatar to manage profile preferences, request a password reset, configure an authenticator app, view your private member reference, or share a referral link. Referral attribution is set at signup and counted after email confirmation and a signed-in request. Member and referral codes never grant access or verification.

**My Profile** uses the full member workspace, with a live public preview beside the editor on wide displays and above it on phones. **Institutions** lets one personal account create an institutional profile, accept invitations, or switch between personal and institutional workspaces. New institutional profiles display **Unverified**. **Verification** accepts public evidence references and shows the applicant their status. Approval requires two independent reviewers using current authenticator verification.

**Platform administration** at `/admin` shows operational totals, minimal account search, restrictions, platform roles, and recent audit history. Access requires a platform administrator assignment and recent TOTP verification. The reviewer workspace has its own assignment. **Account settings** offers password change with current-password verification, TOTP setup and removal, and sign-out across Supabase sessions. The migration provisions no real administrator or reviewer. [Administration setup and API](docs/DATABASE.md#phase-2e-platform-administration-and-account-security)

Phase 2D hosted checks are `npm run test:hosted:institutions:sql` and `npm run test:hosted:institutions`. Use the same explicit linked project guard as the account checks. SQL fixtures roll back. The API fixtures remove only the test organization, its logo files, and the synthetic members created by that run.

**Institutions** now separates the organizations you manage from the ones you belong to. Open a public organization page to join or apply when its policy allows. Membership invitations and private history appear on the Institutions page. Ordinary memberships never add an account to the representative switcher or grant institutional authority. Public directories require organization enablement and each member's opt-in. Run the guarded `npm run test:hosted:affiliations:sql` and the extended hosted institution suite to verify these workflows.

Institutional verification uses category-specific badges and two independent reviewers. Verified representatives can choose whether signed-in visitors see their public name and handle on the institution's profile. Signed-in members can report impersonation from that profile. [Evidence, ownership and reviewer setup](docs/DATABASE.md#phase-5b-institutional-trust)

**Founding Ambassadors** at `/ambassadors` explains the program, selection criteria and public directory. Invitations are sent privately in the app. Participation starts privately, and only members with independently reviewed identity and a discoverable profile can opt in to public recognition. The member controls are under **Settings → My ambassador participation**. [Program rules, permissions and testing](docs/DATABASE.md#phase-5c-founding-ambassadors)

Open **Roles & Permissions** from an institution to review operational permissions, manage custom roles, and see authorized team members. Role changes require recent TOTP. Members with delegated access can open their workspace from **Institutions**. [Permission matrix and API](docs/DATABASE.md#phase-5d-custom-organization-roles)

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

Member-created diaspora and interest groups reuse the department discussion engine. Open **Communities** after sign-in to browse, create and manage groups, or use [the public directory](http://localhost:4000/community-directory). [Group policies and integration checks](docs/DATABASE.md#phase-4b-member-created-communities)

**Recommended** and **My Communities** are available in the signed-in community directory. Members can see why a space appears, dismiss a suggestion or reset group feedback. [Ranking and privacy](docs/DATABASE.md#phase-4c-community-discovery-and-recommendations)

The Verification workspace separates reviewed personal, public-figure, organization and representative claims. Eligible applicants can appeal a written decision. Signed-in members can report impersonation privately from a public member profile. [Evidence standards and review governance](docs/DATABASE.md#phase-5a-reviewed-identity-and-verification-cases)
