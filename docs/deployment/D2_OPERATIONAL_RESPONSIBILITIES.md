# D2 operating responsibilities and objectives

| Role | Status | Required authorization and evidence |
| --- | --- | --- |
| Release owner | Owner authorized six development migrations only. Public release approval pending. | Confirm development versus public scope, commercial decisions, recovery subjects and window, and accept RPO/RTO explicitly. |
| Primary recovery operator | Unassigned | Approved provider and recovery-target permissions, backup decryption and restore permission, documented rehearsal and custody record. |
| Alternate recovery operator | Unassigned | Independently available and tested access to break-glass procedure. |
| Storage/security custodian | Unassigned | Least-privilege source read access, destination controls, key custody, inventory and approved destruction process. |
| Independent recovery verifier | Unassigned | Read-only acceptance access, independent of the restoration operator. Validate integrity, visibility, holds, roles, session and audit consistency. |
| Incident lead | Unassigned | Authority to pause writers, communicate status, record incident evidence, trigger escalation and own the resume decision. |

Record real names and evidence in a restricted operational register. Shared staffing reduces separation and availability. A person operating a restore cannot also supply its independent sign-off. A single operator has no demonstrated alternate coverage.

## Proposed recovery objectives

| Stage | Proposed maximum data loss (RPO) | Proposed recovery time (RTO) | Conditions and cost |
| --- | --- | --- | --- |
| Minimal-cost development | 24 hours | 24 hours | Daily encrypted logical and object checkpoint after authorization. Accept a full day of changes if a failure occurs before the next checkpoint. Lower provider cost, higher manual recovery effort. |
| Controlled private pilot | 4 hours | 8 hours | Verified provider or independent database checkpoint and matching Storage every four hours, staffed recovery and evidence reconciliation. More frequent exports can add compute and transfer load. If available, PITR improves the database component. |
| Future public production | 1 hour | 4 hours | Verified provider PITR, independently controlled copies, object/config checkpoints inside the same hour, access separation and rehearsed cutover. Paid compute, recovery storage, transfer and staffing. Expansion requires scale tests. |

Targets are proposals awaiting owner approval and timed provider-level evidence. The end-to-end RTO includes storage reconciliation, current access/hold review and release approval. Polls, verification and audit can have different recovery obligations and may require an approved data freeze or workflow-specific reconciliation.

## Proposed operating checks

- At every scheduled run, automate freshness, archive integrity, object inventory coverage and receipt checks. Alert on failure, missed intervals, incomplete coverage or warning age beyond the approved RPO. Release an alert only after operator acknowledgment and evidence of recovery.
- Before each scheduled migration and quarterly during operations, rehearse recovery into an approved isolated target, time the process and record post-checkpoint gaps. An independent verifier signs off using scoped evidence. Rehearse again after consequential configuration or schema changes.
- Review approved retention, expiration and key/credential custody monthly and after role changes or incidents. Keep held records excluded from normal expiration. Verify that deletion outcomes do not silently lose evidence or re-expose content.
- Verify contact coverage and alternate access monthly. Route incidents to the owner and incident lead with minimal diagnostics and restricted evidence references. Document who isolates writers, decides forward correction or compatible app rollback and authorizes closure.

There is no deployed production export schedule or staffed monitoring chain evidenced by D2. [S1 continuous maintenance](../standards/CONTINUOUS_MAINTENANCE.md)
