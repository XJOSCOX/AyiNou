# Founder Verified one-step acceptance

## Scope

An eligible member can accept the offer and confirm control of the signed-in account in one action. Optional badge disclosure and consent to supersede a pending regular application remain separate choices. A member who already accepted needs only one confirmation action, including when an earlier receipt expires.

## Data model and API

The existing member action endpoint issues the existing two-minute challenge before exchanging it for the combined action. PostgreSQL consumes the challenge under its original member, session, case revision and active policy, then uses the native consent command and records the existing account-control receipt in the same transaction. Consent rejection, stale application choice, or proof failure rolls the whole transaction back.

## Permissions and audit

Consent and account control retain separate, linked events. S2A, S2B and S2C remain in effect. The Founder still uses recent MFA and personally confirms identity. The existing gold grant, exact application closure, holds and independent appeals are unchanged.

## Privacy and lifecycle

The challenge stays out of URLs and audit records. Existing retention and disclosure controls apply. The optional application choice is bound to the displayed revision, so a refreshed application does not silently inherit an older opt-in.

## Localization and accessibility

The member can review all choices before one clearly labelled action. The four supported languages reuse the existing responsive form controls and error feedback.

## Reliability and recovery

Challenge consumption, consent, case revision and proof commit together. The application refreshes the case after connection loss. If issuance is unavailable, a member may still accept the offer and subsequently confirm when it becomes eligible.

## Validation and CI

Six focused disposable Chromium scenarios passed, including one-click acceptance, direct confirmation of previously accepted cases, invalid requests, stale application rollback, linked audit events, no-authenticator issuance, and closure of the exact opted-in pending application. Typecheck, lint, both builds, four-language parity, 51 API tests and engineering standards passed.

## Documentation and operations

See the [operating procedure](FOUNDER_VERIFIED_OPERATING_PROCEDURE.md). The existing standing issuance policy remains active or stopped as previously authorized.

## Remaining blockers

Hosted deployment requires authorization for the exact additive migration after the full validation and CI checks.
