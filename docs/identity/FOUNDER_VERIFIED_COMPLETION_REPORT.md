# Founder Verified completion and integration report

## Scope

Finish the session-bound workflow in the existing Founder and Verification screens. A1A closed first. Live issuance remains disabled. [Gap matrix](FOUNDER_VERIFIED_COMPLETION_AUDIT.md)

## Data model and API

The additive migration `20261121146000_founder_verified_live_workflow.sql` adds a restricted versioned member-control receipt, structured Founder attestation and S2C-aware service RPC. The existing HTTP paths carry the workspace reference in a header and use the existing case, event, proof and grant ledgers. No badge system or general audit table is duplicated. [Application resolution](FOUNDER_VERIFIED_APPLICATION_RESOLUTION.md)

## Permissions and audit

The recognized Founder may open a request via trusted bootstrap provenance. Staff commands recheck the exact private workspace and recent MFA. A member proves control in the accepted case using a fresh registered authenticator. The attestation chooses an identity-check method and confirms conflict status. Grant/release require live proof of that revision and reuse the existing O3 command and audit transaction. Existing Ordinary Administrator issuance stays prohibited. [Eligibility matrix](FOUNDER_VERIFIED_IDENTITY_ELIGIBILITY.md)

## Privacy and lifecycle

Proof receipts are private and RLS-enabled. Never upload identity documents into Ayinou for this flow. Proof records store method codes and private confirmation scope. The two paths retain independent provenance. Public output applies disclosure and existing profile, discussion, directory or representative visibility first. A1A exposes no underlying case evidence, proof data or provider sessions. An independently approved retention and appeal policy is still needed before live issuance.

## Localization and accessibility

The in-app authenticator prompt, structured confirmation checks, proof status and action labels are available in Haitian Creole, French, English and Spanish. Existing validation and badge accessibility labels remain in place.

## Reliability and recovery

Versioned, idempotent confirmation and attestation receipts safe against duplicate delivery use the native event request key. A changed case, invalid proof, expired/revoked session or conflict fails closed. A lost or expired control receipt can be renewed. Protected project, poll, organization claim and leadership permissions remain on their existing predicates.

## Validation and CI

Disposable tests cover the closed gates, trusted Founder scope, fresh member control, attestation, replay, disclosure and atomic application resolution. Existing synthetic cases continue to cover independent reviewer races, stale/declined consent, and holds. Record exact release CI and completed full regressions before requesting any hosted schema application.

## Documentation and operations

The hosted baseline is 81 applied migrations after the separately approved A1A rollout. A fresh dry run and approval are required for this Founder migration. The migration retains hard-closed issuance and live-proof gates. A future separately reviewed activation must name the approved method, conflict and corrective procedures, minimal evidence retention, and authorized operators. Approve the identity matching SOP before using the live in-person or live-video confirmation codes.

## Remaining blockers

Live issuance is closed pending approved identity and account-matching procedure, retention, independent appeal/review handling and separate operational authorization. Higher-trust product eligibility remains independent. Where ordinary gold parity is adopted later, use named scope-specific checks rather than substituting the shared existing project or O4 gates.
