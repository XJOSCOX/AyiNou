# O1 implementation roadmap

O1 documents the baseline and proposed design. Each later phase requires separate authorization. Use additive migrations and narrow release switches where a new command changes effective authority.

| Phase | Delivery and dependency | Exit evidence |
| --- | --- | --- |
| O2 ([implemented](O2_IMPLEMENTATION_REPORT.md)) | Shared personal signup with optional organization intent, authenticated resume and safe self-correction for intent-only records. Agree on pilot eligibility architecture first. Establish API/SQL guards for intent writes and isolated translation namespace. | Both entry paths share the same Auth flow; account switches, referral attribution, four profile stages, preference recovery and all four languages verified. |
| O3 | Define scoped founding authority and approve proof methods before enabling Founder Verified. Ship private case handling and consent/appeal, then public projection and capability tests. Reuse existing independent review untouched. The minimum governance grant model must precede the grant endpoint. | Distinct provenance, current MFA, conflict and self-target denials, idempotency, hold/revocation, no high-trust downstream expansion. |
| O4 | Reuse institution model for registration status and authority, enforce identity on every new create/claim path. Can test independent identity first, enable FV parity only if O3 is approved. Plan legacy compatibility and government review before rollout. | Upgrade old rows as unknown registration; test direct API, scoped claims, independent review, directory privacy, no project or poll bypass. |
| O5 | Expand corrections and formal bootstrap/distributed governance after protected dependencies are modeled. Emergency restrictions, recovery record, succession and approval receipts. | Concurrent dependency changes, last eligible admin protection, independent decision and recovery rehearsal. |
| O6 | Early Partner enrollment after operational and policy approval. Limit initial features and evidence scope. | Consent/version, expiry, offboarding, scoped invitations, four-language visibility and trust separation. |
| O7 | End-to-end integration and operational readiness for separately authorized rollout. | Disposable accessibility and Chromium and RLS tests, review access audits, published-policy and privacy regression, rollout/rollback rehearsal. |

For O4, enumerate callers of institution write, read, directory, follow, representative and logo RPCs before migration. Deploy compatible server responses and gated write handlers, then expose the wizard. Keep read-only access to old intents and verified provenance if a rollout is paused. Rollback should disable new actions before restoring a compatible prior application version; never erase case history or silently restore an old ungated create path. Treat grants, partner participation and retained drafts as separate records with approved retention and safe deletion handling.

Read the [architecture](O1_ONBOARDING_ARCHITECTURE.md), [capability matrix](O1_CAPABILITY_MATRIX.md), [threat tests](O1_SECURITY_THREAT_MODEL.md) and [owner approvals](O1_OWNER_DECISION_BRIEF.md) before promotion.
