# Founder Verified recipient account confirmation

## Scope

Ordinary members can accept and confirm account control without enrolling an authenticator. The broader privileged-role MFA policy is outside this release. The Founder continues to personally identify the member in person or by interactive live video.

## Data model and API

The existing member action endpoint accepts a challenge request and a separate explicit confirmation. The API identifies both the member and session from verified Auth claims. PostgreSQL binds a hashed random challenge to that exact member, session, case revision and existing development policy. The challenge expires after two minutes. A newer request replaces the row for that case. Consumption deletes the challenge and commits the receipt, case version and audit event atomically.

## Permissions and audit

The service-only RPC rechecks the active member session, consent and policy cohort before issuing or consuming a challenge. The Founder still needs trusted authority, an original S2C workspace, recent TOTP and a current privileged session. Founder grant and optional blue application supersession still use their existing transaction. Legacy authenticator-backed receipts keep their original checks.

## Privacy and lifecycle

Raw challenges are returned once to the authenticated requester and kept in the current page's memory. They do not appear in URLs, audit events or case projections. A spent challenge is removed. Expired unused hashes are inert and replaced on a new attempt. Existing receipt lifecycle and legal holds apply.

Email OTP is deferred as an optional additional channel until reliable delivery and actual mailbox verification are established. Development auto-confirmation only sets the account record and cannot establish access to a mailbox. An optional email confirmation would have to bind a fresh successfully delivered challenge to the same case and session. No email, SMS or paid provider is needed for this flow. [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration) and [SMTP delivery](https://supabase.com/docs/guides/auth/auth-smtp).

## Localization and accessibility

The existing Verification panel presents the explicit declaration and native keyboard-accessible confirmation controls in Haitian Creole, French, English and Spanish. Authenticator enrollment remains available through account settings.

## Reliability and recovery

The challenge becomes invalid on expiry, case revision changes, loss of session or policy eligibility, or consumption. A delivered duplicate cannot make another receipt. After an interrupted confirmation the UI refreshes the case and supports a new attempt when needed. The ten-minute receipt still requires the member's original session to remain active through Founder attestation and grant.

## Validation and CI

Six disposable Chromium scenarios passed, including gold issuance and opted-in application closure for an account with no authenticator, optional enrolled MFA, copied and replayed challenges, expired or revoked sessions, independent review and controlled O4 eligibility. Typecheck, lint, client and API checks, four-language validation and both production builds passed. All three GitHub jobs and the exact hosted dry run are required before schema approval.

## Documentation and operations

Use the [operating procedure](FOUNDER_VERIFIED_OPERATING_PROCEDURE.md) and [activation policy](FOUNDER_VERIFIED_ACTIVATION_POLICY.md). Preserve the existing approval, gates and exact cohort during deployment. Coordinate the matching API and web with the database change.

## Remaining blockers

Hosted migration deployment requires exact separate owner authorization. The current development cohort is not expanded by this release.
