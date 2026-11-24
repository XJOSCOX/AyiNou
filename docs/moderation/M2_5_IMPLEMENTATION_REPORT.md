# M2.5 Founder Moderation Policies

## Scope

The recognized Founder manages moderation policy in Platform Administration → Settings → Moderation Policies. The existing Account Enforcement, Feature Restrictions, and Moderator Delegation forms read the effective policy. The separate Policy History panel includes M2.5 changes.

| Control | Initial effective value |
| --- | --- |
| Suspension presets | 1 hour, 24 hours, 3 days, 7 days, 30 days and 90 days |
| Administrator duration ceiling | 90 days for temporary account and feature restrictions |
| Delegated Moderator duration ceiling | 7 days, also subject to the individual delegation's limit |
| Suggested term | 60 minutes |
| Delegable capabilities | All previously available ordinary capabilities in the native M2.3 catalog |
| Reason categories | Safety, harassment, spam, integrity and other |
| Repeated-violation guidance | Blank |
| Optional staff reminders | Off |

Presets control suggestions shown in forms. Custom whole-minute durations remain available within the applicable ceiling. Staff guidance is discretionary and creates no automatic sanctions. The optional reminder appears in staff decision forms and never changes the member or appeal notice channels.

## Data model and API

The existing versioned Founder policy model is reused with one private effective policy and one private revision ledger. The mutation records prior and new values, expected revision, actor, reason, timestamp, request identifier and optional restored revision. The existing Policy History endpoint interleaves M2.5 changes with other administrative policy records using its stable cursor. The editor retrieves bounded revision pages and shows the effective value and requested changes before confirmation.

## Permissions and audit

The service-only policy command requires recognized Founder provenance, live administrator eligibility, recent MFA and the original-session private Admin workspace. PostgreSQL validates the command again. Existing native enforcement decisions still check actor, target, capability, resource scope and conflicts independently. A policy trigger validates new enforcement ledger records in the same transaction and records the applicable policy revision. Restoring an earlier value requires a new confirmed decision and appends a revision.

## Privacy and lifecycle

Only eligible enforcement staff can read the operational settings, including guidance. Only the authorized Founder can read change reasons and revision history. Policy history stores policy data and the administrative actor reference. It contains no member sanction evidence, reporter details, ballot material or appeal narratives. Deleted actor references can clear without deleting the policy decision. Existing audit, privacy, retention and legal hold rules continue to apply.

## Localization and accessibility

Haitian Creole, French, English and Spanish cover settings, policy values, dependency messages, confirmations, optional staff reminders and history. The editor uses the existing responsive admin layout, native form semantics, keyboard controls and the standard admin feedback component.

## Reliability and recovery

Policy changes and native commands share the administrative transaction lock. A stale revision fails and a repeated request cannot append another event. Policy revisions constrain new sanctions, extensions and delegation grants or updates. Existing terms, case deadlines, grants and separate restrictions remain intact. Existing grants retain their original ceiling. A policy decrease can restrict future use of a grant. Revocation and M2.4 appeal reversal keep their existing rules and exemptions from new duration and category checks.

## Validation and CI

Disposable coverage is in [the M2.5 integration spec](../../apps/web/e2e/moderation-policy.spec.ts). It exercises Founder and other role boundaries, recent MFA, workspace binding, concurrent writes, historical restoration, future-only enforcement, policy audit and translated responsive views. Local typecheck, lint, production build, shared contracts, translation checks, engineering standards and unit tests passed. Disposable regressions covered M2.2-M2.4, A1A, Founder identity, privacy, organizations, communities, projects, project work, events, and polls. The organization-publishing test now locates an institution by its card heading and still checks the rendered logo. Hosted verification is recorded separately.

## Documentation and operations

The rollout adds only `20261124152000_m25_founder_moderation_policies.sql`. Review exact hosted history, the single pending migration, the initial effective values, approved grants and preserved case data before and after applying it. Use an audited restoration for an unwanted policy value. Any schema correction uses a forward migration and retains the ledger. [Hosted development workflow](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md)

### Hosted rollout verification

On November 24, 2026, the owner authorized the single M2.5 migration for project `hcbxulyfmdmuyccgrujs`. The tested migration from release `afbe7e36ff206d99f0a78937fc73c61b413dd1a3` applied successfully. The follow-up dry run found no pending migrations. Read-only postflight matched the previous account and feature sanction terms, moderator delegations, appeal records, native audit event counts, and Founder and Administrator counts. The policy began at revision 1 with the defaults above. Both decision triggers were active, RLS was enabled, and client policy execution and direct service audit writes were denied.

The rebuilt local API and signed-in Founder browser displayed the hosted revision 1 and the expected effective values. An unauthenticated policy read returned 401. Policy writes were verified on disposable infrastructure.

## Remaining blockers

The hosted database and connected local application passed verification. The production web and API hosting deployment remains a separate release operation.
