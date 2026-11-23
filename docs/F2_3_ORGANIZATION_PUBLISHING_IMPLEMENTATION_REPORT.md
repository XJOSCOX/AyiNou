# F2.3 — Organization publishing and social integration

## Scope

An eligible representative can publish a regular post, an official announcement, or a quote as an organization. The organization page has a Posts section with an announcements filter with pinned posts, chronological pagination, and a signed-in composer. Personal publishing uses the existing composer.

## Data model and API

The additive migration adds announcement, pin, and public project references to the existing post table. The organization Posts endpoint supports anonymous and signed-in reads, an announcements filter, and keyset pagination. The existing social post endpoint accepts organization announcements, project links, and organization quotes. A scoped pin endpoint updates versioned display state.

## Permissions and audit

Fastify checks the session and validates inputs. PostgreSQL rechecks active owner, administrator, or editor authority as well as the organization and actor state for publishing and pinning. Original authors must still hold organization publishing authority when editing or deleting organization posts. The restricted organization post ledger stores the organization, representative, post, action, revision, and time. Write events commit with the mutation. Platform moderation keeps its existing ledger.

## Privacy and lifecycle

Public organization projections omit the representative's personal author card. The post carries the organization's verification status. Project projections require a publicly visible project owned by the publishing organization. They exclude private project material and link up to three open opportunities to the existing project work page. Opportunity eligibility and application authorization remain in the project workflow. Audit events omit post content and detach the Auth reference on account deletion.

## Localization and accessibility

English, French, Haitian Creole, and Spanish cover the Posts section, announcement labels, verified organization status, project link validation, and pin actions. Feed cards and native controls reuse the current responsive layout, keyboard behavior, and theme tokens.

## Reliability and recovery

Publication reuses the existing receipt and compares the organization, announcement, project, and quote source on replay. Organization pin changes serialize per organization, use post revisions, and cap at three. Pins disappear when the underlying post is inaccessible and clear when publication state is removed. Pinned posts keep their original timestamps and only sort ahead of other posts on the organization profile.

## Validation and CI

Disposable Supabase applied the full migration chain. Five Chromium cases passed across F2.1, F2.2, and F2.3, including anonymous profile rendering, representative redaction, pin capacity, rejected project references, role loss, and archive behavior. Local typecheck, lint, four-language parity, shared contracts, engineering standards, 53 API tests, client and web tests, and both production builds passed. GitHub was used for source delivery.

## Documentation and operations

The roadmap and audit coverage matrix track the work. Deploy the exact F2.3 migration only after checking the hosted development target and pending history. Recovery is a forward migration that can withdraw the new public RPC grants while preserving posts and audit entries.

## Remaining blockers

The F2.3 implementation does not cover organization-authored comments, replies, reactions, or native reposts, nor follower announcement notifications. Organization quotes and mentions are available. Announcements are selected at publication. Post previews show the public project title, description summary, and open opportunities. Inline project progress and a positive project and volunteer fixture remain to be verified. The restricted organization post ledger is not yet projected into Platform Audit History.

## Hosted development verification

Baseline commit: `8e2a9b3e93b31c6095fe97b59dc6e74bcb11e283`. Publishing commit: `3f1590a0c14cecfb66a6b038b0e6a39e3b7a2661`.

The dry run for project `hcbxulyfmdmuyccgrujs` listed only `20261123100000_f23_organization_publishing.sql`. SHA-256: `1c87a2a7cb53a69d6d4f9efb3334af80bcc4036806ac1c7600df6f067c726711`. The migration applied and the postflight reported 96 applied, zero pending.

The catalog confirmed audit RLS, no direct member audit SELECT, anonymous public timeline execution, and member-only pin execution. A locally started Fastify app using hosted development returned HTTP 200 and an empty result for a nonexistent organization. Real organization writes were verified only in disposable Supabase. No hosted application deployment occurred.
