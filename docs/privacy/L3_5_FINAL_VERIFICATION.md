# L3.5 final privacy verification

Assessment dated November 20, 2026. Baseline `0a69405d779a653848b5be47f3b9782e4ba13966` on `main`. Reviewed the L3.1 architecture, threat model and specifications, the L3.2–L3.4 reports, all 60 migration files for authority and dependency surfaces, the effective schema, the CI workflow and the existing tests. The test candidate came from the committed tree. All 37 unrelated local files matched their previously recorded hashes.

## Readiness decisions

| Area | Decision | Scope and next gate |
| --- | --- | --- |
| A. L3.2 intake engineering | PASS | Disposable allowlisted subjects, owner-scoped receipts and withdrawal, and idempotent transaction history. Human review and real intake require a separate approval. |
| B. L3.3 export engineering | CONDITIONAL | Bounded synthetic JSON generation, authentication, custody and cleanup. Production key lifecycle, retention, allowed categories and external recovery are open. |
| C. L3.4 lifecycle engineering | CONDITIONAL | Versioned dependency planning, independent synthetic holds, reversible markers, retries and simulated quarantine. Indirect dependencies, external stores and provider recovery remain open. |
| D. Production privacy operations | BLOCKED | Approved procedures, staffed roles, key custody, protected evidence and a provider restore rehearsal are required. |
| E. Legal-policy readiness | BLOCKED | Operator, jurisdiction-specific rules, disclosures, notices, lawful processing and policy approvals remain open. |
| F. Public launch | BLOCKED | Requires separately approved policy publication, implemented pilot eligibility, staffing, production infrastructure and operational sign-off. |

## Capabilities and authority

| Capability | Current authority and behavior | Dependency before real use |
| --- | --- | --- |
| Create, list and read | Fastify `/api/v1/me/privacy-requests` validates live identity. Service-only `privacy_case_command_for_api` and `privacy_cases_for_api` recheck session and owner scope. Receipts expose an opaque reference, state, version and dates. | Approved intake contact, identity/agent proof and safe submitted categories. |
| Withdraw, replay and audit | A versioned withdrawal and its append-only application event commit with the idempotency receipt. Conflicting keys and stale new commands fail. Replays return the saved receipt. Claimants read a bounded event projection. | Approved cancellation and post-closure communications, audit retention and independent case staffing. |
| Generate and encrypt | `POST /api/v1/me/privacy-requests/:id/export` delegates to `privacy_export_for_api`. Versioned allowlisted data, manifest and checksums are sealed with AES-256-GCM, an HKDF-derived artifact key and subject/case/artifact/version binding. PostgreSQL holds ciphertext. No export bucket or public URL. | Output field sign-off, key custody and rotation, artifact custody and sizing, held data and approved retention. |
| Download, revoke, expire and clean | `/api/v1/me/privacy-exports/:id/download` requires the original live session and fresh TOTP. Release rechecks the case/source, current proof, expiry and the three-download cap. The subject can revoke using fresh proof from another live session. The cleanup RPC clears eligible ciphertext and preserves safe terminal state. | Approved step-up, retry and reset procedure, monitored cleanup, restore across key versions and disposition proof per store. |
| Plan and confirm | `/api/v1/me/privacy-requests/:id/deletion-*` uses `lifecycle_subject_for_api`. The scoped graph and bounded catalog detect ownership, evidence, third-party discussions, projects, media and voting constraints. Warnings omit private resource identifiers and evidence. Confirmation binds case and plan versions. | Approved closure semantics and succession, complete disposition mapping, independent reconciliation and provider read-back. |
| Place and release holds | `lifecycle_operator_for_api` is service-only and checks separate case-scoped fixture grants, live recent TOTP, conflict rules and resource binding. Each overlapping hold has its own release. | Legal preservation authority, independent duty coverage, review dates and extensions, retention schedule and evidence custody. |
| Execute markers and recover | The operator RPC claims a journal step using a lease, checks the fence before effect and verifies read-back before completion. Effects change fictional markers. Stale plans, holds and ambiguous outcomes block progress pending reconciliation. | A separately approved destructive executor with per-store proof, alerting, recovery and repeated fault drills. |
| Restore quarantine | The operator records synthetic suppression reapplication and requires independent release. An unreconciled marker or incomplete check blocks release. | Isolated provider project, signed external ledger and independently checked Auth, database and object recovery. |

All three gates default to disabled. Synthetic routes require the expected loopback environment, active live-session proof and an explicit database fixture. Lifecycle operator work additionally requires a case-scoped fixture authority. There is no real erasure or retention executor. Withdrawal and ordinary product moderation are separate from closure. Provider cleanup steps in the lifecycle journal change test markers only.

## Effective database and dependency findings

The read-only hosted catalog for `hcbxulyfmdmuyccgrujs` returned 60 migration records, 15 private privacy/lifecycle relations all with RLS and zero direct table grants to `anon`, `authenticated` or `service_role`. Six public privacy RPCs are service-only SECURITY DEFINER functions with an empty search path. The checked-in API schema list exposes `public` and `graphql_public`. The hosted fixture, authority, case, event, artifact, hold and journal tables contained zero rows. The only policy row is synthetic with no retention period, approval record or destruction approval. Three named Storage buckets are private. Ordinary direct ballot reads are denied.

The hosted application catalog reports 269 foreign keys across `public`, `private` and `feed_data`, including 134 direct Auth-user references. This inventory does not resolve indirect references through revisions, audit snapshots, JSON, historical ownership, path-encoded object identity, vendor logs or backups. The planner detects classes of blockers and flags incomplete inventory. It cannot infer deletion order or permission from a cascading foreign key. Project image bytes live in PostgreSQL and need disposition separate from post-media objects. Poll ballots, frozen electorates and published aggregate outcomes are separate records. Review each without disclosing or reconstructing choices.

Case and lifecycle events are protected by revoked table grants and written in the same transaction as the corresponding changes. Replayed commands do not imply a second event. This gives application-level history protection. Database superuser immutability and external custody are separate controls.

No migration, hosted fixture write, active-account mutation or provider restore was performed for L3.5. Provider restore is **BLOCKED** pending isolated-project approval. The next milestone after owner review is L4 policy work. [Test matrix](PRIVACY_SECURITY_TEST_MATRIX.md) · [Operational checklist](OPERATIONAL_PRIVACY_READINESS.md) · [Restore rehearsal](RESTORE_REHEARSAL_RUNBOOK.md) · [Policy gaps](POLICY_IMPLEMENTATION_GAP_REGISTER.md)
