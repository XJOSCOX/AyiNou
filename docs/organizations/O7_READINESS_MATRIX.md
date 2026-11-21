# O7 operational readiness

PASS describes verified technical behavior within the stated scope. CONDITIONAL requires specified deployment or operational evidence. BLOCKED requires a separate decision or capability. NOT TESTED has no execution evidence.

| Capability | Decision | Evidence and remaining requirement |
| --- | --- | --- |
| Technical integration | PASS | Disposable O2–O7 tests, receipt and live authorization probes. |
| Hosted database migration | BLOCKED | D1 matched the applied history and rehearsed the pending chain. Usable recovery evidence, Auth readiness and owner authorization are pending. [D1 readiness](../deployment/D1_MIGRATION_READINESS.md) |
| Auth, password recovery and MFA | CONDITIONAL | Disposable email, fresh session, account binding and TOTP pass. Production email delivery and Auth password-rule parity need verification. |
| Organization setup and scoped roles | PASS | Disposable owner creation, private declarations, representative invitation and existing claim workflow. Hosted deployment pending. |
| Independent identity review staffing | CONDITIONAL | Two separate decisions required by SQL. Named eligible reviewer coverage and conflict procedures still need confirmation. |
| Founder Verified operational proof | BLOCKED | Production issuance closed. Independent proof ceremony, custody, correction and appeal approval required. |
| Governance recovery | BLOCKED | Current high-impact execution gate closed. Approved successor and provider-backed recovery rehearsal needed. |
| Early Partner policy and enrollment | BLOCKED | Synthetic entitlement only. Approved terms, scope, operator delegation and public consent rules required. |
| Partner support procedures | BLOCKED | Assign language coverage, private contact, safety escalation and appeals. |
| Legal operator and publication | BLOCKED | Approve legal operator, jurisdiction review, validated policy translations and independent publication evidence. |
| Real privacy requests and records retention | BLOCKED | Approve scope, roles, custody, lifecycle decisions and absence-handling. No final duration assumed. |
| Backup restoration | NOT TESTED | D1 found zero available backups and PITR disabled. A usable recovery point, isolated restore and independent verification are pending. |
| Incident monitoring | CONDITIONAL | Sanitized diagnostics exist. Staffed alert routing and rehearsal still need proof. |
| Production mailbox and email delivery | NOT TESTED | Disposable Mailpit passed. No live recipient or hosted provider test was performed. |
| Invitation-only and 18+ pilot launch controls | BLOCKED | Separate eligibility decisions, proof and tested controls required. |
| O8 or Organization Programs | BLOCKED | Next milestone is deployment authorization and operational decisions before any new approval-dependent product work. |

The owner, infrastructure lead, privacy and trust leads and qualified legal reviewers should be named through the existing readiness decisions. [Deployment runbook](O7_DEPLOYMENT_RUNBOOK.md)
