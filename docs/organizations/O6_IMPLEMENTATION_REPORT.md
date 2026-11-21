# O6 implementation report

## Scope

O6 adds a synthetic-first Early Partner pilot for established organizations. The starting commit is `d95a578b096c1ca4df8c989b0227eea0a93d82e9`. Participation is separate from identity, institutional verification, legal registration, charity status and professional qualification. The current product rules still govern projects, voting, institutional invitations and staff access.

## Data model and API

The additive migration `20261121060000_o6_early_partners.sql` creates five private RLS tables. Immutable program versions bind the eligible kinds, participation window, capacity, scope, terms version and digest, and provisioning approval. Operator assignments are scoped and expiring. Enrollment rows bind one organization and program version to the offer, owner grant and consent. Feedback has an isolated organization and pilot scope. Domain events carry receipts, idempotency, actor, resource and time. No program or operator is seeded.

| Method | Route | Use |
| --- | --- | --- |
| GET | `/api/v1/admin/early-partners` | Scoped program inventory or a selected program’s enrollments, feedback and audit history |
| POST | `/api/v1/admin/early-partners` | Nominate, independently approve or decline a nomination, suspend, end, record expiry, revoke feedback access or resolve feedback |
| GET | `/api/v1/institutions/:id/early-partner` | Current owner or institutional administrator reads private offered cases and related feedback and activity |
| POST | `/api/v1/institutions/:id/early-partner` | Owner decisions and test visibility preferences, or scoped feedback from owner or institutional administrator |

The server derives the actor from the current Supabase session. Invalid action fields and cross-organization reads are rejected. Admin commands and owner acceptance or test visibility opt-in require recent TOTP.

## Permissions and audit

An active scoped nominator can nominate an eligible organization. A different, live scoped administrator independently approves or declines. Institution conflicts, pending ownership claims, serious trust cases, government categories and missing owner authority block progression. Independent organization verification is optional for nomination. Government eligibility has no O6 override. Capacity is reserved by current offers, active cases and suspended cases. Expired offers free their reservation.

Only the current owner tied to the offer accepts the exact immutable terms revision and digest. Acceptance records the owner grant, feature scope and entitlement window in private audit context. The member gets a scoped receipt. An ownership change disables feedback and requires policy-guided review. Organization decision and feedback history remains restricted to authorized managers.

RLS and explicit revokes deny direct table access, including from the application service role. The narrowly granted security-definer RPCs share the O4 and O5 decision lock and recheck role, session, current revision and eligibility. Exact UUID retries reconcile to the original safe receipt, while changed input fails. Program version, operator provisioning and revocation, nomination, offer, rejection, consent, visibility preference, feedback, resolution, revocation, suspension, withdrawal, expiry and ending each have durable events. Read projections omit internal notes and actor identifiers. Unrecorded time-based expiry is already effective and can be recorded by a reviewer. Active obligations become a protected dependency in O5 correction previews and decisions.

## Privacy and lifecycle

The only executable pilot entitlement is structured feedback in a disposable fixture. Every feedback submission requires a current organization role, original eligible ownership, current acceptance and an active, in-window, non-revoked entitlement. The other enumerated scopes are recorded as unavailable. Existing project, ballot and institutional verification rules remain authoritative. All five tables use private service-only RPCs. The application exposes no public partner flag or directory. Test visibility consent is stored separately and never published.

Feedback is bounded plain text with category, selected feature, optional reproduction steps and a member-visible resolution summary. The workspace asks for fictional examples and excludes file uploads. Reporter identity is retained privately for attribution and rate limiting. Application logs and general activity never expose feedback text or eligibility notes. O6 has no beneficiary or sensitive program intake. An approved retention, deletion, export and notice procedure remains required before real processing. Reference constraints preserve the history for review and can block deletion through unrelated routes.

## Localization and accessibility

Platform Administration has an Early Partners tab. Organization management uses the existing account switcher and an expandable Early Partners section. It shows current role, program scope, date range, status, eligibility, version, actions and recent activity. The interface uses existing light and dark theme tokens, keyboard buttons and notices. Interface copy and errors cover Haitian Creole, French, English and Spanish.

## Reliability and recovery

Organization and program locks protect capacity and serialize acceptance, suspension and withdrawal with state and event changes in a single transaction. The live database predicate immediately closes an expired, withdrawn, suspended, revoked or unqualified entitlement. Closed-gate decisions may still record or revoke existing safety and history where authorized. The production gate is deliberately closed in SQL. A named synthetic seam returns false by default and the disposable harness temporarily replaces it for specific synthetic program IDs. Even that replacement cannot open a production-marked program. No runtime switch, environment override, credential-sharing mechanism or legal-policy acceptance exists.

## Validation and CI

Disposable coverage exercises missing MFA, operator scope, independent decisions, owner and workspace boundaries, immutable terms, exact and conflicting replays, capacity, concurrent acceptance and suspension, feedback expiry and revocation, RLS, audit counts, protected dependencies and unchanged project and verified-poll eligibility. It checks the public institution response and the absence of beneficiary fields. Browser coverage exercises the administration and organization views and organization switching. The full local run passed 61 Chromium cases, including both O6 cases and three cases from unrelated local work. All 48 API and seven client tests, both production builds, typecheck, lint, shared contracts, four-language parity, S1 standards, six L5 integrity regressions and Legal Center validation passed.

## Documentation and operations

The linked dry run orders O2 `20261121020000`, O3 `20261121030000`, O4 `20261121040000`, O5 `20261121050000` and O6 `20261121060000`. Hosted rollout requires explicit approval. Deploy the matching API and web after confirming the migration and closed runtime gates. Keep existing O4 and O5 protections in a forward correction if deployment is interrupted. Preserve receipts, the closed production gate and absent public projections.

## Remaining blockers

Before launch, approve the operator and independent decision process, selection and conflict criteria, real terms and source digest, supported features and safety procedures, retention and support boundaries, suspension and appeal handling and opt-in visibility rules. The Legal Center still lacks an approved Early Partner release slot, publication evidence, reviewed translations and an effective policy version. A future release must connect those verified records to operational acceptance. O7 needs its own organization program authorization and data governance. O6 supplies organization and participation references only.
