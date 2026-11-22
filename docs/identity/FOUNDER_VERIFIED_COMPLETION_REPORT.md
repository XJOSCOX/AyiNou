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

Disposable tests cover the closed gates, trusted Founder scope, fresh member control, attestation, replay, disclosure and atomic application resolution. Existing synthetic cases continue to cover independent reviewer races, stale/declined consent, and holds. Release `0cc447b4ce5087aebd8972c1f1025b616fea1923` passed 97 local Chromium regressions, two immediate-signup checks, and all three [GitHub Actions jobs](https://github.com/XJOSCOX/AyiNou/actions/runs/45049454230). The six Founder scenarios passed again after hosted staging on isolated disposable Supabase, including valid grants, version-bound closure, preserved declines and review history, and no independently reviewed claim fabricated by gold issuance.

## Documentation and operations

The owner approved only `20261121146000_founder_verified_live_workflow.sql` for development project `hcbxulyfmdmuyccgrujs`. The saved preflight matched the release, its three green CI jobs, Git blob `300b13cfad803876b76e65098d2a851dd37b9324`, file SHA-256 `8a80908f943114307410e4ba1126103282adec95a559bd564d59bae16f676fb3` and one exact pending migration. Hosted history advanced from 81 to **82 matching applied migrations, zero pending and zero remote-only** after applying that file without seeds, role changes or a reset.

Read-only hosted postflight matched counts and fingerprints across 15 account, profile, verification, evidence, Founder and audit tables. It verified RLS, service-only RPC execution, private proof helpers, the trusted Founder projection, the original-session S2C checks, MFA and subject binding, and the active supersession trigger. The live-proof and issuance gates both remained closed, the hosted proof ledger and grant store remained empty, and the public gold projection returned false for both existing accounts. Hosted PostgREST denied anonymous execution and an invalid workspace session. The matching local web and Fastify responded successfully, and anonymous Founder API access returned a private 401. No cloud application deployment occurred. A future separately reviewed activation must name the approved method, conflict and corrective procedures, minimal evidence retention, and authorized operators. Approve the identity matching SOP before using the live in-person or live-video confirmation codes.

## Remaining blockers

Live issuance is closed pending approved identity and account-matching procedure, retention, independent appeal/review handling and separate operational authorization. Higher-trust product eligibility remains independent. Where ordinary gold parity is adopted later, use named scope-specific checks rather than substituting the shared existing project or O4 gates.
