# C1.1 Community Needs Foundation

## Scope

Community Needs lives inside Communities. Members can list their own needs, create and edit private drafts, confirm private submission, inspect status and revision timestamps, and confirm withdrawal. Submission carries no finding about credibility. The only lifecycle states are draft, submitted and withdrawn.

## Data model and API

The migration creates private needs and revision tables and an empty, restricted fixture gate. Each case has an opaque UUID, community and author identifiers, timestamps, state, and ordinal revision. The content contract covers title, problem description, category, optional broad area, beneficiaries and up to four reference URLs with short notes. Revision snapshots preserve author attribution and capture provenance, with no automatic website contact or credibility classification.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/me/community-needs` | List caller-owned summaries and current memberships. Paginate by authorized case cursor. |
| GET | `/api/v1/me/community-needs/:id` | Read caller-owned detail, references and revision metadata. |
| POST | `/api/v1/me/community-needs` | Create a draft in a current community. |
| PATCH | `/api/v1/me/community-needs/:id` | Edit the draft or confirm submission or withdrawal at an expected revision. |

[Migration](../../supabase/migrations/20261124155000_c11_community_needs.sql) · [API](../../apps/api/src/routes/community-needs.ts) · [Shared contracts](../../packages/shared/src/community-needs.ts)

## Permissions and audit

| Actor or boundary | Allowed in disposable fixtures |
| --- | --- |
| Active onboarded member with current membership | Create in that community. Edit and submit their own draft while membership is current. |
| Author after leaving the community | Read their existing case and withdraw a submitted case while the account and session remain eligible. |
| Another member, community staff, administrator, Founder, or moderator | No access to someone else's case through C1.1. Staff have the same author access for their own cases. |
| Suspended account, stale session, anonymous role, or browser RPC caller | Denied. |
| API backend service role | Execute the single private-data RPC with a live member session binding. No direct table grants. |

Fastify validates the signed session and onboarding. PostgreSQL rechecks the session, effective account restrictions, onboarding, owner and current membership. Writes order against account enforcement, lock the member and relevant membership, and use atomic case revisions. M2.3 has no capability for private community-needs intake. Community publishing and project creation cover different actions. Decide an explicit feature enforcement policy before enabling any real intake. No Founder or Moderator review powers or changes to existing workspace and MFA boundaries were introduced.

Successful create, edit, submit and withdraw actions commit the current revision and its restricted snapshot together. The event records actor, community, case, request, ordinal and timestamp. Ownership-filtered reads provide revision status and timestamps. No general audit adapter or private case summary endpoint was added. See the [audit register](../standards/AUDIT_COVERAGE_MATRIX.md).

## Privacy and lifecycle

Intake is private. Cases, attribution and reference text are absent from public feeds, search, notifications, counts, and administrative projections. Withdrawal preserves the case and prior audit records. Browser responses use private no-store, no-referrer and no-index controls. Unrecognized and other-author case IDs get the same response.

Reference validation permits bounded HTTPS hostnames and conservative public path characters. It excludes credentials, ports, IP literals, reserved host suffixes, query parameters, fragments and encoded control characters or separators. It neither resolves hostnames nor guarantees a reference is public, safe or credible. References are displayed as text. Intake has no file upload or location picker. The broad area field rejects digits and coordinates, and the form warns against personal addresses, identifying vulnerable people and private documents. Narrative fields still depend on responsible input.

Private snapshots are restricted evidence. The protected tables do not have a purge schedule. Resolve retention, case export, erasure, archival, legal holds, de-identification and recovery treatment with the privacy lead before real intake. The existing synthetic privacy workflow remains unchanged.

## Localization and accessibility

English, Haitian Creole, French and Spanish cover the navigation, fields, categories, lifecycle, validation, privacy notice and confirmation. The layouts use existing light and dark tokens, responsive columns, labelled form controls, focusable navigation and status or alert feedback. Failed writes keep entered values available for correction or retry. [Translations](../../apps/web/src/lib/community-needs-i18n.ts) · [Interface](../../apps/web/src/components/community-needs.tsx)

## Reliability and recovery

Write requests carry a member-scoped idempotency key and a bounded, revision-aware command. Exact replay returns the current owned case without another event. Changing a request's payload with the same key conflicts. Stale revisions cannot overwrite a newer state. Per-member limits cover 10 concurrent drafts, five submissions and 40 revisions per rolling day. Reads use the existing profile request budget and bounded list pagination.

To pause local exercise, leave `AYINOU_COMMUNITY_NEEDS` unset and the fixture gate empty. A reviewed forward correction can change the RPC or presentation without deleting needs or events. Hosted database and Storage recovery require separate operational verification.

## Validation and CI

API injection exercises disabled environments, caller-derived identity, stale sessions, forbidden URL fields and explicit confirmation. Disposable PostgreSQL and browser tests exercise the privacy controls, eligible and denied actors, command races, audit records and four languages. Workspace typecheck, lint, shared contracts, locale parity, 55 API tests, two web environment tests, seven client-error tests and five engineering standards tests passed locally. Both the local production build and the HTTPS release build with synthetic origins passed. The serial smoke run passed all 70 selected browser tests, including the Community Needs lifecycle and community and moderation regressions. The final C1.1 rerun passed nine pgTAP assertions, same-community moderator denial and private page header checks in disposable Supabase. Separate final checks passed for group admission, moderation policy, private ballots and media readiness. The unchanged Phase 1A SQL fixture aborted at the profile RPC because it sets only a subject claim without the live provider session required by the current profile API. The serial browser run exercises current sign-in and profile behavior. Routine checks run locally. [API tests](../../apps/api/test/community-needs.test.ts) · [SQL grants](../../supabase/tests/database/c11_community_needs_test.sql) · [Browser and disposable integration](../../apps/web/e2e/community-needs.spec.ts)

## Documentation and operations

The founder-approved C1.1 database migration was applied on November 24, 2026 to AyiNou project `hcbxulyfmdmuyccgrujs`, which the CLI labels production. The tested code was `7b72935bcd05585394afd6ee94ac0fee81e433ff`. The approved file was `20261124155000_c11_community_needs.sql` with SHA-256 `c4c023c05054707615378bd55e2ab3ddf9e19eaeb27ed723fddebb45b5da0de9`.

| Check | Verified result |
| --- | --- |
| Preflight and scope | Remote main matched the tested code and the file hash matched approval. Hosted history had 130 matching versions through P1. A fresh dry run selected only the C1.1 migration, with zero seeds or roles. Hosted SQL had read-only transactions and found no C1.1 tables or RPCs before rollout. The connected application reported intake disabled. |
| Migration history | The CLI applied exactly the approved version. Hosted history showed 131 matching versions. The postflight dry run selected zero migrations. |
| Existing records | All 31 table count and fingerprint pairs matched, covering account and authorization records, communities and memberships, moderation and enforcement, appeals and audit, projects, and Storage bucket configuration. Auth account fingerprints used IDs and eligibility fields. No private row contents were returned by the probes. |
| Existing authorization and schema | All seven fingerprints matched for relation definitions and ACLs, columns, RLS policies, routine definitions and grants, triggers, schema grants, and prior migration history. |
| New case access | RLS is enabled on all three new private tables. They have no non-owner direct grants, and anon, authenticated, service and authenticator roles have no effective direct table privileges. The two private helper routines have no client or service execution grants. The public RPC grants execution only to the backend service role among non-owners. Hosted metadata confirmed security-definer execution with an empty search path and guards for live session, onboarding, authorship, current membership on intake and the closed fixture gate. |
| Activation and data | The fixture gate is empty. Needs and need revisions both contain zero records. Real intake remains disabled. |
| Connected local application | The tested API, using the hosted connection, returned HTTP 200 for health, departments, community statistics and project reads. The unsigned moderation policy request returned 401. Anonymous needs list and detail both returned 404 with the disabled-intake code and private no-store headers. Local web community directory and Projects returned 200. The private needs page redirected guests to sign-in and sent the no-index header. The ten probe outcomes matched preflight. |

The rollout was database-only. The hosted web and API were not redeployed. Hosted verification used reads and created no synthetic cases or accounts. The exact release's disposable validation and legacy Phase 1A SQL fixture limitation are recorded above.

## Remaining blockers

Decide M2.3 intake enforcement and access revocation for any future pilot, then approve purpose, privacy retention and member rights handling. Assign independent evidence reviewers, define eligibility and conflict rules, and establish escalation and correction procedures before C1.2. Evidence review, publication, project linking and pilot activation remain later work. [Roadmap](../../ROADMAP.md) · [Launch dependencies](../product-inventory/I1_LAUNCH_DEPENDENCIES.md)
