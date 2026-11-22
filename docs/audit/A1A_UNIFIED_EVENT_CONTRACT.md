# A1A version 1 event contract

The shared TypeScript `AuditEvent` is a minimal summary. The event reference combines the stable source key and canonical native ID. The native UUID or bigint ID stays a string. `occurredAt` preserves PostgreSQL microseconds and represents the source's server timestamp. `version` is the projection version. `sourceVersion` is the native governance schema version where recorded. Missing metadata is represented by null. Neither system actors nor old success events are inferred from missing fields.

The summary carries a category code, native or allowlisted event code, optional actor UUID, resource type and eligible reference, allowed organization scope, outcome code, optional reason code, previous and new states, request reference and source authorization provenance. The first release exposes old/new handle only on the member's own U1 assignment/change history. The O5 proposal adapter exposes its request ID and Founder authorization when its stored receipt explicitly records that mode. The supported sources do not expose a reason code in this release. `recorded` means the native action exists and is distinct from a success or approval assertion. Structured approval, rejection, revocation, expiry and cancellation are set only where the event clearly establishes them.

`retention: "source_policy"` retains native custody and deletion behavior. `availability: "summary_only"` denotes the redacted projection. De-identification, detachments or deletes in a source are reflected on the next read. No evidence references, raw payloads or free text are serialized. A reference is an identifier and conveys no access to evidence.

## Native adapter identity and lifecycle

| Adapter | Identity and clock | Source lifecycle and missing values |
| --- | --- | --- |
| Platform actions and O5 proposals | Native UUID and `occurred_at` | Account references detach at deletion. Legacy platform actions have no native schema version or request reference. O5 proposal receipts may omit actor or request ID. |
| S2A policy and S2B security | Native bigint or UUID and `occurred_at` | Subject references detach on account deletion. A detached row is omitted from personal history. Optional policy, workspace and session references are excluded even where native rows still exist. |
| U1 username | Native bigint and `occurred_at` | Only current-subject assignment/change. A missing username before assignment stays null. Accounts and actors may detach. |
| Organization roles | Native UUID and `created_at` | The owning organization determines retention and deletion. A missing role ID stays null. Native role state and other account identifiers are redacted. |
| Verification review | Native UUID and `created_at` | Case deletion cascades the decision. A departed reviewer may have no actor reference. |
| General-feed post and comment moderation | Native UUID and `created_at` | Source post/comment deletion cascades the action. Resource access also requires a general-feed source. All linked moderator identities stay redacted. |

Event taxonomy is language neutral. A1B will map category, outcome and known event codes to Haitian Creole, French, English and Spanish labels. A1A uses existing API error codes and does not add UI text. [Shared contract](../../packages/shared/src/audit.ts)
