# Session Security implementation plan

F1/F1.1 was followed by S2A absolute lifetimes and promotion handling. See the [S2A implementation](S2A_IMPLEMENTATION_REPORT.md) and [deployment evidence](S2A_DEPLOYMENT_AND_TEST_RESULTS.md). S2B implements session inventory and private user-bound links for the two reviewed flows. See the [S2B implementation and rollout evidence](S2B_IMPLEMENTATION_REPORT.md). Identity and audit integration remain later work. Hosted Auth settings and restricted feature gates have their own operational approvals.

## Inspect provider and application boundaries

1. Verify the deployed Supabase plan, Auth settings, stable session identifier and server-owned original sign-in time. Measure refresh rotation, revocation, concurrent refresh and cookie behavior. Establish which API can authoritatively list and revoke sessions before exposing those controls.
2. Trace session creation, cookie writes and refresh in Next.js. Trace JWT verification, active roles and live account checks in Fastify and PostgreSQL. Inventory reads and mutations that require enforcement, including direct accessible database RPCs.
3. Compare provider-wide session rules with the per-role policy. If needed, propose a durable server policy keyed to the verified provider session. Define clock source, failure behavior, concurrent refresh, legacy sessions, role change, cleanup and compatible deployment. A browser timer or cookie deletion alone cannot enforce expiry.

## Absolute session policy

| Effective authority and preference | Absolute maximum | Browser authentication |
| --- | --- | --- |
| Recognized Founder, either preference | Six hours | The preference cannot extend the limit. |
| Active Administrator, either preference | Six hours | The preference cannot extend the limit. |
| Ordinary member, Remember This Device checked | 30 days | Persistent within the server deadline. |
| Ordinary member, Remember This Device unchecked (default) | 12 hours | Nonpersistent, with best-effort browser-close behavior. |

Derive the Founder from trusted bootstrap provenance even if the account has no Administrator row. Enforce the original authenticated session start and deadline in Next.js, Fastify and PostgreSQL as applicable, including protected data paths. Refresh-token rotation cannot move the deadline. Browser close, cookie restoration and concurrent devices do not replace server checks. Expiry requires reauthentication and applicable MFA.

Revoke or constrain ordinary sessions before allowing promoted Administrator access. No existing 30-day deadline can carry into a privileged session. Role revocation removes Administrator authority immediately, including on other devices. Preserve 15-minute TOTP freshness on applicable privileged commands and action-specific step-up.

F1.1 lets the Founder authorize a new appointment directly and preserves independent approval for legacy appointments. Both require the named member’s own account, explicit acceptance, fresh MFA and a one-time credential. S2A invalidates earlier sessions after either activation path. [Administrator activation](../blueprints/ADMINISTRATOR_ACTIVATION.md)

## Private workflow references

Use `/s/{flowId}/{step}` with cryptographically random, opaque IDs and allowed steps defined by each workflow. Store owner, allowed participants and scopes, workflow kind and state, permitted steps, expiry and revocation, and when required a protected reference to the initiating session. Every operation reloads and authorizes against live account, resource and applicable MFA state. Enforce state transitions atomically. Support cross-device resume for account-owned drafts. Highly sensitive flows may require the original session. Use nondisclosing errors and safe reentry. Omit tokens, OTPs, passwords, raw session identifiers and all authentication secrets from URLs and logs. Plan explicit per-flow migration and compatibility before replacing any existing entry point.

## Account Settings

Expose the current session, other active sessions, creation and reliable last-active times, effective expiration and scoped revocation, including sign-out of all other sessions. Add localized security notices for significant changes. When the provider lacks an authoritative time or operation, defer the corresponding control and record that gap. Reconfirm current session, authorization and applicable step-up on sensitive actions.

## Evidence and release gates

Apply the [audit event policy](../standards/AUDIT_EVENT_POLICY.md) to login, remembered sessions, revocation, privileged expiry, permission changes, workflow creation and completion, step-up and minimized suspicious access telemetry. Capture only the fields and timestamps needed for diagnosis and evidence. Define access, retention and lifecycle before rollout.

| Coverage | Automated acceptance evidence |
| --- | --- |
| Founder expiry | Independently enforce six hours with either preference. Use trusted Founder provenance without an Administrator row and prove the effective-privilege check. |
| Administrator expiry | Independently enforce six hours with either preference. Verify normal role assignment separately from Founder provenance. |
| Ordinary remembered expiry | Reopen within the 30-day maximum and deny at the deadline. |
| Ordinary unremembered expiry | Default unchecked, use nonpersistent browser authentication and deny at 12 hours even if the browser restores credentials. |
| Refresh-token rotation | Rotate tokens before expiry and under concurrent refresh. Verify the original start and deadline stay fixed for each policy. |
| Promotion and role revocation | Constrain or revoke remembered sessions before privilege starts. Immediately deny administrative operations after revocation across devices. |
| Multiple devices and cross-account isolation | Keep each device session scoped to its own account and deadline. Exercise concurrent sessions, logout, targeted revocation and stale or switched account state. |
| Current MFA | Require current assurance and a TOTP proof within 15 minutes on applicable privileged commands, independently of remaining session lifetime. |
| Server, API and database | Verify Next.js, Fastify and applicable PostgreSQL/RPC/Storage boundaries agree just before and at each expiry, after revocation and after role changes. |
| Existing F1 workflows | Regress proof and one-time Founder setup, supported appointment modes, named member redemption, reuse and the Administrator session transition. Prove a first direct appointment works with a sole Founder and existing independent approval safeguards still apply to legacy proposals and unrelated governance. |
| Private workflows | Cross-account copied link and account switching fail safely. Original-session-only flows reject another session. Ordinary drafts resume across authorized devices. Expired, revoked or completed flows cannot be replayed. |
| Production readiness | Verify effective provider settings and a compatible database/application rollout in disposable infrastructure. Document recovery and staff observability. Obtain separate authorization before enabling production policy. |

Use controlled test clocks and disposable Supabase Auth sessions and fixtures for the cases above. Do not run expiry, promotion or revocation probes on hosted development as part of S2 tests.

Open work includes provider capabilities for inventory, recovery, staffing for workflows that retain independent approvals, and which workflows first adopt private routing. S2A uses unchecked deadlines for legacy sessions with a trusted start. The approved session deadlines remain fixed. [Blueprint decisions](../blueprints/OWNER_DECISIONS_AND_OPEN_QUESTIONS.md)