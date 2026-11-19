# Decisions and Open Questions

## Confirmed by project owner

- Name: **Ayinou**; intended domain **ayinou.com** (ownership/availability not verified here).
- Purpose: Bring Haitians together in pursuit of peace, collaboration and concrete change in Haiti.
- Languages: Haitian Creole, French, English.
- Backend: independent Fastify REST API. Supabase PostgreSQL, Auth, and Storage are planned integrations.
- Initial development: local environment.
- Phase 1A: local Supabase PostgreSQL migrations and RLS tests, with Auth identity references; application integration waits for Phase 1B.
- Development method: add features incrementally in named phases.
- GitHub: `main` only, no PRs; local commit and push to `main`.
- Registration will collect basic info and optionally department/location to enable aggregated member statistics.
- Priority for initial outreach: credible, influential Haitian public figures and community leaders.
- Planned later capabilities: social networking, collaborative initiatives, evidence-based reporting, verified public figures and organizations, radio streams.

## Proposed defaults (not yet confirmed)

- Next.js, TypeScript, Tailwind for responsive web-first application.
- Creole as initial default language; allow immediate switching to French/English.
- Supabase CLI and Docker are used locally in Phase 1A; do not deploy publicly.
- Email-based account authentication first; add phone sign-in later if needed.
- Voluntary current country/department instead of mandatory GPS tracking.
- Nonpartisan governance, equal community participation and evidence-based claim assessment.
- Strict local quality gates before each direct-to-main push.

## Open before public launch

- Confirm domain registration, branding/trademark and legal entity.
- Define community rules, privacy notice and retention/deletion policy.
- Decide member eligibility and how diaspora/non-Haitian supporters participate.
- Choose moderation governance and verification reviewers, including appeals.
- Validate translations with native Haitian Creole and French speakers.
- Decide production hosting, monitoring, budget and incident response.
- Confirm payment compliance and radio streaming rights before those features ship.
