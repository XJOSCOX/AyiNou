# O7 organization integration report

## Scope

The starting `main` and `origin/main` commit was `2b6ae18369719538b1938b6e64660855aa8ec6d4`. This phase integrates O2 through O6 and hardens session, invitation and password-recovery boundaries. Production data writes, feature activation, policies and beneficiary capabilities were outside the authorized release.

## Data model and API

| Surface | Actual implementation and authority |
| --- | --- |
| Auth, signup and confirmation | Supabase Auth owns users, sessions, MFA and password changes. `auth-screen.tsx` submits a personal signup with one initial path. `/auth/callback` exchanges PKCE codes. The Auth signup trigger captures the organization hint once and creates the intent after confirmed email. A server action on `/reset-password` validates the recovery session, confirmation and applicable MFA before updating the password. The existing referral subsystem records confirmed attribution in `private.referrals`. The app never authenticates with referral or member codes. |
| Personal onboarding and organization intent | `/onboarding` updates the existing personal profile. `/organization-onboarding` uses `/api/v1/me/organization-onboarding` and `/:id/change-path`. `organization_intent_for_api` and `organization_intent_command_for_api` bind the active Auth session and subject. |
| Details, creation, registration and claims | `/setup`, `/matches`, `/:id/details`, `/:id/complete` use the O4 setup RPCs. `/institutions/:id/registration` invokes `institution_registration_for_api`. The database writes the organization, owner and declaration in one transaction. Existing claims use the existing verification application, anchored institution snapshot, and independent review. The legacy create and claim entry points are closed at Fastify and SQL. |
| Institution membership and authority | `/institutions/:id`, invitations, representative revoke, affiliations and organization roles use the existing institution, affiliation and organization permission RPCs. The selected account is navigation context. Actual permissions derive from the user and resource. |
| Verification and Founder identity | `/verification` and `/verification/review` use current verification data and `verification_submit_for_api`, `verification_work_for_api` and the protection chain on `verification_decide_for_api`. The O3 member and admin endpoints have separate read and command RPCs, founder authority and a closed issuance gate. Bootstrap is separate from reviewed claims. |
| Corrections and governance | `/me/onboarding-corrections`, `/admin/organization-onboarding`, `/admin/governance` and governance invitations use O5 scoped RPCs. Assignment, exact consent, independent approval and claim holds are checked in SQL. High-impact execution and recovery remain closed. |
| Early Partners and feedback | `/admin/early-partners` and `/institutions/:id/early-partner` use `early_partner_read_for_api` and `early_partner_command_for_api`. The only working entitlement is synthetic feedback. Program versions, owner consent, independent operators, expiry and eligibility are rechecked. |
| Public profiles and discovery | Member and institution projections retain their existing visibility restrictions. Public profile reads use the current verification projection and separate Founder designation. Discovery and search never expose private registration, case evidence or partner records. |
| Projects and polls | Existing project permission and independent identity checks still decide submission and publication. Existing poll functions apply current electorate and eligibility, personal ballot uniqueness and ballot secrecy. |
| Legal and privacy | The Legal Center joins authorized published availability with the immutable release registry, which remains empty. L3 request, export and lifecycle commands require explicitly scoped synthetic fixtures and remain closed to real processing. |

## Permissions and audit

The executable matrix checks API and SQL gates and distinguishes ability to review from authority to approve. O7 preserves verification decisions and reviewer independence. Invitation decisions now check expiry after locking the organization and use the resulting time in the audit event. O2 pins the selected session before replay or mutation, and O5/O6 use user-before-session order. Live-session checks use the actual decision clock. [Authorization matrix](O7_AUTHORIZATION_MATRIX.md) · [Audit reconciliation](O7_AUDIT_RECONCILIATION.md)

## Privacy and lifecycle

Private drafts, evidence references, decisions and feedback remain scoped. O7 introduces no new domain stores. The lifecycle matrix distinguishes logical access expiry from physical retention, export and deletion. No approved policy duration or provider restore is inferred. [Lifecycle and audit boundaries](O7_AUDIT_RECONCILIATION.md)

## Localization and accessibility

Sign-in, signup, confirmation, recovery and MFA use the same responsive shell, separator and theme tokens. Password creation and reset use confirmation and a labeled progress indicator for length, uppercase, lowercase, number and symbol. MFA preserves the grouped code input. Committed code uses the existing coastal image. The working tree still has the user's swipeable signup choice and slideshow assets. Browser runs exercise the available presentation without promoting local-only assets. All password copy is provided in Haitian Creole, French, English and Spanish.

## Reliability and recovery

Password reset requires a live, recent Supabase recovery session and checks the rendered session ID on submit. Authenticator verification must upgrade that same session to AAL2 before server navigation. Normal sign-in cannot open reset. The clean signup journey revealed a race while starting an organization draft. The details form now disables editing during the intent write, so entering a name or handle cannot race the replacement draft. End-to-end signup checks also cover a lost response after organization creation and exact replay, without duplicate ownership or audit records. The database-first rehearsal starts at L6.2A and applies the additive sequence before serving the matching API and web. [Deployment runbook](O7_DEPLOYMENT_RUNBOOK.md)

## Validation and CI

The integration suite covers signup choice, disposable email and referrals, personal onboarding, fresh-browser draft resume, direct SQL refusal, two independent identity decisions, organization creation, registration privacy and representative invitation. Catalog checks verify five-phase RLS and service grants, invalid or revoked sessions, closed feature gates and concurrent intent decisions. Existing disposable O3–O6 suites add badge suppression, protected corrections, ownership claims, hold expiry, independent governance, partner races and unchanged project/poll eligibility. Recovery tests exercise password rules, mismatch, account isolation and both MFA and non-MFA paths. The developer checkout passed all 67 Chromium cases, including three cases from earlier uncommitted display and Founder UI work. Local API tests (48), client tests (7), both production builds, typecheck, lint, translation parity, S1 and the L5/L6 legal checks passed. The final clean staged checkout passed all 64 Chromium cases after the draft form correction. An additional 11 checks passed against the upgraded database using the prior application revision. These local results are distinct from GitHub Actions.

Simultaneous tests cover save versus cancel, draft completion versus correction, competing handle reservation, independent decisions under and after an active claim hold, and partner acceptance versus suspension. Boundary tests cover expired partner feedback, lost and changed replays, restricted accounts, revoked sessions and changed identity or organization authority. The suite does not establish deterministic two-transaction timing for identity revocation versus creation, claim review versus owner change, governance proposal versus role revocation, restrictions versus a queued protected action, or session revocation versus a queued replay.

## Documentation and operations

Migrate in order through O7 after separate production authorization. No hosted mutation was performed. This phase adds no public directory, rollout switch or feature authority. Rollback uses a compatible API and UI with the forward database guards still in place. [Release and rollback](O7_DEPLOYMENT_RUNBOOK.md)

## Remaining blockers

The executed checks found no remaining P0/P1 failure in the covered cases. The technology checks establish disposable readiness. The pre-O7 application passed 11 backward-compatibility checks against the upgraded database. A live cutover, provider backup restoration and production delivery have separate operational evidence requirements. Production email, staffing, legal/operator approvals, proof procedures, recovery custody, retention and provider-level restore remain separate requirements. Policy, launch eligibility and future organization program work require owner decisions. [Readiness matrix](O7_READINESS_MATRIX.md)
