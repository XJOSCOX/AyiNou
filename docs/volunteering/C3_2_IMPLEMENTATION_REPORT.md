# C3.2 Structured Project Skill Requirements

## Scope

The existing **Project Work → Volunteers** tab keeps its native opportunity form, free-text skills and time commitment, applications, offers, invitations, team and tasks. In a disposable enabled environment, an eligible organizer can attach an optional structured draft to an existing native opportunity, review its complete terms, and publish the exact stored draft. Existing free text is preserved without conversion. In a hosted closed environment the tab explains that structured requirements are closed and continues to offer the native workflow.

Individual owners, verified organization operators and authorized community managers use the established recruitment role and identity checks. The approved execution revision and its native community associations determine the single Haitian department. Missing, conflicting or non-Haiti scope leaves structured editing unavailable. Remote and hybrid options follow the published opportunity's remote setting. Local work requires the native on-site setting. A volunteer's identity, residence, nationality or preferred department gives no new authority.

## Data model and API

Three private relations store an empty synthetic gate, immutable administrative configuration, and immutable per-opportunity draft and publication revisions. A composite foreign key binds each revision to the native project and opportunity. Snapshots preserve exact C3.1 skill identifiers, versions and four translated names. Native capacity, deadline and approved project revision are copied into the exact reviewed draft. PostgreSQL checks bounded collections, duplicate terms, prerequisite scope and fields. Public API users can only call scoped Fastify routes. The single internal RPC is service-only, and helpers carry no app-role grants.

## Permissions and audit

Repository session and individual actor checks run in Fastify and PostgreSQL. Native Project Work visibility, community membership, blocking and recruitment permission apply in PostgreSQL. Writes also use the native project management restriction and rate limit. Founder settings reuse recognized Founder access, recent MFA, and the original private workspace. No Founder rank grants project recruitment rights. Protected settings store a confirmed reason, actor, workspace, expected version and receipt. Structured opportunity changes store actor, timestamp, immutable snapshot and idempotency receipt.

## Privacy and lifecycle

Opportunity snapshots contain opportunity terms and catalog data. The command never selects a private volunteer profile, consent, credential or identity evidence. Applicant context is frozen after the first application, including withdrawn applications. Owners can close the native opportunity and use a fresh one for revised terms. Applicants may see their original terms under native account, blocking and membership checks. Historic opportunity terms cascade only when the linked opportunity is lawfully deleted. Retention or any extension of disclosure requires a separate policy review. See [requirements policy](C3_2_REQUIREMENTS_POLICY.md).

## Localization and accessibility

The interface reuses existing disclosures, form labels, contrast themes and error notices. It supports English, Haitian Creole, French and Spanish. Members can use a searchable skill list, required and preferred labels, corresponding language levels and supported participation modes. Draft review includes unpaid status, native description, free-text skills, commitment, positions, deadline and structured criteria before confirmation.

## Reliability and recovery

Requirement mutations lock the same project row as native applications and closing. Catalog and settings locks prevent racing retirement or new configuration. Each write uses expected version and an idempotency receipt. Publishing revalidates the exact saved draft, and a catalog or approved project revision change requires a new review if it alters the snapshot. Existing opportunities remain readable with no new rows. Use a forward migration for a release defect.

## Validation and CI

C3.2 validation uses local checks, isolated databases, and read-only browser sessions against the connected local application. The legacy SQL fixture created Auth sessions without timestamps required by the established S2A session policy and tried to create an institution through an RPC that now requires Organization Setup. The fixture now supplies disposable session timestamps and seeds the unverified organization and its owner, while all Project Work authorization and operations remain in the test.

The final 22 disposable tests passed in six separate groups covering C3.2, C3.1 profile privacy and consent, native Project Work, C2, Impact, and C1 across all ten departments. C3.2 verified cross-project and ordinary-member denials, three owner models, required and preferred criteria, all participation modes, beginner validation, disabled catalog categories and retirement, expired and closed opportunities, native capacity, concurrent revisions, preserved application terms, and four browser languages. The browser suite checked keyboard disclosures, desktop and narrow layouts, and dark mode. The repaired legacy fixture passed its application, invitation and authorization workflow. Initial tests caught an ambiguous SQL snapshot identifier and duplicate Founder status wording. Both were corrected and the affected suites passed on the final release.

All 59 API tests, seven client tests, two web tests, shared contracts, localization checks, type checking, lint, engineering standards and local and production-mode builds passed. No routine GitHub Actions ran.

## Hosted database rollout

- Target AyiNou `hcbxulyfmdmuyccgrujs`, identified by the CLI as production.
- Implementation revision `047a8c23c575c397ecbbcb79c7ce25248872bd54`.
- Approved migration `20261125131000_c32_opportunity_requirements.sql`.
- Verified SHA-256 `b9dc4aa0aa09c477afa6ec6c044310d9c4ad6b9ed10fe9d831c9b0052323b40d`.
- Fresh preflight found 145 applied migrations and only C3.2 pending. The apply receipt listed that migration alone. Postflight found 146 applied and zero pending.
- Read-only comparison preserved all 99 existing data fingerprints, including C3.1 catalog and private records, opportunities, applications, invitations, projects, teams, and account and community data. Existing relation, function, RLS policy and trigger fingerprints matched.
- Three new private RLS tables denied direct access to anonymous, authenticated, authenticator and service roles. All six installed function bodies matched the migration. The command is service-only and the five helpers have no app execution grants. The composite opportunity reference was verified.
- C1 and C2 fixture gates stayed closed. C3.1 intake and C3.2 synthetic gates remained empty. No structured revisions, settings or volunteer profiles were created in hosted Supabase.

## Connected local application

Test02 opened Project Work and Lakou Reading Labs. The Volunteers tab displayed the native opportunities and applications sections with structured requirements closed. The Founder settings URL denied ordinary-member access. J0SC0X opened the private Founder workspace after owner-assisted authentication. Structured requirement settings displayed Requirement settings ready, version zero, 15 available catalog skills, and closed live requirements, discovery and matching. All 47 connected read-only compatibility checks passed after deployment. No hosted profiles, projects or configuration were changed by the browser checks. The deployment covered the database, with Next.js and Fastify running locally.

## Documentation and operations

See the [bounded future matching contract](C3_2_MATCHING_CONTRACT.md) and the [security tests](C3_2_SECURITY_TESTS.md). This report records the tested database release and connected local browser verification.

## Remaining blockers

Real structured requirements, volunteer profile intake, organizer discovery, profile skill display and matching remain closed. Launch still needs separately approved adult eligibility, safeguarding, regulated work and lifecycle policies. C3.3 requires its own scoped consent-aware reader and eligibility review.
