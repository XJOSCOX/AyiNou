# M2.1 · Unified Moderation Center

## Scope

The center lives in the existing session-bound Platform Administration workspace. It adds a read-only index and links to authorized native workflows. The Accounts section reuses the existing account search, status details and legacy actions. Its Account history button filters the read-only ledger by account ID.

| Section | Coverage |
| --- | --- |
| Moderation overview | Pending reports across supported domains, hidden and removed content, distinct restricted accounts, existing pending content appeals, decisions in the last 30 days, and event/project pending counts. An unavailable value and zero have distinct presentations. |
| Reports | Redacted post/comment, community/group, event, project and impersonation report metadata. Filter by domain, native status, community/group slug and date. Rows retain native IDs and link to original queues. |
| Content moderation | Hidden and removed statuses plus links to the Feed, scoped discussion and other native tools. Existing commands still decide which Hide, Restore, Remove and Dismiss actions are available. |
| Accounts | Existing permitted profile indicators, status, reason, restriction timestamp and actions. Account history uses the A1A account event source. Protected accounts keep existing action restrictions. |
| Active restrictions | Current legacy account sanctions, active provider bans, and event, project and institution holds. The provider expiry comes from Auth. Legacy indefinite restrictions have no fabricated date. Content visibility states appear in Content moderation. |
| Appeals | Existing Feed and comment appeals panel, Trust assignments and impersonation reports, Founder identity cases and an eligible independent review workspace link. Impersonation, event and account sanctions lack a dedicated appeal lane. |
| Moderation history | Paginated A1A-based summaries for account actions, global/scoped post and comment actions, event moderation decisions, project-report decisions and institution restrictions. Filter by domain, action, outcome, dates or community/group slug. Actor identifiers are shown only where the projection allows them. |

[Workspace navigation](../../apps/web/src/lib/admin-navigation.ts) · [Read endpoint](../../apps/api/src/routes/moderation-center.ts) · [SQL projections](../../supabase/migrations/20261123131000_m21_moderation_center_reads.sql) · [A1A contract](../audit/A1A_UNIFIED_EVENT_CONTRACT.md)

## Data model and API

The service-only RPC combines native read projections without adding an enforcement table. The GET endpoint uses bounded pages, validated filters, a stable source reference and the existing audit cursor architecture. Reports and history expose summaries for the listed sources only.

## Permissions and audit

Every projection request checks a verified session and recent MFA. PostgreSQL independently requires live Founder/Administrator authority and authorization for the original session-bound private workspace. Only the service role can execute the read RPC. Platform moderators and scoped community or group staff retain their authorized native queues, with no platform-wide projection or private admin workspace grant. Feed and trust appeals use their existing scopes, assignments and conflict checks. Project and trust summaries apply the native report conflicts. Owner protections, sanction semantics and source decision writers are preserved.

## Privacy and lifecycle

Summary records contain stable native IDs, domain, target type/reference, status, localized action labels and timestamps. Reports omit reporter identity, evidence and content bodies. The projected audit omits written reasons, original content, references to evidence, identity grants and ballots. Existing A1A actor redaction for content is carried into this history. Native verification case and policy history remain in their authorized workspaces. Missing coverage includes poll sanctions, group membership removals, full trust/appeal case history and actor information when the native source or A1A scope withholds it. Event actions cannot be reliably joined to the original report because the native ledger has no report ID. M2.1 does not backfill history.

## Reliability and recovery

The encrypted cursor binds the actor, session, workspace, view, filters and page size. Report/history reads use an as-of cutoff and a maximum 90-day query range. Active restrictions and current content statuses are live projections. A decision made between page requests can change which records are still active. Rate counters and sanitized service diagnostics follow existing A1A practice. The feature creates no additional case evidence or retention store. [Read budget and cursor](../../apps/api/src/routes/audit.ts) · [M1 evidence inventory](M1_AUDIT_AND_EVIDENCE_COVERAGE.md)

## Localization and accessibility

The workspace uses existing theme tokens in light and dark mode, semantic headings, labels, focus behavior and keyboard navigation. All 89 new keys are present in Haitian Creole, French, English and Spanish. The form and record lists adapt to narrow and wide viewports.

## Validation and CI

Local verification passed for shared contracts, all four locale dictionaries, typecheck, lint, engineering standards, production-mode builds and 22 disposable browser tests. Browser scenarios cover recognized Founder, Administrator, platform and scoped moderators, MFA, private workspace ownership, protected accounts, redaction, pagination, source links, translated screens and narrow layouts. Existing A1A and trust regressions exercise independent and private scope boundaries. [Moderation Center browser suite](../../apps/web/e2e/moderation-center.spec.ts)

Local checks cover this phase. GitHub Actions are outside routine validation for this task.

## Documentation and operations

The roadmap links the M1 and M2.1 evidence and the approved future policy baseline. The audit coverage matrix records the projected sources and privacy boundaries.

The additive migration creates only read views, indexes, a guarded read RPC and its execution grants. Preflight the exact migration against the authorized hosted development target before applying it. Application rollback can remove the entry points and leave the additive read projection idle. Native records and evidence stay with their existing retention policies. Hosted deployment and verification are tracked separately from local completion.

## Remaining blockers

The hosted dry run identified only migration `20261123131000_m21_moderation_center_reads` for AyiNou development project `hcbxulyfmdmuyccgrujs`. Targeted authorization was recorded. Application hosting and authenticated hosted UI verification are separate from the database rollout. [Hosted development workflow](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md)
