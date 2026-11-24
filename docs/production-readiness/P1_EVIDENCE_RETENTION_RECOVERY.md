# P1 evidence retention and recovery

| Records | Implemented controls and clocks | Unresolved operational retention |
| --- | --- | --- |
| Moderation reports, verification evidence and appeals | Native scoped reviewer/subject visibility and private records. M2.4 intake deadline is 14 days. Narrative visibility is distinct from general activity history. | Evidence disposition period, operational independent release and scheduled review are unapproved. |
| Account sanctions and native ledgers | A suspension expires at its recorded term. Indefinite bans retain their authorized release path. Expiration is projected separately from historical decisions. | No verified cross-domain audit retention and erasure schedule. |
| Feed media and Storage | Private bucket and actor/case-scoped access. Upload lease is two minutes; unattached images become cleanup candidates after 24 hours. Existing cleanup and evidence checks remain scoped. | Production job cadence, object read-back and provider copy reconciliation require evidence. |
| Privacy export and deleted-member data | The synthetic exporter has a ten-minute artifact window. Lifecycle plans, dependencies, holds and quarantine workflows are rehearsed on fixtures. Ordinary account deletion dependencies and nullable actor references remain part of the source model. | Real retention, deletion and legal hold operations need separate authority, custody and restore reconciliation. |
| Backup copies | Provider listing currently returns zero available backups and PITR disabled. The local logical and Storage rehearsal is independent of that limitation. | Approve RPO/RTO, protected DB and Storage artifacts, separate quarantine and provider-backed restore or independently verified equivalent. |

A technical expiry controls eligibility, access or cleanup candidacy. It does not establish an approved legal retention period. Apply only verified policy versions and scoped legal holds before any deletion. No hosted content was read for the review.

For the next drill, reuse the existing recovery runbook. Approve an isolated synthetic source/target, disable ordinary traffic and delivery, restore database and private Storage separately, validate integrity and RLS, invalidate restored sessions, reconcile newer deletion and hold entries, and require independent release authorization. Record timing, expected data-loss window, points of failure and redacted receipts. The new P1 migration replaces metadata definitions only. It has no recovery-time backfill or cleanup.

[Operational privacy readiness](../privacy/OPERATIONAL_PRIVACY_READINESS.md) · [Retention and holds](../privacy/RETENTION_AND_HOLDS_DESIGN.md) · [Quarantined restore runbook](../privacy/RESTORE_REHEARSAL_RUNBOOK.md) · [Post-media lifecycle](../../supabase/migrations/20261120110000_phase3e_post_media.sql)
