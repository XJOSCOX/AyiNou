# Founder reviewer and supersession implementation

Baseline before the hosted closure rollout was `444f5c9095862d34b9fde2848935f37095c5e44c`. This update builds on `b23385ee9a58513e91b786295116e374d301722d`.

## Scope

Implement application-specific, informed supersession on top of the existing Founder and independent review workflows. Members may accept Founder verification while keeping regular review open or confirm supersession after a valid grant. The formal Founder role uses the committed bootstrap and gains routine access and a leadership mark while eligible. Revocation preserves the closed history and leaves members eligible to use the existing application form under current review rules.

## Data model and API

Migration `20261121090000` adds a regular application revision and the private `founder_supersession_events` ledger, alongside the existing Founder and regular application records. Review decisions and status changes advance revisions. The existing member Founder action accepts an optional strict application-and-revision pair on initial consent. The dedicated service-only RPC records the opt-in after the original consent command, in the same transaction. The authenticated subject can also use a dedicated post-grant confirmation action. Migration `20261121100000` integrates formal Founder authority with existing administration and adds the late consent command. Scoped Founder reads show the relevant application, consent and decision. The regular queue adds only publicly disclosed Founder status and structured closure provenance.

## Permissions and audit

The existing ordinary review assignment remains authoritative. The SQL rechecks active account and TOTP eligibility, a current work assignment, conflicts, a distinct second reviewer and separation from the applicant. Formal recognition requires the singleton bootstrap record and its matching audit event. Ordinary platform administration cannot assign or remove it. Formal Founder provenance and scoped O3 authority are both required to issue. The Founder role grants no ordinary reviewer permission. The live O3 case command retains its current administrator, MFA, case version, member consent, proof, authorization and conflict checks. O3 events retain actor, case, version, request and grant, hold or revocation details. The joined ledger records member opt-in, successful grant initiation and commit, observed application status and revision, and why it closed or stayed in regular review. Failed command transactions write no successful grant or closure event.

## Privacy and lifecycle

New records are private and RLS-protected, with no direct grants to application roles. Audit entries carry IDs, scoped states and reason codes. They carry no proof content, evidence URLs or secrets. Evidence access, pending appeals and holds use their existing controls. When permitted lifecycle cleanup removes an application, the ledger can retain the event metadata without its application foreign key. Retention and approved disclosure policy for real Founder proof remain pending.

## Localization and accessibility

Haitian Creole, French, English and Spanish explain the designation differences and preserve the explicit, initially unchecked choice in the existing confirmation step. Member history and the reviewer panels use existing responsive components, input labels and keyboard controls.

## Reliability and recovery

Grant/release acquires the existing shared review, hold and platform restriction lock before taking the Founder case lock. Member supersession consent takes the same order. The post-grant action validates the member, current Founder case and grant, current issuer eligibility and scope, case version and review revision under those locks. Closure takes the application row lock and rechecks the revision, status and holds. The original founder event serves as the idempotency receipt. Retries that change or strip the opted-in application are rejected. Earlier closed records are preserved. No bulk reconciliation or retroactive consent is performed. An application already decided or removed through existing lifecycle paths is preserved or reported as stale. There is no new regular cancellation or reopening operation.

## Validation and CI

The disposable Founder suite covers ordinary review without Founder scope, Founder scope without ordinary review, one Founder vote, self-review denial, both consent choices, stale application, conflicting retries, retained reviewer decisions, completed and competing regular decisions, missing and expired proof, holds, revocation, MFA and project and poll gates. The final staged source passed typecheck, lint, 48 API tests, seven client tests, four-language parity, shared-contract checks, S1 validation, Legal Center and frozen source checks, both production builds, and all 68 Chromium tests. The disposable runner removed its test database after the suite.

## Documentation and operations

The hosted development database has the earlier closure migration `20261121080000`, with zero Founder grants and issuance disabled at postflight. The consent and role migrations require separate hosted approval. Read-only preflight found a single trusted bootstrap receipt, zero Founder grants, zero O5 governance grants, and the closed issuance and O4 parity gates. Review pending versions, consent audit grants and zero real Founder issuance before any hosted rollout. Keep the opt-in requirement and historical ledger through any forward correction.

## Remaining blockers

Approved proof and account-control ceremony, evidence retention and independently assigned Founder appeal remain open. Real Founder issuance and O4 Founder parity stay closed. Founder succession and ordinary support or program role activation remain governed work.
