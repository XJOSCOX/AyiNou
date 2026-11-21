# O1 implementation roadmap

O1 documents the baseline and proposed design. Each later phase requires separate authorization. Use additive migrations and narrow release switches where a new command changes effective authority.

| Phase | Delivery and dependency | Exit evidence |
| --- | --- | --- |
| O2 ([implemented](O2_IMPLEMENTATION_REPORT.md)) | Shared personal signup with optional organization intent, authenticated resume and safe self-correction for intent-only records. Agree on pilot eligibility architecture first. Establish API/SQL guards for intent writes and isolated translation namespace. | Both entry paths share the same Auth flow; account switches, referral attribution, four profile stages, preference recovery and all four languages verified. |
| O3 ([synthetic implementation](O3_IMPLEMENTATION_REPORT.md)) | Private cases, explicit founder authority, consent, proof receipts, holds, revocation and pending corrections. Real issuance and independent appeal assignment await operational approval. | Distinct provenance, current MFA, conflict and self-target denials, idempotency, hold/revocation, no high-trust downstream expansion. |
| O4 ([implemented](O4_IMPLEMENTATION_REPORT.md)) | Reuse institutions, O2 intents and independent claim review. Reviewed personal identity, current authority declaration and versioned completion are required. Founder parity and government setup await separate approval. | Legacy registration defaults to unknown. Legacy create and claim writes fail closed. Scoped claim, privacy and concurrency checks run in disposable Supabase. |
| O5 | Expand corrections and formal bootstrap/distributed governance after protected dependencies are modeled. Emergency restrictions, recovery record, succession and approval receipts. | Concurrent dependency changes, last eligible admin protection, independent decision and recovery rehearsal. |
| O6 | Early Partner enrollment after operational and policy approval. Limit initial features and evidence scope. | Consent/version, expiry, offboarding, scoped invitations, four-language visibility and trust separation. |
| O7 | End-to-end integration and operational readiness for separately authorized rollout. | Disposable accessibility and Chromium and RLS tests, review access audits, published-policy and privacy regression, rollout/rollback rehearsal. |

For O4, enumerate callers of institution write, read, directory, follow, representative and logo RPCs before migration. Deploy compatible server responses and gated write handlers, then expose the wizard. Keep read-only access to old intents and verified provenance if a rollout is paused. Rollback should disable new actions before restoring a compatible prior application version; never erase case history or silently restore an old ungated create path. Treat grants, partner participation and retained drafts as separate records with approved retention and safe deletion handling.

Read the [architecture](O1_ONBOARDING_ARCHITECTURE.md), [capability matrix](O1_CAPABILITY_MATRIX.md), [threat tests](O1_SECURITY_THREAT_MODEL.md) and [owner approvals](O1_OWNER_DECISION_BRIEF.md) before promotion.


## O5 administrative corrections and governance

O5 implements correction and governance foundations in code. O2 through O5 hosted deployment requires separate approval, and O6 requires its own program decisions. See [O5 implementation](O5_IMPLEMENTATION_REPORT.md).


## O6 Early Partners

O6 implements and tests the pilot with disposable fixtures. Real enrollment, public visibility and an effective terms release remain owner decisions. O7 depends on separate organization program authorization and data governance. See [O6 implementation](O6_IMPLEMENTATION_REPORT.md).

## O7 integration and security hardening

The O7 review covers organization signup, scoped representation, independent review, recovery and audit receipt replay. Hosted migration approval and operational enrollment decisions remain open. [Integration report](O7_INTEGRATION_REPORT.md)
