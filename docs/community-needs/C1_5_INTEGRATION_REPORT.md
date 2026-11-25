# C1.5 Community Needs integration

## Scope

C1.5 verifies the existing C1.1–C1.4 workflow and prepares an Ouest-only pilot decision. Intake, private evidence, review, publication and association use their existing APIs, ledgers, scopes and UI. The release adds one database read-pagination repair. Production activation requires a separate release and decision.

## Integrated workflow

| Stage | Existing system and evidence |
| --- | --- |
| Private draft and submission | C1.1 caller-bound drafts and exact revision checks. C1.2 consumes the native submission ledger for a staff queue. |
| Triage, evidence and correction | Founder or authorized administrator assigns scoped triage. A qualified assigned reviewer with a recent authenticator and bound workspace accepts the case, requests clarification and records the evidence finding. The author sees safe feedback and can correct the eligible revision. A separate challenge path binds a timely challenge to the exact adverse finding. |
| Publication and discussion | Only the author requests the exact supported evidence snapshot. A different eligible reviewer decides. The community receives the approved summary with private attribution by default. Discussion uses the existing community audience and moderation rules. |
| Project association | An eligible organizer requests a link to the native proposal revision. The different need author consents and a scoped independent reviewer assesses the connection. Native project submission, preview, approval and publication retain their own rules. The link appears when both resources are visible to the caller. |
| Revocation | Membership and account eligibility are checked on access. Explicit withdrawal, project unpublication or revision changes, and publication invalidation revoke applicable links or remove them from the authorized projection. Private history remains available within its authorized scope. |

The continuous disposable scenario uses the same case from intake through publication and association, including a real member discussion in the disposable room and a separately approved project. Existing focused regressions cover adverse findings, independent challenges, attribution withdrawal, moderation, organization representatives and other lane boundaries. [Test results](C1_5_TEST_RESULTS.md)

## Data model and API

The publication-side association list now orders and paginates by the same project UUID it returns to the API. The migration replaces one existing routine body, keeping its signature, ACL, session/workspace checks, version checks and mutation paths. The project UUID was already part of each authorized response. There are no new roles, grants, data writes, seeds, policies or entry points. [Security findings](C1_5_SECURITY_FINDINGS.md)

## Permissions and audit

Review assignments and transitions stay bound to native scopes, verified session and workspace. The pagination correction is read-only and emits no extra events. Intake, triage, publication, consent, withdrawal and invalidation retain transactional ledgers.

## Privacy and lifecycle

Current membership, native visibility and restricted projections are checked before each page is returned. Neither the private case narrative nor an association ledger ID appears in the directory's project summaries. The production data purpose, retention, legal hold and closure handling still require a separate decision.

## Localization and accessibility

The repair changes which already-authorized results appear when using the existing localized pagination controls. UI compatibility was exercised in Haitian Creole, French, English and Spanish on desktop and mobile.

## Reliability and recovery

The cursor, predicate and ordering use the same stable project ID. A clean response has no cursor at exhaustion. Prefer a reviewed forward repair to protect deployed history, and reconcile access, consent and preservation controls before reopening after any recovery.

## Validation and CI

The linked report separates disposable end-to-end and SQL assertions from connected browser and hosted catalog checks. The local release process uses the repository checks without GitHub Actions. [Test results](C1_5_TEST_RESULTS.md)

## Documentation and operations

Rollout evidence will be recorded in the test results after verification. The existing code has disposable gates only. A review and launch plan describes the separate production activation, reviewer, privacy and recovery work that a live pilot depends on. Hosting requires a verified target and approved deployment procedure. [Pilot readiness](C1_5_PILOT_READINESS.md) · [Reviewer operations](C1_5_REVIEWER_OPERATIONS.md) · [Privacy and retention](C1_5_PRIVACY_AND_RETENTION_GAPS.md) · [Owner decisions](C1_5_OWNER_DECISIONS.md)

## Remaining blockers

A real pilot requires approved production activation, a staffed roster, a vetted help and escalation path, privacy/legal review, tested provider recovery and a matching hosted application release. The Founder decides whether to launch once these requirements are met.
