# Decisions and Open Questions

## Confirmed by project owner

- Name: **Ayinou**; intended domain **ayinou.com** (ownership/availability not verified here).
- Purpose: Bring Haitians together in pursuit of peace, collaboration and concrete change in Haiti.
- Languages: Haitian Creole, French, English.
- Backend: independent Fastify REST API with hosted Supabase PostgreSQL and Auth. Storage remains planned.
- Development: local Next.js on port 4000 and Fastify on port 3000, backed by the owner's hosted AyiNou Supabase project (`hcbxulyfmdmuyccgrujs`). Docker is optional for isolated database tests.
- Phase 1A: local Supabase PostgreSQL migrations and RLS tests, with Auth identity references; application integration waits for Phase 1B.
- Development method: add features incrementally in named phases.
- GitHub: `main` only, no PRs; local commit and push to `main`.
- Registration will collect basic info and optionally department/location to enable aggregated member statistics.
- Priority for initial outreach: credible, influential Haitian public figures and community leaders.
- Planned later capabilities: social networking, collaborative initiatives, evidence-based reporting, verified public figures and organizations, radio streams.

## Proposed defaults (not yet confirmed)

- Next.js, TypeScript, Tailwind for responsive web-first application.
- Creole as initial default language; allow immediate switching to French/English.
- The pinned Supabase CLI manages versioned remote migrations after project-reference and dry-run review; the local Docker stack remains optional for pgTAP tests.
- Email-based account authentication first; add phone sign-in later if needed.
- Voluntary current country/department instead of mandatory GPS tracking.
- Nonpartisan governance, equal community participation and evidence-based claim assessment.
- Strict local quality gates before each direct-to-main push.

## Hosted development decisions

- Keep the Phase 1A tables, grants, RLS policies, and private initializer. Add a narrow service-role RPC for initialization and an authenticated, RLS-bound RPC for atomic profile edits.
- Validate the Supabase access token in Fastify, derive the subject from verified claims, and use that token for member-scoped database access. Never trust profile IDs or roles from a request body.
- Store publishable credentials in web/API environment files and the secret key only in the ignored API environment file. Do not store a database password locally for normal development.
- Keep hosted email confirmation enabled. Use a controlled mailbox or custom SMTP for complete registration and recovery testing; do not use the hosted database for destructive reset or pgTAP workflows.

## Open before public launch

- Confirm domain registration, branding/trademark and legal entity.
- Define community rules, privacy notice and retention/deletion policy.
- Decide member eligibility and how diaspora/non-Haitian supporters participate.
- Choose moderation governance and verification reviewers, including appeals.
- Validate translations with native Haitian Creole and French speakers.
- Decide production hosting, monitoring, budget and incident response.
- Confirm payment compliance and radio streaming rights before those features ship.
