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

Six focused disposable Chromium scenarios and all 97 full Chromium regressions passed, plus two immediate-signup tests. The new flow issued gold and closed the exact opted-in application for a member with no authenticator. Tests also covered optional enrolled MFA, copied and replayed challenges, expired or revoked sessions, independent review and controlled O4 eligibility. Typecheck, lint, client and API checks, four-language validation and both production builds passed. All three [release CI jobs](https://github.com/XJOSCOX/AyiNou/actions/runs/45063406618) passed at commit `f58ccba1d6f84350223c259e5b34eea681a986ec`.

## Documentation and operations

Use the [operating procedure](FOUNDER_VERIFIED_OPERATING_PROCEDURE.md) and [activation policy](FOUNDER_VERIFIED_ACTIVATION_POLICY.md). Preserve the existing approval, gates and exact cohort during deployment. Coordinate the matching API and web with the database change.

## Hosted development postflight

The separately approved file `20261122150000_fv_member_account_confirmation.sql` was applied to hosted development project `hcbxulyfmdmuyccgrujs`. SHA-256 `2d79a4673dae51de21b53c72e736c6dccb23e6aad79ce4288614c7d3531b61e9` matched the tested Git release. The postflight showed 84 applied migrations, zero pending and zero hosted-only. There were no seed or role changes.

The existing policy approval, expiry, gates, one-member cohort, case and audit counts, gold grant and pending regular application matched the immediate preflight. The hosted challenge table has RLS and no direct application grants. The new RPC is service-only and rejected an invalid session. Anonymous execution was denied. No new challenge, grant or test account was created on hosted development. The matching local web and API responded successfully. The positive no-authenticator grant was exercised in disposable Supabase. No separate cloud application was deployed.

## Remaining blockers

Hosted schema deployment is verified. A positive hosted workflow for a different member would require a separately approved cohort change.
