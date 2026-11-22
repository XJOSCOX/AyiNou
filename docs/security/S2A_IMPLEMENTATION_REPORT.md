# S2A implementation report

## Scope

S2A adds absolute authenticated-session lifetimes and promotion handling to the F1/F1.1 baseline `71231a4d4fe46e3c9a96917d6abf2f3d7876676c`.

## Data model and API

Migration `20261121142000_s2a_session_policy.sql` adds private session policy, promotion cutoff and audit tables. Supabase Auth owns the session ID and original start. Existing protected RPCs and Fastify use the shared live session predicate. Next.js checks it before rendering protected routes.

## Permissions and audit

A live verified account and the exact session are required. Effective Founder authority uses trusted provenance. Administrators and the Founder have a six-hour ceiling. The F1 activation transaction writes a cutoff for all earlier sessions. Existing MFA and 15-minute TOTP boundaries still apply. See the [audit matrix](../standards/AUDIT_COVERAGE_MATRIX.md).

## Privacy and lifecycle

Policy rows are tied to provider sessions and cascade when the provider deletes them. The promotion cutoff belongs to the account. Audit rows use random policy references and minimal account metadata. Account removal clears the audit subject reference. Security event retention policy and any audit export projection remain operational decisions. The migration has no access to OTPs, passwords, or access or refresh tokens.

## Localization and accessibility

Sign-in includes an unchecked Remember This Device checkbox and a localized session-ended notice. New messages cover Haitian Creole, French, English and Spanish. The form uses a native keyboard-accessible checkbox and the current theme.

## Reliability and recovery

Expired sessions are denied on each protected boundary. The browser clears stale cookies and returns to sign-in when the server establishes that the session is inactive. Stored browser preferences are scoped to the matching session. Rollout should apply the migration before serving the matching app revision to remembered sign-ins. Use forward correction and preserve the audit trail if a rollback is needed.

## Validation and CI

See [deployment and test results](S2A_DEPLOYMENT_AND_TEST_RESULTS.md).

## Documentation and operations

See the [enforcement rules](S2A_SESSION_POLICY_ENFORCEMENT.md) and the [development deployment procedure](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md).

## Remaining blockers

The hosted S2A rollout and matching local application verification passed. S2B owns session inventory, per-device revocation controls and the common private workflow router. Public launch and restricted workflows retain their existing authorization gates.
