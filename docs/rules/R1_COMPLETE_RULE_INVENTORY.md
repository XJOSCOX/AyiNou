# R1 complete platform rule inventory

**Audited application revision** `3e03e6d3dbb948a39f49edf6b6b8dbbaf1d0302b` on `main`. At preflight, local HEAD and fetched `origin/main` matched. The hosted development catalog showed 89 applied migrations, ending at `20261122182000`. R1 is a read-only inventory and architecture recommendation.

## Deliverables

- [Audit summary and owner review](R1_AUDIT_SUMMARY.md)
- [Environment variables](R1_ENVIRONMENT_VARIABLE_INVENTORY.md)
- [Hardcoded and effective rules](R1_HARDCODED_POLICY_INVENTORY.md)
- [Role and permission matrix](R1_ROLE_AND_PERMISSION_MATRIX.md)
- [Existing administrative controls](R1_EXISTING_ADMIN_CONTROLS.md)
- [Classification and ownership](R1_POLICY_CLASSIFICATION.md)
- [Source-to-enforcement trace](R1_SOURCE_TO_ENFORCEMENT_MAP.md)
- [Central policy architecture proposal](R1_CENTRAL_POLICY_ARCHITECTURE_PROPOSAL.md)
- [Migration order and verification plan](R1_MIGRATION_DEPENDENCY_PLAN.md)
- [Owner decisions](R1_OWNER_DECISIONS.md)
- [Machine-readable rules, environment, admin controls and SQL declaration history](rule-inventory.json)

## Method and coverage

Enumerate tracked paths with `git ls-files -z`. Catalog UTF-8 files across application, tooling, localization, SQL, CI, tests and docs. Search environment syntax, roles, authentication/MFA, limits and intervals, grants, RLS and lifecycle transitions. Search literal references with `git grep -n -I` and resolve anchors against checked-in lines. Inspect the registered Fastify route inventory and relevant Next.js entries, UI components and client/server guards. Compare ordered migration definitions, moves and renames to a read-only PostgreSQL catalog query restricted to `public`, `private` and `feed_data`. Manually trace the high-impact chains below and the rule-specific sources in the source map.

The exhaustive tracked-text pass is a search census. It is distinct from semantic review of the 94 mapped rules. There were 981 scanned text files and 17 binary assets enumerated, 402 registered route signatures including generated HEAD companions, and 694 tracked migration function declarations. The hosted catalog counted 513 routines (including overloads), 153 tables, RLS enabled on all 153 audited tables and 24 policy rows. Static counts include 29 CREATE POLICY, 118 GRANT, 216 REVOKE and 19 routine rename/schema operations. Current counts do not validate the security of each grant or policy. Binary assets, generated build output, ignored files, third-party source, provider settings, deployment secrets and live case payloads were outside semantic inspection.

| Area | Tracked text files | Audit layer |
| --- | ---: | --- |
| Root and CI | 8 | Agent/engineering standards, workflow/config and test gates |
| Fastify and API tests | 92 | Config, authenticated route inputs, repository/RPC calls and known denials |
| Next.js and Chromium fixtures | 336 | Server routes, workspace entry, forms, visibility and disposable regression flows |
| Localization | 148 | Four locale namespaces, labels and presentation messages |
| Shared packages | 23 | Types, allowlists and contracts |
| Migrations | 89 | Ordered versions, permissions, invariants, routines and ledgers |
| Supabase config and fixtures | 24 | Local provider, RLS-related test fixtures and safety fences |
| Tooling | 61 | Test orchestration, legal checks and guarded operational scripts |
| Prior docs | 200 | Historical intent, audit reports, platform blueprint and constraints |

## Effective enforcement chains

| Chain | Current authority and effective sources | Historical or separate behavior |
| --- | --- | --- |
| Leadership and appointments | Founder provenance derives from bootstrap and platform audit. Current role projection uses the reserved setup migration. F1.1 appointment and O5 commands use the effective independent-eligibility helper introduced by the Founder-direct blue migration. | Ordinary admin assignment does not establish Founder provenance. Protected governance execution, succession and recovery remain separate. |
| Authentication and workspaces | S2A limits absolute lifetime. S2B session and private workflows provide current owner and revocation checks. S2C replaces public workspace resolution and uses the prior implementation for other workflow kinds. | Session expiry and recent TOTP are distinct deadlines. Provider JWT lifetime is a third control. |
| Ordinary verification | Institution review SQL is guarded by the O4 and O5 wrappers. Ordinary decisions require verified reviewer assignment, scoped work, applicable conflict checks and two independent approvals. Current member eligibility and one-pending rules come from the latest limits migration. | Historical review and role functions remain in earlier migrations; use the current public wrapper and its private callees. |
| Founder-direct blue | `public.founder_blue_verification_for_api` verifies trusted Founder, original admin workspace, evidence, expected revision, held/conflicted state and current account. One direct decision issues regular blue on approval; rejection closes with its recorded decision. Distinct audit and independent eligibility preserve downstream boundaries. | The R1 brief describes this as a future design. It is already deployed in hosted development. Proposed configurability of the ordinary threshold has no active registry. |
| Gold | Live Founder workspace, eligible standing issuance policy, one-step member account confirmation, structured Founder attestation and distinct grant. The automatic-closure trigger closes only eligible pending blue. Held/completed records and historical reviews are preserved. | Older versions required member MFA or opt-in application closure; those descriptions and wrappers are historical for these current paths. A gold grant is not a second ordinary vote. |
| Legal, privacy and audit | Legal state and release integrity stay versioned and gated. Privacy returns actor-scoped projections with synthetic-only controls. A1A scopes authorized summary reads including distinct Founder-direct blue events. | API reachability and native ledger existence do not prove legal publication or privacy operational activation. A1A does not expose underlying evidence. |

## Implementation boundaries

The audit covers account management, Founder authority, moderation, verification, organization permissions, communities, projects, polls, programs, legal, privacy, audit and deployment. Unresolved policy and unverified infrastructure are explicitly identified in the catalog. Existing applications, migrations, grants, active policies, local environment settings and untracked user files are unchanged by R1. R2 requires an owner decision.


## R2.1 implementation update

`homepage.community_statistics.enabled` is a global homepage visibility setting. Its reviewed PostgreSQL migration seeds ON. The private Founder administration panel, versioned changes and audit ledger are described in the [R2.1 report](R2_1_PUBLIC_HOMEPAGE_RULES.md). The R1 census numbers above describe the original audited revision. See the [master progress tracker](RULES_AND_PERMISSIONS_MASTER_PLAN.md) for rollout status.
