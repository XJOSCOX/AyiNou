# FV-FINAL implementation report

## Scope

Finish the existing Founder Verified development workflow using the recognized Founder and the member's Verification workspace. Preserve ordinary independent verification and A1A read boundaries.

## Data model and API

The additive migration restricts approval windows, exact development cohorts and appeal assignments. Proof receipts reference the approval scope. The existing grant transaction handles exact opted-in blue application closure. The two versioned Founder appeal endpoints list and decide only a reviewer's assigned cases. The O4 commands accept gold for the explicitly supported new nongovernment kinds.

## Permissions and audit

Founder attestation and grant require trusted provenance, S2 session and workspace guards, recent TOTP, conflict clearance and current case version. Appeal close-out uses an independently assigned reviewer. Decisions and original corrections retain source case and receipt references. Existing request fingerprinting and locks protect exact replay. Policy approval and stop references are recorded with the restricted policy state.

## Privacy and lifecycle

The system keeps structured method and decision metadata. Sensitive evidence remains in its existing restricted workflow. The A1A general projection remains unchanged. Restricted appeal state exposes only subject handle to the assigned reviewer. See the activation policy for proposed retention, hold handling and disposition approval.

## Localization and accessibility

Haitian Creole, French, English and Spanish use the existing verification catalog and workspaces. Existing semantic form labels, controls and theme tokens are reused for the member history and appeal queue.

## Reliability and recovery

A hold suppresses gold pending independent review. An upheld hold requires an authorized release. Revocation leaves application and decision history intact. Stop or expiry disables the narrow development scope and its gold eligibility.

## Validation and CI

See [deployment and test evidence](FOUNDER_VERIFIED_DEPLOYMENT_AND_TEST_EVIDENCE.md).

## Documentation and operations

See the [operating procedure](FOUNDER_VERIFIED_OPERATING_PROCEDURE.md), [activation policy](FOUNDER_VERIFIED_ACTIVATION_POLICY.md) and [eligibility matrix](FOUNDER_VERIFIED_FINAL_ELIGIBILITY_MATRIX.md).

## Remaining blockers

The reviewed hosted schema deployment is verified. Operational activation still requires a separate approval identifying the approved cohort, independent appeal staffing, duration and records lifecycle. Both live gates remain closed.
