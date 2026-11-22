# Implementation and test plan

This plan sequences future work against the blueprint. Every phase starts with a fresh code/SQL inventory and owner-approved scope. Follow **Implement → Test → Fix → Deploy to hosted development → Verify → Close phase**. Keep schema and application changes in the same module, apply only the exact separately approved development migrations, and finish postflight and fixes before advancing. [Hosted development procedure](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md) A later phase can leave a gated capability closed. The review and publication of this blueprint do not start any phase or authorize hosted changes.

**Sequence.** F1 and F1.1 development release is closed. The approved sequence continues with S2 absolute session lifetimes and promotion handling → S2 session inventory and private user-bound links → identity and audit integration. Scoped support and program delegation remain separately approved follow-on work within the later integration sequence.

## Evidence required for every implementation phase

- Run from `main`, preserve unrelated files, and record the exact source and migration baselines. Use additive migrations and explicit grants. Include API contract inventory, SQL/RLS review, audit coverage, client recovery and an S1 report. Update the review register for actual contract changes.
- Use a fresh disposable Supabase with isolated synthetic accounts and storage. Exercise normal UI/API entry points and direct authorized and denied database boundaries. Preserve ability to reproduce races and rollback behavior. Record which tests ran against final commit. No synthetic writes against hosted development as part of CI.
- For any product text, validate Haitian Creole (default), French, English and Spanish, including permission errors, reason/status labels, keyboard/focus, both themes and responsive mobile/tablet/desktop. For data-only work, run parity and representative layout smoke tests and record that no copy changes were needed.
- Run `npm run typecheck`, `npm run lint`, `npm test` (shared contracts, translations, API and client), `npm run test:standards`, `npm run test:legal-center`, frozen L5 validator and regressions, `npm run build`, dependency audit and relevant Playwright suites. Verify all three GitHub jobs on final SHA. Local full Chromium and confirmation-off signup supplement CI smoke. Green CI proves source/release checks within their stated scope.

## Phase 1 — F1 release reconciliation and compatibility

| Area | Scope and evidence |
| --- | --- |
| Exact scope and existing modules | Audit the established `privileged-setup.ts` routes, `/setup/f`, `/activate/a`, Auth callback and MFA return target rules, `scripts/prepare-founder-registration.mjs`, Platform Governance and U1 username paths. Any proposed follow-up is limited to compatibility, issuance/recovery UX or clearer acceptance/audit projection. |
| Database impact | Rehearse `20261121140000_private_privileged_workflows.sql` on empty and upgraded disposable databases. Compare private tables/RLS/grants, service definer search paths, active Founder provenance, O5 and F1 event trails. A hosted migration requires separate named approval. No code or SQL change is presumed for pure release reconciliation. |
| API/UI and security | Keep dedicated setup and activation endpoints. Verify baseline F1 behavior, including secret-first setup, privacy, exact target, fresh MFA, its current independent approval and atomic role change. Use the baseline to isolate the proposed F1.1 change. |
| Disposable and cross-module tests | Run `privileged-setup`, `founder-bootstrap`, `founder-release-audit`, `administration-governance`, `usernames`, `immediate-signup` and `auth-recovery`. Cover prepared-but-unused, already-initialized upgrade, suspected credential leakage, actual callback proof and unchanged poll/project, privacy and legal gates. |
| Four languages, CI and development exit | Test both flows and cancellation in all four locales and the shared CI gate. Exit when the clean-install, upgrade and privilege cases reproduce, role/badge projections agree, and rollout and recovery notes name the exact pending scope. Hosted application is tracked as a separate outcome. |

## Phase 1.1 — F1.1 Founder-direct Administrator appointments

**COMPLETE AND DEPLOYED** on the hosted development database. Read-only postflight and disposable application validation are recorded in the [deployment evidence](../deployment/F1_F1_1_DEVELOPMENT_DEPLOYMENT.md). [Transaction design](ADMINISTRATOR_ACTIVATION.md#f11-authorization-activation-and-compatibility)

| Area | Scope and evidence |
| --- | --- |
| Exact code scope | Add a direct authorization mode only for newly confirmed Founder `appoint` proposals. Account for O5 proposal creation/receipt and state projection and F1 readiness, issuance and redemption. Keep ordinary `approve`, general `execute`, succession and recovery unchanged. |
| Database impact | Use the additive F1.1 migration after F1 to constrain the mode and adjust only the relevant O5 and F1 functions and projections. Preserve RLS, service-only RPC grants, the shared lock, uniqueness, original O5 receipts and completed history. Test upgrade without retroactively authorizing legacy proposals. |
| API, UI and minimum security | Reuse the governance proposal and private invitation/activation routes. Update only direct appointment states and controls. Require live trusted Founder authority, recent MFA and recorded reason, then correct target, credential, current eligibility, fresh MFA and explicit acceptance. No automatic promotion from the invitation itself. |
| Audit | Link the original decision receipt and reason to issuance, acceptance and activation. Preserve separate actors and a truthful authorization source. Show green only after committed role assignment. Retain expiry, revoke and denial evidence without logging the verifier or raw code. |
| Localization, CI and development exit | Validate Haitian Creole, French, English and Spanish for readiness, acceptance and unavailable states. Run S1, API contract, full Chromium, production builds, legal boundary and main CI checks. Exit when all cases below pass with restrictions and preexisting behavior intact. Hosted application requires explicit approval. |

### F1.1 disposable acceptance cases

| Case | Required outcome |
| --- | --- |
| Direct appointment and first Administrator | A recent-MFA recognized Founder confirms with a reason. An eligible target receives an invitation and activates with the correct proof and consent. Run separately with zero other platform leaders and with existing administrators. No synthetic second approver is needed for F1.1. |
| Credential and locator misuse | Invalid codes fail with bounded attempts. A copied URL alone, a copied code from another account, wrong target, expired/revoked invitation and replay after use all fail. |
| Consent and assurance | No activation without explicit acceptance or current TOTP on the target's live session. Deny Founder initiation without current MFA or a valid reason. Invalid or suspended account and revoked session cannot perform protected steps. |
| Concurrent appointment and redemption | Simultaneous proposals and issuance do not create duplicate active invitations. A conflicting retry fails. Two concurrent valid redemptions commit exactly one role and one acceptance/activation sequence. |
| Founder suspension | With disposable restricted-account fixtures, prove a suspended Founder cannot authorize or issue. Suspension after issue blocks outstanding redemption. Existing protected restriction/recovery commands stay closed as before. |
| Existing Administrator privileges | An existing Administrator retains routine powers, cannot initiate a Founder-reserved appointment or self-promote, and gains no power to approve a marked direct appointment. Legacy pending approvals and unrelated O5 approvals remain independently governed. |
| Independent verification and privacy | A separately assigned Founder has one ordinary identity vote. A second distinct eligible, unconflicted reviewer is still necessary. Verify no blue or gold grant, no new proof/evidence, ballot, legal or privacy authority, and unchanged O3 gates. |
| Audit and upgrade consistency | Record a single attributable Founder receipt and written reason, invitation and verified target consent. Role, verifier consumption and success audit commit or roll back together. Existing approval receipts retain their source and pending legacy proposals gain no direct authorization. |
| Prevention of Founder self-promotion | Attempts from a normal member, Administrator, wrong account or alternate service route cannot create Founder authority. Founder cannot appoint themself or create a second Founder. Bootstrap singleton and role projection remain consistent. |

## Phase 2 — S2 absolute session lifetimes and promotion handling

**OWNER APPROVED — NOT YET IMPLEMENTED**. The approved policy is recorded in the [Session Security plan](../security/SESSION_SECURITY_IMPLEMENTATION_PLAN.md#absolute-session-policy).

| Area | Scope and evidence |
| --- | --- |
| Exact scope and existing modules | Measure supported Auth session fields in disposable and approved read-only environments. Modify only login/SSR session creation and refresh, `apps/web/src/proxy.ts`, `apps/api/src/services/auth.ts` and the corresponding SQL session boundary and direct protected consumers. Include F1 administrator promotion and current role revocation. |
| Database impact | Compare verified provider settings with required per-role deadlines. If needed, design an additive private state keyed to verified provider session ID with server-owned start, preference, effective deadline and constraint state. Define legacy-session rollout, monotonic deadlines and bounded cleanup. Never trust client time or JWT refresh time as initial sign-in. |
| API/UI and security | Default Remember This Device to unchecked. Enforce 30 days for ordinary remembered sessions, 12 hours with nonpersistent browser authentication when unchecked, and six hours each for the recognized Founder and Administrators regardless of preference. Derive Founder authority from trusted bootstrap provenance. Measure from original authenticated session start and preserve the deadline through refresh. Revoke or constrain prior sessions before privileged access on promotion. Remove authority immediately on role revocation and preserve applicable 15-minute TOTP assurance. |
| Disposable and cross-module tests | Use controlled clocks and disposable Supabase. Run separate expiry cases for Founder at six hours, Administrator at six hours, remembered ordinary member at 30 days and unremembered ordinary member at 12 hours. Independently exercise refresh rotation, promotion, role revocation, multiple devices, current MFA, cross-account session isolation and enforcement in Next.js, Fastify and PostgreSQL as applicable. Regress both F1 workflows, reset/MFA, U1 onboarding, project/poll writes, organization context and relevant protected Storage. |
| Four languages, CI and development exit | Exercise remember/expiry/org return states in all locales and run final CI. Exit when all enforcement points agree and refreshed or pre-promotion credentials cannot extend a deadline or bypass the role transition. |

## Phase 3 — S2 session inventory and private user-bound links

| Area | Scope and evidence |
| --- | --- |
| Exact scope and existing modules | Extend Account Settings security, scoped Auth operations and a shared `/s/{flowId}/{step}` resolver. Start with an account-owned resumable O2 draft and one owner-approved session-bound security workflow. Keep F1 and legacy redirects until each migration has acceptance evidence. |
| Database impact | Add private workflow scope/state if necessary, with allowed steps, actor/session refs, expiry, revocation and versioned receipts. Add provider-backed session projections only for fields with reliable provenance. Partition access and permissions from public identifiers. |
| API/UI and security | Show current/other sessions and revocation notices, expose targeted or all-other revocation only where supported. Enforce flow authorization per step and read, fixed egress/redirect allowlists, no-store and safe restart. Pin highly sensitive flows to the approved initiating session. |
| Disposable and cross-module tests | Multi-device copied URLs, account switching, revocation during action, expired sessions, concurrent step, changed role or resource ownership, bad redirect, URL observability and preserved F1 compatibility. Regress notifications, onboarding and self-service profile/privacy access. |
| Four languages, CI and development exit | Verify settings, resume and safe unavailable states in all locales and run final CI. Exit when supported session revocations work at the provider and app/database, no legacy URL bypass exists, and unsupported timestamps/controls are explicitly deferred. |

## Phase 4 — Identity and authorization integration

| Area | Scope and evidence |
| --- | --- |
| Exact scope and existing modules | Reconcile O3 Founder cases, ordinary reviewer work, supersession, privacy-safe evidence custody, badge projections used by profile/nav/feed and high-trust O4/project/poll predicates. Preserve existing member, institution and separately assigned credentials. |
| Database impact | Add only reviewed constraints, policy revisions or scoped evidence references. Preserve all cases, reasons, disclosure history and holds. Document audit provenance for any migrated projection. Keep the issuance and O4 parity switches closed unless separately approved. |
| API/UI and security | Update only existing verification, case, consent, reviewer and scoped public designation paths where a documented gap exists. Enforce distinct unconflicted votes, current proof, opt-in and actor separation. Verify no badge broadens privileges. |
| Disposable and cross-module tests | Run two-reviewer conflict and stale assignment, one Founder vote, self-review and unauthorized issue denials, opt-in/opt-out and late supersession with races/holds, parallel badge display and prompt withdrawal. Exercise sensitive proof only with synthetic references. Regress eligibility in O4, projects, polls, invitations and public profile visibility. |
| Four languages, CI and development exit | Validate consent text, badge accessible names and separate held/revoked states in every locale and run final CI. Exit when the synthetic path and separation checks pass. Real Founder proof, support and appeal operations need separate approval. |

## Phase 5 — Scoped support and program delegation

| Area | Scope and evidence |
| --- | --- |
| Exact scope and existing modules | After the owner defines roles, extend platform permissions only for approved Support Staff and Program Operator tasks. Reuse O5 consented corrections and O6 program/organization scope. Keep O4 ownership, representative roles and independent verification separate. |
| Database impact | Add purpose, resource scope, expiry and revocation only where existing assignments cannot express them. Audit provisioning and scope changes. Preserve old role assignments and dedicated operator grants. |
| API/UI and security | Add scoped assignment and case views and safe resource-specific commands. Read only the minimum data justified by the assignment. Require current authority, expected scope/consent and action-specific recent MFA. No global role or badge inheritance. |
| Disposable and cross-module tests | Role matrix across seven principals, mixed-role conflict, cross-organization access, revoked/expired assignment, legal/privacy/ballot denials and O5 correction/claim races. Regress identity review, projects, O6 synthetic lifecycle and organization custom roles. |
| Four languages, CI and development exit | Test scope, reason and revoked states in every locale, and run final CI. Exit when independent capability checks pass; real program enrollment and operational staffing stay separately governed. |

## Phase 6 — Audit integration and release evidence

| Area | Scope and evidence |
| --- | --- |
| Exact scope and existing modules | Inventory F1/O5, Auth session events, username, identity, O2–O7, legal/privacy and privilege ledgers. Deliver a few approved scoped read projections before considering broader Unified Audit Center search or export. |
| Database impact | Preserve source ledgers. Add only versioned restricted projections/grants or bounded telemetry needed by approved policy. Use explicit missing legacy fields and scope checks. |
| API/UI and security | Scoped filtering and actor/resource views, redacted command references, data lifecycle and immutable corrections. Separate authorization to read evidence, retain it, export it and administer the workflow. |
| Disposable and cross-module tests | Verify rolled-back writes never appear as success, retries preserve one receipt, narrow staff cannot cross domains, no credentials or evidence leakage, and retention/holds act only on approved scope. Rehearse database and Storage restore with synthetic records. Regress legal and privacy gates and ballot confidentiality. |
| Four languages, CI and development exit | Validate audit labels and redacted/unavailable states in each locale and run final CI. Exit with reconciliation, review ownership, operator runbooks and evidence for scoped access. Real records or broader audit integration require independent follow-on approval. |

## First-install and existing-host test strategy

1. Use `npm run test:e2e -- privileged-setup.spec.ts founder-bootstrap.spec.ts administration-governance.spec.ts` against a fresh disposable database with Mailpit. Start with no Founder and prove ordinary signup cannot claim a protected handle or power. Exercise wrong and exhausted setup secrets, expiry, actual emailed confirmation, no proof under auto-confirm, wrong-actor and second-browser attempts, password/email recovery, MFA and concurrent claim. Verify exactly one committed bootstrap and red projection.
2. Establish the current F1 baseline in disposable infrastructure. Legacy F1 needs an eligible independent approver, and a lone Founder stays pending. For F1.1, prove a marked direct appointment can activate with a sole Founder only after eligible target acceptance, current MFA and one-time redemption. Run the F1.1 cases above and preserve legacy and unrelated governance behavior.
3. Rehearse existing-data upgrade with the earlier migrations and then F1 in disposable infrastructure. Ensure the existing Founder can continue and no competing bootstrap can form. Compare expected RLS, grants and migration fingerprints. Test recoverability using synthetic database + Storage, not merely a schema dump.
4. On the existing hosted development project, verify the tested revision, exact target and authorized migration scope, record a read-only preservation inventory, apply the approved migrations and complete the catalog, grants and role postflight. Preserve all records, credentials, settings and history. An approval for named migrations grants no permission to reset or change runtime gates.

## Optional future hosted reset

Prefer a new disposable environment even if hosted accounts are synthetic. A hosted reset would affect Auth users and sessions, MFA enrollment, profiles, founder provenance, assignments, organizations and private Storage references/objects; it may also require restoring provider settings, policies, redirect allowlists, operator configuration and migration history. A linked project command must never be substituted for the disposable runner.

First inventory what is eligible for deletion and what must be retained. Verify the exact project, a recoverable scoped backup, restoration evidence, approved targets for recovery and operator access, a maintenance window and safe app isolation. Obtain a separate explicit plan approval naming the records and objects, exact deployment/rebuild steps, test Founder identity and restoration or fail-forward approach. Only then could an operator rebuild the approved chain, configure Auth from reviewed settings, reestablish trusted bootstrap through the private proof path if authorized, and verify schema, RLS, grants, Auth and Storage. Disable restricted features throughout. Record before/after history and evidence. This blueprint authorizes no hosted reset.

## Public-launch readiness

Use **COMPLETE AND DEPLOYED** after the tested code, required hosted development migrations and postflight are verified. Record the actual application deployment status separately. A public launch additionally needs verified provider backup and restore, secured Storage copies, named operators and support, approved recovery objectives, SMTP and Auth redirect verification, production incident and access controls, lawful retention and evidence handling, approved legal releases and separately approved feature gates. See [D2 readiness](../deployment/D2_FINAL_READINESS.md) and the [S1 completion checklist](../standards/FEATURE_COMPLETION_CHECKLIST.md).
