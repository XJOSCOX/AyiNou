# Founder development migration readiness

## Hosted evidence

A fresh read-only history check on November 21, 2026 found 68 applied migrations through `20261121080000_founder_application_closure.sql`, with no remote-only entries. The exact target is project `hcbxulyfmdmuyccgrujs`, labeled production by the Supabase CLI and designated for development by Ayinou's owner.

The one existing bootstrap singleton and its committed audit match the intended member. Read-only counts showed one Founder case, one pending regular identity application retaining one evidence reference, zero ordinary review rows and zero Founder Verified grants. The earlier closure trigger is present and the supersession ledger is absent, as expected before migration 09. The issuance gate returned false in the stored definition. The ordinary queue RPC remained service-only. Additional aggregate checks found legal publication disabled, zero published policies, no real Early Partner programs, no executed governance proposals and O4 Founder parity disabled. Runtime privacy configuration remains a separate deployment postflight check. No hosted migration was applied, and no rows were reset or deleted during this audit.

The subsequent dry run scheduled exactly the migrations below in order, with no seed or role changes.

1. `20261121090000_founder_supersession_consent.sql` replaces the old automatic closure trigger with explicit, version-bound consent and a restricted ledger.
2. `20261121100000_platform_founder_role.sql` makes trusted bootstrap provenance the authority for platform leadership and keeps other workflows scoped.
3. `20261121110000_reserved_founder_bootstrap.sql` adds controlled reservation and retires the legacy startup RPC. Existing provenance stays authoritative without a new reservation.
4. `20261121120000_founder_release_authorization.sql` closes routine parity and badge projection gaps while preserving grants and historical records.

## Approval and execution

Development rollout may proceed only once the release tests and CI are green, the operator has recorded the backup and recovery checkpoint, and the owner separately approves this exact project and four-file sequence. Confirm the pushed commit and clean migration set again. Capture aggregate baseline counts, the current project backup status and recovery documentation, and the application configuration that keeps each restricted feature closed. Pause on a target, history, schema, or checksum discrepancy. Keep the proof gate closed throughout the operation. Public launch and real issuance are **NO-GO**.

## Postflight

1. Check the remote history lists 72 applied and a new dry run is empty. Verify the private roster helper and updated SQL have expected owners and restricted execute rights. Confirm the original auto-closure trigger is gone and the legacy bootstrap entry point has no API-role execution grants.
2. Recheck the same bootstrap provenance, single Founder, existing role and account records, and the exact before/after application, evidence, review and grant counts. Compare the founding account's platform access with an existing ordinary administrator and an ordinary member using authorized sessions.
3. Check routine project moderation and governance roster using scoped reads. Confirm unassigned verification evidence, ballots, private privacy requests and protected governance remain restricted. Keep private identity and credential values out of deployment logs.
4. Check Founder Verified issuance, O4 Founder parity, Early Partner enrollment, legal publication, protected governance execution and real privacy processing are closed. Rehearse synthetic proof, consent and concurrency only in disposable Supabase.
5. Record the result and recheck API health, authentication, current MFA, organization creation prerequisites, existing records and audit receipt resolution. Halt on any drift and use a forward correction. Restore a backup only under the separately approved disaster procedure because restoring can discard later writes.

The migration transaction can fail without a successful history entry. A deployed regression should be contained at the API if needed and corrected forward. Do not edit applied history, reinstate migration 08's automatic semantics, remove evidence or revoke unrelated accounts.
