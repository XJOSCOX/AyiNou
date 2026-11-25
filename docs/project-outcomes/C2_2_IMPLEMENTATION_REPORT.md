# C2.2 Independent Project Outcome Evidence Review

## Scope

C2.2 extends the private C2.1 Outcome request lifecycle in Project Work. It adds distinct reviewer and coordination workspaces, scoped appointments, assignments, reviewed findings, corrections, and an independent challenge path. An internally approved project or result remains a self-reported project record. Findings describe the released evidence for one exact revision. The public project page and directory receive no finding data.

## Data model and API

The additive [migration](../../supabase/migrations/20261125122000_c22_outcome_evidence_review.sql) creates private authority, workspace, case, revision, release, assignment, finding, challenge, conflict, audit, and fixture relations. A trigger reads C2.1 submission and withdrawal receipts as they occur. It preserves native reports, milestones, metric observations, C1 records and prior C2.1 revisions. A service-only RPC resolves the project from the case and enforces the source revision and evidence manifest. Separate API paths serve member, reviewer, and coordinator projections. The existing Notifications screen has a recipient-only Outcome review section. It links into Project Work or the review workspace without carrying protected evidence or review reasoning.

## Permissions and audit

The existing session, account-standing, verified identity including Founder Verified parity, onboarding, organization roles and project activity authorities remain authoritative. Outcome grants are scoped by department and type. A coordinator sees state and assignment metadata, including recorded oversight actions. An accepted reviewer sees only explicitly released evidence and must open it before making a decision. Founder and administrator roles alone confer no right to findings. Member views omit reviewer identity, conflicts and deliberations. Rate limits use the existing read and Project Work budgets. Successful protected commands and evidence reads record actor, workspace, case, exact version and effects in a private immutable application ledger. Authenticated clients have no direct RPC or relation grants. See the [reviewer policy](C2_2_REVIEWER_POLICY.md) for the operational authorization matrix.

## Privacy and lifecycle

Evidence manifests are made of selected native references and exact entry revisions. Images come from the original restricted project evidence and use no permanent media URL or file duplication. External references are plain text and are never fetched by the platform. Losing assignment, role, identity, valid release, project rights or active source closes evidence access. No new uploads, contact fields or sensitive beneficiary identifiers are collected. Case and evidence history are restricted to their authorized scope. Project execution deletion cascades the linked C2 record and the actor links support native account deletion. Before live operations, privacy owners must approve retention, evidence disclosures, legal holds, export, erasure and incident handling.

## Localization and accessibility

The Project Work outcome panel, project review workspace, link in Platform Administration, and saved notices use shared project navigation and theme tokens. Haitian Creole, French, English and Spanish use translated labels for actions, stages and determinations. Native forms provide labels, required confirmations and accessible status feedback. Short-lived workspaces reuse the existing in-page MFA challenge.

## Reliability and recovery

All case commands compare the current revision and append a receipt transactionally. Mutations serialize the Outcome review authorization state and pin the existing enforcing account/session and native project scope. Exact request replay returns the original receipt, and a different command on a used key fails. Every finding pins a completed evidence inspection, the accepted assignment and the precise release generation. Corrections open a new review revision and require a new assignment and release. Expired or invalidated assignments can be replaced without touching historical decisions. Keep both fixture gates empty during backup and recovery operations.

## Validation and CI

See [security tests](C2_2_SECURITY_TESTS.md) for the disposable checks and observed role behavior. Routine checks run locally, without GitHub Actions.

## Documentation and operations

Hosted database target is `hcbxulyfmdmuyccgrujs`. Real intake and review remain disabled at the API and database. Only the separately authorized exact migration may be applied after passing a fresh dry run and preservation checks. Next.js and Fastify stay local.

## Remaining blockers

Live C2 requires approved retention, active reviewer and appeal staffing, consent and evidence-release policy, incident recovery, operational monitoring, and a separate activation decision. C2.3 requires a new privacy and public-disclosure policy for consent, revisions, withdrawal, attribution, evidence-redaction, challenge status, and the precise public wording of any claim. International or conflicting project geography has no assigned department scope.
