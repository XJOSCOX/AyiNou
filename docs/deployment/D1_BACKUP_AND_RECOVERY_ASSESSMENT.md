# D1 backup and recovery assessment

**Recovery readiness is BLOCKED.** The Supabase physical backup inventory for Ayinou production `hcbxulyfmdmuyccgrujs` returned zero available backups. PITR reported disabled. WAL-G reported enabled and physical backup metadata was present. Those indicators provide no usable restore point. Neither the effective retention window nor a usable isolated restore target was verified.

Read-only inventory command:

```sh
npx --no-install supabase backups list --remote=hcbxulyfmdmuyccgrujs --output-format json
```

The owner must confirm actual plan entitlements, configured retention, latest recoverable point and any independently managed backups. Record an accepted recovery point objective (RPO), recovery time objective (RTO), available capacity and care for users active after the restore point. Daily backups and PITR have different recovery windows and depend on enabled provider capabilities. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups)

## Ownership and prerequisites

| Role to name | Required evidence |
| --- | --- |
| Release owner | Approve exact project, source revision, approved writers, maintenance window, decision authority and scope. |
| Authorized Supabase recovery operator and alternate | Demonstrate applicable owner/admin or scoped provider access. Identify independently protected credentials, usable backups, restore target, time estimates and escalation path. |
| Storage and security custodian | Identify separately backed up Storage objects and bucket configuration, secrets custody, checksum checks, hold and suppression reconciliation. |
| Independent recovery verifier | Verify restored roles, Auth state, object integrity, review provenance, event and receipt history, and privacy holds before access. |
| Incident lead and application operator | Confirm write isolation, service communication, known-good artifacts and technical stop authority. |

## Restore scope

The supported database clone may transfer database and Auth records. Confirm which authentication settings, credentials, provider integrations, encryption and JWT settings need separate restoration. Storage database metadata does not recover file contents. Inventory bucket settings and objects separately. Do not copy production data into developer environments. A separately approved isolated restoration needs restricted network and role access, disabled email and external hooks, explicit data custody, and a read-only acceptance review before any authorized cutover. [Supabase isolated restore documentation](https://supabase.com/docs/guides/platform/clone-project)

Database restoration can reintroduce prior grants, sessions, deleted content and earlier privacy or evidence-hold state. Plan for forced reauthentication where required, reconciliation of revoked access and privacy suppression, validation of case and audit history, and preservation of changes after the backup. Estimate real downtime from an approved provider rehearsal. D1 inspected the existing provider inventory. Creating a hosted recovery point or restoring production data requires separate authorization.
