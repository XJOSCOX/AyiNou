# Audit event policy

## Record classes

| Class | Purpose and access |
| --- | --- |
| Durable security or business event | A restricted record of a committed material decision or state change. Domain policy determines who may read it. |
| User-visible activity | A subject- or resource-scoped projection, with current permission checks and redacted reasons. An inbox notification is not itself evidence of the decision. |
| Operational diagnostics | Bounded status, latency, route template and correlation data for operators. Keep body, query contents and bearer material out. |
| Security telemetry | Minimized signals for abuse, suspicious denials or access anomalies. Rate-limit and aggregate where useful. Security responders receive finite access, and event loss must have a documented response. |
| Sensitive domain evidence | Separate purpose-bound record for review, holds, verification or ballot handling. A reference to an evidence record conveys no right to inspect it. |

## Required durable events

Record account restrictions, role assignments, bootstrap and privileged recovery. Record material onboarding intent changes, corrections and privileged exceptions. Auth owns its credential/session events. Capture organization creation, claims, ownership and representative changes, roles, invitations, affiliations with governance consequences, and group governance. Record high-impact post/comment lifecycle actions such as moderator hide/restore, removal with open evidence, reports and appeals. For ordinary private edits or reversible reactions, document the lower-risk current-state or activity treatment and the policy for evidence preservation.

Record identity review assignment and decisions, disclosure/revocation and contested claims. Future Founder Verified needs explicit provenance, subject separation, decision, correction and revocation. Record project submission, review, publication, work assignments, volunteer role changes, task/progress decisions and restrictions. Record poll opening, edits to the eligible configuration, nomination decisions, suspension, finalization and decision disposition. Keep individual ballot contents in the protected ballot domain. Record publication availability, release approval and emergency changes separately from any future acceptance receipts.

For privacy intake, access to restricted evidence, exports, holds and lifecycle decisions, store scoped receipt or decision events. Keep case content and export bytes in their restricted stores. For planned Early Partners and Organization Programs, record offer/acceptance, granting/revoking access, material eligibility decisions and actions affecting applicants. Future approved medical referral processing requires a restricted domain event for permission, dispatch, status and revocation. General records may reference an opaque action and outcome only where justified. Never copy health data into a general audit trail.

## Event contract and transaction

A durable event has a stable unique ID, named event type and schema version, server-derived actor or authorized system identity, target type and scoped ID, organization/community/project scope as applicable, server timestamp, action and outcome. Add a structured reason code and restricted reason details where justified, an allowlisted state/version transition, a request or correlation ID, minimal authorization context, relevant policy version and retention class. For services use deployment-bound identities. Use an explicit unavailable marker for absent legacy attributes in read projections. Do not invent or recover them by joining unrestricted personal data.

Commit required success events with the SQL mutation or versioned command receipt. A failed transaction has no success event. Deliberately recorded privileged denials go to bounded security telemetry or a separate authorized decision record after rollback. Common validation/rate-limit failures can remain diagnostic. Multi-step external work needs attempt/outcome records and reconciliation, so there is no success claim before the external action is confirmed. Preserve lineage when correcting any immutable record.

Never log credentials, tokens, raw ballot choices, health records, private evidence, export contents, or unnecessary personal data. Classify each event and define grant scope, retention and permitted export/deletion behavior. Where a policy is unapproved, record the gap and retain supported operational behavior until an authorized lifecycle decision. See [observed coverage](AUDIT_COVERAGE_MATRIX.md).
