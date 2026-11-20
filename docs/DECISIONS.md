# Decisions and Open Questions

## Confirmed by project owner

- Name: **Ayinou**; intended domain **ayinou.com** (ownership/availability not verified here).
- Purpose: Bring Haitians together in pursuit of peace, collaboration and concrete change in Haiti.
- Languages include Haitian Creole (default), French, English, and Spanish.
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
- Keep the interface selection in the browser and allow members to save a separate profile preference for other devices.
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
- Phase 2 counts non-deleted, non-anonymous, currently unbanned Auth users unless explicitly excluded as synthetic or disqualified. Active means a successful authenticated profile GET/PATCH within 30 UTC days; verified requires approved identity or notable-person status.
- Phase 2 hides all geographic figures together if any nonempty atomic residence group has fewer than 10 members. No member-level location or raw metric table is available to client roles.

## Institutional accounts and review

- Keep one Supabase identity per person. Institution context is a resource selection checked against active authorization on every action.
- One owner manages institutional identity and may invite administrators, editors, and viewers. Administrators may invite editors and viewers. Active invitations belong to their named recipient. Representative terms are optional and expire without a scheduled job.
- Owners and administrators can see private contact email. Public profiles carry an explicit verification status, and sanitized logos are served through short-lived signed URLs.
- A reviewed claim transfers ownership and invalidates prior delegation. Institution verification is a separate application. Pending identity fields and verified identity fields are locked against edits.
- Review requires an explicit reviewer assignment, recent TOTP-backed AAL2, and no detected conflict. Two eligible reviewers must approve. Signup and claim submissions grant no badge. Application intake, evidence references, receipt of written decisions, and revocation are active. Temporary proof challenges, SMTP/SMS delivery, and identity-provider integration remain separate.
- Provision no reviewer automatically. Before production review, decide who can receive reviewer assignments, how to handle indirect conflicts and appeals, and how long to retain evidence links and review history.

## Ordinary affiliations

- Keep ordinary affiliation and authorized representation in separate tables and workflows. Roles, credentials, and verification continue to use the existing Phase 2D boundaries.
- Start all institutions as invitation-only. Owners of eligible institutions can enable open or approval-required membership. Government institutions and other institutions marked sensitive stay invitation-only by database constraint.
- Open organizations admit members, volunteers, and supporters directly. A staff request still needs approval or an invitation. An organization can invite a person it previously removed. Direct re-entry after a removal is blocked.
- The directory starts disabled. Member consent covers only the current public display name and affiliation type. Suspension, removal, leaving, or an affiliation type change clears prior consent. Requests and decisions stay private.

## Platform administration

- Reuse the platform role and reviewer tables. Administrator privileges and reviewer appointments are independent. Administrators and platform moderators can handle text-feed reports with recent TOTP.
- Require a verified TOTP factor for privileged role grants and a live TOTP-backed AAL2 session verified within the prior 15 minutes for administration and review. Protect the last eligible administrator through application role and restriction controls and final-factor removal checks.
- Record application restrictions separately from Supabase Auth bans. Use authentication logs for credential changes and an append-only application audit for administration, reviews, and ownership decisions. Establish retention and appeals before public launch.

## Comment and reaction decisions

- Keep one reply level and use chronological cursor pagination. Keep a generic root placeholder only when needed to reach visible replies.
- Store reaction choices separately for posts and comments. Membership and current content visibility govern writes. The server calculates counts from stored choices.
- Keep private comment reports and written decisions within the existing recent-TOTP moderation boundary. Decisions are independent of report volume. Formal appeals and deletion retention need launch policies.

## Following and discovery decisions

- A discoverable personal account can be followed by any eligible live member. A member who keeps their own profile private can still follow, and their identity is omitted from others’ lists and counts.
- Preserve dormant links while a target is temporarily private, suspended, archived, or verification-revoked. Restore their eligibility only when the existing visibility and account rules permit it again.
- Order Following chronologically and use deterministic, bounded suggestions drawn from public accounts. Institution follows carry no publishing or representation authority.

## Recommendation decisions

- Offer For You as a separate feed mode with Latest as the default. Reuse explicitly selected interests and the current topic catalog.
- Bound topic, follow, freshness, language, and reaction weights. Use engagement only after a topic or follow match and cap repeated authors per snapshot.
- Use private short-lived snapshots for stable pagination and apply current visibility and feedback at read time. Keep feedback controls confined to For You.

## Post images and notification decisions

- Use a dedicated private Storage bucket and serve sanitized WebP derivatives through Fastify. Authorize each request against current visibility, use the existing recent-TOTP boundary for moderation, and use private no-store responses.
- Keep temporary uploads independent of the post until an atomic post write attaches them. Use expiring leases, file-digest idempotency, bounded storage quotas, and cleanup on demand. Discard detached assets and retain hidden assets for authorized review and possible restoration.
- Create notifications in the source transaction. Deduplicate repeated reactions and follows with recipient-owned event keys, and use live eligibility for unread counts and visibility. Keep read state and each event preference private. The initial delivery channel is the in-app inbox.

## Member safety, appeals, and operations

- Store directional blocks privately and enforce a mutual authenticated boundary while either relevant relationship exists. End follows at block time. Historical discussion and notification projections check the current relationship.
- Store explicit mutes separately from For You feedback. Mute filters personalized and chronological feed views without changing their sort order or sending an alert.
- Accept one appeal per current hide action within 14 days. Keep original rationale reviewer-only, require recent TOTP and reviewer independence, and commit restoration and a private decision alert in the same transaction.
- Keep pending evidence, original moderation decisions, and account and referral audits out of routine cleanup. Make manual maintenance category-specific, project-guarded and dry-run by default. Publish an approved retention and deletion policy before launch.
- Use PostgreSQL minute buckets to share protective limits between API instances. Review guest bucket collisions, trusted proxy configuration, traffic limits and monitoring before public launch.

## Open before public launch

Phase 2B uses self-declared membership categories. A category grants no verification or privileges. Profile publication requires trusted visibility and explicit discoverability. Membership category display is a separate opt-in. Professional skills and recommendations remain outside the current onboarding flow.

- Confirm domain registration, branding/trademark and legal entity.
- Define community rules, privacy notice and retention/deletion policy.
- Decide member eligibility and how diaspora/non-Haitian supporters participate.
- Choose moderation governance and verification reviewers, including appeals.
- Validate translations with native Haitian Creole and French speakers.
- Decide production hosting, monitoring, budget and incident response.
- Confirm payment compliance and radio streaming rights before those features ship.
