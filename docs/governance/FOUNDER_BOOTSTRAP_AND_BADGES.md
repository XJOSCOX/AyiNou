# Reserved Founder enrollment and badge design

Founder authority comes from the sole committed installation bootstrap and its matching platform audit event. A clean database starts without a Founder. Ordinary signup never writes the bootstrap record. Once consumed, the reservation remains bound to that account and configuration changes cannot transfer it. The migration recognizes existing trusted provenance and reserves its current handle where available. This does not alter historic administrator or verification records.

## Preparing a fresh installation

Use a private operator environment with the exact Supabase URL and its server-side credential. Set `AYINOU_FOUNDER_BOOTSTRAP_ENABLED=true`, `AYINOU_FOUNDER_EMAIL` and `AYINOU_FOUNDER_USERNAME`. Review the intended project before using the command. Run `node scripts/prepare-founder-registration.mjs <new-private-file>` with an output path in an operator-only directory outside the repository. The command generates a 32-byte random credential, stores it in the private file and sends only its SHA-256 digest to Supabase. Deliver the credential privately to the authorized account owner. The command only runs explicitly. Application startup does not perform enrollment.

The matching person signs in with confirmed email, enrolls an authenticator, and completes a fresh MFA challenge. Under **Account settings → Security**, the eligible account can enter the private credential. It expires after 30 minutes. Five incorrect credentials exhaust that issuance. The operator can issue a replacement after expiry or exhaustion for the same reservation. A different identity or a handle owned by another person requires an approved resolution. The service logs neither credential nor digest. After success, clear the operator’s file and disable the server enrollment setting.

Existing deployments with consumed bootstrap need separate approval to apply the recognition and reservation migrations. They do not run this fresh-install procedure. Rotation of the configured email or username has no effect on the recognized Founder. Founder transfer and recovery require independent decisions, target acceptance, current MFA, session invalidation and preserved provenance. Execution stays closed.

## Data, security and audit

The private registration singleton stores the exact normalized eligibility identity, reserved username, digest, expiration and attempt count. The database verifies confirmed email, current account and session, current MFA, unconsumed state and the reserved handle before atomic consumption. It clears the email and digest after success. Protected triggers enforce the name for profile creation and updates, including alternate API paths. The restriction persists when the Founder changes their current profile handle. Profile responses contain neither the reserved email nor the credential or its digest.

The existing first-account bootstrap event records the authenticated actor and the identity source. Rejected attempts by the eligible bound account create bounded private security events. Reports and exports should follow the existing audit and retention policies. Operational Founder badges retain the normal account and MFA checks. The identity-proof protocol and neutral adjudication required for Founder Verified are separate.

## Role and verification presentation

| Designation | Appearance and source |
| --- | --- |
| Founder | Red Founder icon and label from trusted, current leadership provenance |
| Administrator | Green Administrator check and label from the active platform assignment |
| Independently Identity Verified | Blue verification check from the existing independent review decisions |
| Founder Verified | Gold outlined verification check from the active, consented Founder grant |

A role mark can appear alongside an identity mark. Public projections respect profile visibility and the member’s Founder Verified disclosure. Blue takes identity precedence when both records exist. Gold provenance remains available in verification details where eligible. Role demotion removes the role mark. Holding or revoking Founder Verified removes gold while independent verification and unrelated roles follow their own records. Institutions retain their existing verification presentation.

A Founder with separate ordinary review eligibility has one vote. Administrators can receive Founder Verified through the normal proof, consent and conflict rules. Explicit supersession preserves the pending application’s history and does not grant independent-only benefits. See the [Founder capability matrix](FOUNDER_CAPABILITY_MATRIX.md) and [verification implementation report](../organizations/FOUNDER_REVIEWER_AND_SUPERSESSION_REPORT.md).
