# I1 public launch dependencies

**Decision status** Public launch is blocked on operational evidence and approval. Verified scope includes the main source baseline, prior local/disposable runs and the hosted development database migration. The production web/API edge remains unverified.

| Gate | Evidence required to close | Proposed accountable owner |
| --- | --- | --- |
| Auth and email | Verify real redirect allowlists, sign-up, confirmation, recovery, step-up and account recovery against deployed origins. Check SMTP delivery, sender authentication and escalation for delivery failure. | Release owner and identity operations |
| Legal and privacy | Approve applicable documents, publication dates and representation. Assign intake, review, export, erasure and appeal coverage. | Founder, counsel and privacy lead |
| Evidence retention and erasure | Approve purposes, hold authority, time limits, deletion and export execution, restricted reviewers and reconciliation after restoring backups. Synthetic execution is recorded separately. | Privacy lead and infrastructure |
| Staffing and separation | Name reviewers, independent appeal and incident owners, continuity coverage and access revocation review. Confirm Founder Verified, direct verification and program activation policies before issuance or enrollment. | Founder and moderation operations |
| Recovery | Verify usable database and private Storage recovery points, recovery targets and separate quarantine restoration. Latest provider evidence showed empty restore-point history and PITR disabled. A disposable rehearsal does not establish provider recovery. | Infrastructure and independent release reviewer |
| Deployed application | Verify web and API release SHA, HTTPS origins, CORS, proxy/security headers, credential injection, private caching and rollback against the actual environment. Verify enabled flags and provider settings with evidence that is safe to share. | Release owner |
| Monitoring and incident response | Verify probes, alert routing, ownership, rollback triggers, quotas and a response exercise. | Infrastructure and moderation operations |
| Live poll privacy | Preserve current behavior pending Founder decision on timing, minimum release and existing polls. Exact changes in small elections can reveal choices or participation by inference. | Founder with privacy input |

## P1 reconciliation

- **P1-01 High remains open.** Small-count inference from exact aggregate changes. P1 observed scoped aggregates and no raw ballot disclosure in its tested paths. The approved results policy was not changed. [P1 poll review](../production-readiness/P1_POLL_PRIVACY_REVIEW.md)
- **P1-02 High remains open.** No usable provider recovery point or hosted restore proof was recorded. The disposable database and private Storage rehearsal is evidence for that setup. [Retention and recovery](../production-readiness/P1_EVIDENCE_RETENTION_RECOVERY.md)
- **P1-03 Medium and P1-04 Medium corrections applied to hosted development under separate authorization.** The exact approved SQL was already executed when I1 was read. Postflight showed 130 migrations, none pending and 37 matching preservation checks. Media rechecks account and lease validity. A1A projects proven revisions while ambiguous old rows retain their historical status. [P1 findings](../production-readiness/P1_SECURITY_FINDINGS.md) · [Applied SQL](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql)
- Prior moderation findings remain in the M3 risk register. Code changes and hosted migration receipt do not close staffing, policy or launch decisions. [M3 remaining risks](../moderation/M3_REMAINING_RISKS.md)

[P1 deployment status and environment checks](../production-readiness/P1_DEPLOYMENT_READINESS.md) · [Owner decisions](../production-readiness/P1_OWNER_DECISIONS.md) · [Hosted operating workflow](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md)

## Community Needs pilot

C1.5 records the integrated workflow and a proposed Ouest scope. Live intake, evidence review, publication and association remain closed. Production activation, reviewer staffing, privacy and records policy, support and restore procedures require separate decisions. [Pilot readiness](../community-needs/C1_5_PILOT_READINESS.md) · [Owner decisions](../community-needs/C1_5_OWNER_DECISIONS.md)
