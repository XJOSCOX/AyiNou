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

## Hosted deployment

All 97 local Chromium regressions and both immediate-signup scenarios passed. All three [release CI jobs](https://github.com/XJOSCOX/AyiNou/actions/runs/45069225103) passed on `1a805c2aada77abf007074d6d8ee00ae79700cdc`. The owner authorized the exact `20261122170000_fv_one_step_member_acceptance.sql` file for `hcbxulyfmdmuyccgrujs`. The verified SHA-256 was `10a89d3ff4529f48272b4dace155013b6aba8e1439aedce373b9939ec1bd590c`.

Postflight showed 86 applied migrations, zero pending and zero hosted-only. The standing approval, both gates, policy rows, original cohort, cases, audit counts and both gold grants matched the baseline. Hosted PostgREST denied an invalid session and direct anonymous execution. The matching local API denied the signed-out action with a private HTTP 401. A separate cloud app deployment was outside this rollout.
## Remaining blockers

Hosted development is verified. The positive one-step gold path was exercised with disposable accounts. No existing hosted case was modified during validation.
