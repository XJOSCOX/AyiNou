# R2.1 Public Homepage Rules

## Scope

The public homepage shows Community Statistics to visitors and signed-in members by default. A recognized Founder can switch visibility in Platform administration → Platform Settings → Homepage. OFF removes the complete section. The dashboard, statistics APIs, suppression rules and other policy domains keep their existing contracts.

## Data model and API

Migration `20261122183000_r21_homepage_community_statistics.sql` adds a private allowlisted boolean setting and an append-only mutation ledger. The deployment seeds `homepage.community_statistics.enabled` at revision 1 and enabled. The homepage endpoint returns only registered, Haiti and diaspora totals, or null. It evaluates the setting and existing aggregate RPC under one database snapshot. Its response is uncached. An unavailable or invalid response leaves the section hidden.

The private GET and PATCH use the existing authenticated Founder session, the original private workspace header and a strict input contract. The current value, revision and update timestamp are projected to the Founder. Writes include an expected revision, a request UUID and an audit reason.

## Permissions and audit

Fastify verifies the live session, recent TOTP and trusted Founder status before the SQL RPC. PostgreSQL independently checks trusted provenance, current actor eligibility, the original-session admin workspace, and input validity. RLS and grants deny direct browser and normal service-role access to the underlying relations. The RPCs are service-only. Every committed change writes old and new values, revision, actual actor, timestamp, reason and request reference in the same transaction. The ledger has no client update or delete path.

## Privacy and lifecycle

Homepage suppression and account exclusions are supplied by the existing `community_stats_v2_for_api` projection. The homepage consumes its three existing display totals with no other fields. Dashboard and existing stats endpoints stay independent. Policy events contain no private stats or member data. Existing operational retention governs administrative audit. No credentials or bootstrap settings enter the panel.

## Localization and accessibility

Haitian Creole, French, English and Spanish control and status copy. Native labelled radio controls, keyboard focus and the existing error feedback and theme tokens apply. The public section retains its responsive grid, display formatting and accessible heading when shown.

## Reliability and recovery

The locked policy row rejects stale revisions and conflicting reuse of request IDs. Exact retries with an authorized session return the original result without another audit event. Same-value write attempts produce a conflict. The public homepage fetch uses no browser caching, clears results on page visibility changes, and rechecks when restored. Policy failure keeps the section hidden. The Founder restores a prior value with a new audited change. Schema rollback, if required, uses a separate forward migration.

## Validation and CI

Disposable tests exercise default ON, revision races, replay, denied non-Founder and copied workspace requests, revoked sessions, both public account states, unsuccessful policy reads, audit state and resuming visibility. API tests cover strict payload and projection handling. Engineering, language, build and browser outcomes are reported for the tested release.

## Documentation and operations

Use Platform Settings → Homepage in the private Founder workspace to select ON or OFF and provide the reason. The value takes effect on fresh public homepage reads. No application deployment is needed for subsequent value changes. See the [master plan](RULES_AND_PERMISSIONS_MASTER_PLAN.md) and the [R1 inventory](R1_COMPLETE_RULE_INVENTORY.md).

## Hosted development verification

The owner authorized the only pending migration for `hcbxulyfmdmuyccgrujs`. All three jobs passed on [release `1ec53fb`](https://github.com/XJOSCOX/AyiNou/actions/runs/45086681416). The exact migration SHA-256 was `f1d45272643d3f8e29910cb24b5dcd12d9833db05cadcfa25f927661dfc8bcbb`.

Postflight confirmed 90 applied migrations and zero pending, default ON at revision 1, RLS on both relations, zero direct grants to browser or service roles, two service-only RPCs, and an empty mutation ledger. The local application using hosted development returned the public homepage and the three-field statistics projection with `Cache-Control: no-store`. The private API denied an anonymous read. OFF and ON writes were verified with disposable Supabase. No hosted toggle was needed to verify the deployment.

Local validation included 53 API tests, 100 Chromium tests, shared and client contracts, translation parity, engineering standards, legal integrity, both production builds and a dependency audit with zero vulnerabilities. The local application uses the upgraded hosted database. A public application release was outside this rollout.

## Remaining blockers

R2.1 hosted development has no remaining blockers. Public application deployment and public launch require their own release decisions.
