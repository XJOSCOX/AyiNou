# C2.6 Founder configuration and activation separation

## Root cause and scope

The Impact settings API and service-only SQL command shared the same prerequisite as operational reporting. That rejected the Founder before the settings workspace could read its catalog and configuration whenever live processing was closed. C2.6 keeps the existing Platform Settings → Impact settings entry, the original administrator workspace, and the existing Impact settings, definitions and audit ledger. It adds a strict preparation allowlist. Outcome evidence review, Outcome publication and Impact reviews keep their closed operational state. Their Founder-only links lead to the relevant readiness material in the same settings workspace.

## Capabilities and boundaries

| Capability | Closed-state behavior |
| --- | --- |
| Impact display preparation | Read or prepare the department, completed calendar year, sector, measurement, Community Needs and public project-link preferences. Lists use all ten native Haitian department codes. |
| Measurement definitions | Inspect existing versions and their status. The Founder can propose a draft. Independent approval remains gated and still requires a separate reviewer. |
| Outcome evidence and challenge administration | Inspect existing authorization scope, role, current status and expiry, including assignment coordinators. Prepare staffing-slot plans by department. No queue, case, assignment or evidence processing opens. |
| Outcome publication administration | Inspect existing departmental disclosure authorizations and governance history. Prepare departmental staffing plans. Publication, consent and decision routes keep their operational gates. |
| Mapping and Impact governance | Review the same departmental publication authorizations used by mapping. Inspect separate existing governance appointments and propose staffing slots. Plans confer no authority on a person. |
| Readiness and history | Show the recorded configuration state and preparation and live availability separately. Distinguish empty authorized lists from read failures. History exposes configuration and reviewer governance receipts without revealing private case reports or evidence. |

Configuration initializes the existing activation value to false and preserves it on subsequent saves. Activation is outside the request contract and is rejected at the RPC boundary. There is no live activation command in this feature. The existing disposable test setup can still enable its own fixture using local SQL. Closed-gate Founder requests can only open the overview, prepare configuration, propose a definition or save an inert staffing plan. Existing tests handle operational grants only in the disposable fixture.

## Security and data lifecycle

Fastify validates action shape and derives the member, original session and MFA information from the verified token. It checks recognized Founder authority against the live platform access record. The service-only SQL command rechecks that authority, member standing and the original recent-MFA administrative workspace. Protected saves require an expected version, a reason, explicit confirmation and an idempotency key. The durable settings, definition or staffing-plan receipt is committed in the same transaction. Staffing plans store a proposed slot count, role, scope, reason and administrative provenance in the existing private ledger. They record no target participant and write nothing to the operational grant tables. The summary uses existing rosters with a bounded projection and never returns case keys, evidence, or decision content.

The migration changes the existing command function and adds a private summary helper. It introduces no tables, rows, grants to application roles, or changes to policies and triggers. Export, erasure and legal hold considerations remain covered by the [C2 privacy review](C2_FINAL_PRIVACY_REVIEW.md). Founder-entered reasons are restricted administrative records and should avoid personal evidence.

## Validation and rollout

On November 25, 2026, the hosted AyiNou Supabase project `hcbxulyfmdmuyccgrujs` received only `20261125126000_c26_founder_preparation.sql` from implementation commit `0f541ad051e55525dcc78cbfdaf3f39d1d30337f`. The SHA-256 matched the Founder-approved `04d43da9d16be9596353e5f616b12f65273ba875fffc175c211289f99c870964`. The fresh production dry run found 143 applied migrations and exactly that file pending. The apply receipt recorded one migration with no seeds or roles. A fresh postflight dry run found 144 applied and zero pending.

- Read-only preflight and postflight matched all 86 existing record fingerprints, 290 relation entries, 29 RLS policies, and 185 triggers. The routine count increased from 819 to 820. The two deployed function bodies matched the approved SQL. The existing command preserved its service-only execution and the new helper stayed private. All eight private Impact tables retained RLS and their direct-access restrictions.
- The four inspected C1 activation gates and four C2 live gates remained closed. The rollout saved no hosted preferences, assigned no reviewers, and opened no case operations.
- The connected local Next.js and Fastify apps passed 42 read-only compatibility checks after the migration. The first browser read encountered an unavailable local API. After restoring the local services, J0SC0X opened Impact settings using the existing private administration session. The workspace showed Configuration available, Not configured, Live processing disabled, and Launch readiness incomplete. The Founder could see the draft catalog, the three reviewer-readiness sections, ten staffing departments, and the empty plans, authorizations, and governance history. Test02 separately saw public Impact disabled and was denied the Founder settings URL on the final application build before the database rollout. The connected browser checks saved no hosted data.
- Disposable Supabase passed 17 end-to-end cases covering Founder preparation, the Impact lifecycle, C2 outcome workflows, and C1 across all ten departments. The Founder settings test covered English, Haitian Creole, French, and Spanish, desktop and narrow viewports, dark theme, expired and revoked authorizations, stale sessions, and saved drafts without live activation. Repository tests, type checking, lint, standards, and the local and production-mode builds passed.

The database migration is deployed. Hosted Next.js and Fastify services were outside this rollout. Operational launch still requires separately approved activation and independent reviewer readiness.
