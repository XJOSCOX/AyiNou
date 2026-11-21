# Session Security implementation plan

This milestone records approved requirements for future implementation. Existing authentication behavior and routes keep their present session policy during O7.

## Inspect provider and application boundaries

1. Verify the deployed Supabase plan, Auth settings, stable session identifier and server-owned original sign-in time. Measure refresh rotation, revocation, concurrent refresh and cookie behavior. Establish which API can authoritatively list and revoke sessions before exposing those controls.
2. Trace session creation, cookie writes and refresh in Next.js. Trace JWT verification, active roles and live account checks in Fastify and PostgreSQL. Inventory reads and mutations that require enforcement, including direct accessible database RPCs.
3. Compare provider-wide session rules with the per-role policy. If needed, propose a durable server policy keyed to the verified provider session. Define clock source, failure behavior, concurrent refresh, legacy sessions, role change, cleanup and compatible deployment. A browser timer or cookie deletion alone cannot enforce expiry.

## Absolute session policy

Add a localized “Remember this device” login checkbox, initially unchecked. An opted-in ordinary member can persist authentication for at most 30 days from original login. Use nonpersistent browser credentials for unchecked sessions and decide their finite server-side maximum with the owner before implementation. Browser restoration and close semantics vary. The server always checks its own deadline.

For any active Platform Administrator or Super Administrator assignment, enforce six hours from original login regardless of cookie preference. Revocation or constraint of pre-promotion sessions must precede privileged access. Role revocation removes authority immediately. Refresh, concurrent device use, current browser context and client role labels do not change deadlines or privileges. Expiry requires reauthentication and applicable MFA. Keep 15-minute privileged TOTP freshness and step-up checks for sensitive actions.

## Private workflow references

Use `/s/{flowId}/{step}` with cryptographically random, opaque IDs and allowed steps defined by each workflow. Store owner, allowed participants and scopes, workflow kind and state, permitted steps, expiry and revocation, and when required a protected reference to the initiating session. Every operation reloads and authorizes against live account, resource and applicable MFA state. Enforce state transitions atomically. Support cross-device resume for account-owned drafts. Highly sensitive flows may require the original session. Use nondisclosing errors and safe reentry. Omit tokens, OTPs, passwords, raw session identifiers and all authentication secrets from URLs and logs. Plan explicit per-flow migration and compatibility before replacing any existing entry point.

## Account Settings

Expose the current session, other active sessions, creation and reliable last-active times, effective expiration and scoped revocation, including sign-out of all other sessions. Add localized security notices for significant changes. When the provider lacks an authoritative time or operation, defer the corresponding control and record that gap. Reconfirm current session, authorization and applicable step-up on sensitive actions.

## Evidence and release gates

Apply the [audit event policy](../standards/AUDIT_EVENT_POLICY.md) to login, remembered sessions, revocation, privileged expiry, permission changes, workflow creation and completion, step-up and minimized suspicious access telemetry. Capture only the fields and timestamps needed for diagnosis and evidence. Define access, retention and lifecycle before rollout.

| Coverage | Automated acceptance evidence |
| --- | --- |
| Ordinary accounts | Opt-in persists through reopening within the 30-day maximum. Unchecked stays nonpersistent with the documented server limit. Both expire at their own absolute deadline. |
| Privileged accounts | Six-hour expiry for both cookie preferences. Refresh leaves the original deadline unchanged. Promotion constrains older sessions and role removal ends privilege immediately. Step-up and 15-minute TOTP freshness still apply. |
| Session lifecycle | Two concurrent devices, refresh rotation, logout and targeted and other-session revocation. Confirm Next.js, API and database agree when the session is expired or revoked. |
| Private workflows | Cross-account copied link and account switching fail safely. Original-session-only flows reject another session. Ordinary drafts resume across authorized devices. Expired, revoked or completed flows cannot be replayed. |
| Production readiness | Verify effective provider settings and a compatible database/application rollout in disposable infrastructure. Document recovery and staff observability. Obtain separate authorization before enabling production policy. |

Open decisions include the ordinary nonremembered server lifetime, provider capabilities, legacy-session migration and the first workflows chosen for routing.