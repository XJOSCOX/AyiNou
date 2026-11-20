# Provider-backed restoration rehearsal

**Current result: BLOCKED.** No approved isolated source/target and no approved provider restore plan were supplied. Only fictional marker recovery inside disposable Docker Supabase was exercised. Do not execute this runbook until a separate approval names the projects, operators, source snapshot and exact restore procedure.

## Prerequisites and roles

- The owner and infrastructure lead approve two dedicated, disposable Supabase projects and a synthetic-only data manifest. Record both project refs, provider account, region, source snapshot identifier and expiry, expected schema/migration versions and evidence location. Exclude `hcbxulyfmdmuyccgrujs` and every development, staging or production project containing customer data.
- Provider support or the infrastructure lead verifies that the approved backup tier and recovery method can restore the required database schemas including managed Auth. Record exactly how to provision new API credentials and revoke pre-restore sessions. Record how private Storage objects and their bytes will be copied separately if needed. A database snapshot alone cannot establish object-byte recovery.
- Assign a restore operator, suppression-ledger custodian, independent validation operator and independent release approver. Keep the signing key and ledger outside backup and target. Restrict the identities so their credentials cannot write to ordinary development or production. Provide isolated networking, private operator ingress, no application traffic or egress to external delivery, no SMTP/SMS, no webhooks, no background workers and no public object routes.
- Prepare fictional accounts for active, suppressed and held cases. Seed one verifiable Auth identity per fixture, a case and linked rows, a private object per permitted purpose with a recorded content hash, and a protected ballot/electorate fixture with a before-snapshot tally. Record expected statuses and object presence in a signed fixture manifest. Verify that fixture identifiers and credentials are confined to the rehearsal.
- Record the exact provider-approved restore command or dashboard action, the Storage transfer tool and source/target flags, and a tested ledger replay adapter with dry-run, idempotency and read-back. Approval must name their versions and SHA-256 digests, input files, environment guards and error handling. A missing command, manifest or independent signer blocks the run.

## Enter quarantine and check targets

From the approved operations host, load `AYINOU_RESTORE_SOURCE` and `AYINOU_RESTORE_TARGET` from the signed plan, `PGSERVICE` from the approved restore-target service entry and `AYINOU_NON_REHEARSAL_REFS` from the recorded denylist. Supply the signed-plan refs as parameters. Provider credentials come from the protected operations environment. Never print them.

```powershell
param(
  [Parameter(Mandatory)][string]$ApprovedSource,
  [Parameter(Mandatory)][string]$ApprovedTarget,
  [Parameter(Mandatory)][string]$ApprovedPgService
)

$excludedRefs = @('hcbxulyfmdmuyccgrujs') + ($env:AYINOU_NON_REHEARSAL_REFS -split ',')
if (
  $ApprovedSource -cnotmatch '^[a-z0-9]{20}$' -or
  $ApprovedTarget -cnotmatch '^[a-z0-9]{20}$' -or
  $ApprovedTarget -ceq $ApprovedSource -or
  $ApprovedSource -in $excludedRefs -or $ApprovedTarget -in $excludedRefs -or
  [string]::IsNullOrWhiteSpace($env:AYINOU_NON_REHEARSAL_REFS) -or
  $env:AYINOU_RESTORE_SOURCE -cne $ApprovedSource -or
  $env:AYINOU_RESTORE_TARGET -cne $ApprovedTarget -or
  $env:PGSERVICE -cne $ApprovedPgService
) { throw 'Restore environment failed the approved-project guard' }
```

This guard checks local inputs. The operator and independent observer must also verify the actual project refs and quarantine configuration in the provider console, the identity returned by the approved service mapping, and the target of each vendor tool. Run the guard and verify actual origin again before restore, object copy, replay and release. Abort if the target is reachable by ordinary application traffic or any provider credential can access an excluded project.

## Restore and reconcile

1. With ingress and delivery disabled, create the provider-supported snapshot of the isolated source. Record provider receipt, timestamp, region and migration list. Place a hold on one fixture and record suppression for another after the snapshot so the ledger is newer than the saved data. Maintain those signed entries outside the target and snapshot.
2. Run the exact provider-approved snapshot restore against the verified target ref. Wait for a completed provider receipt. Confirm connection identity, extensions, migrations, RLS, table grants, function execution privileges, Auth identities and absence of retained live sessions. A control-plane success alone does not clear quarantine.
3. Use the approved private object transfer procedure. Read back authenticated object bytes from the target and compare hashes with the signed fixture manifest. Validate Storage metadata and direct anonymous denial. Reconcile missing, orphaned and extra versions. Never change bucket publicity to copy bytes.
4. Validate the external suppression ledger and fixture manifest signatures with the independently pinned public key. The signer identity, snapshot baseline, sequence range, effective rules, completeness and freshness must match the approved plan. Demonstrate that a missing, altered or truncated ledger prevents replay and release.

   ```powershell
   openssl dgst -sha256 -verify $ApprovedLedgerPublicKey -signature $LedgerSignature $LedgerPath
   if ($LASTEXITCODE -ne 0) { throw 'Ledger signature verification failed' }
   ```

5. Run the signed adapter in dry-run mode against the verified target. Approve its exact fixture resource set. Apply target-scoped suppression and reattach active holds. Query current provider state after any timeout before repeating an operation. Rerun the adapter and compare receipts to prove idempotency. Quarantine remains active for stale scope, unreconciled resources, invalid approval or partial completion.
6. Run the approved counts-only SQL checks in a read-only transaction. The SQL file must include `BEGIN READ ONLY` and `ROLLBACK`, and error on any failed assertion. Record its hash, then execute it using the protected PostgreSQL service entry. Use independent Auth and Storage probes as well.

   ```powershell
   Get-FileHash -LiteralPath $ApprovedChecksSql -Algorithm SHA256
   psql -X --no-password --set=ON_ERROR_STOP=1 --file=$ApprovedChecksSql
   if ($LASTEXITCODE -ne 0) { throw 'Restore SQL evidence failed' }
   ```

7. The independent validator confirms that the suppressed fictional identity cannot sign in or return in a projection, its scoped database rows and bytes have the approved disposition, and the held identity's scoped evidence remains private with valid hold references. Verify unrelated fixtures, accepted vote totals, electorates, private ballot access, provider Auth consistency and bucket access all match the signed manifest. Confirm that all real privacy gates stay disabled and no external delivery occurred.
8. Exercise release denial before reconciliation, with a missing report and when attempted by the restore operator. Release requires a separate signed decision after passing every check. Release applies only to the short-lived fictional target. Preserve counts, hashes, timestamps, redacted receipt identifiers and operator/approver roles. Dispose of the approved rehearsal resources through the separately scoped cleanup procedure.

Stop on unexpected data, an excluded project, failed hash, mismatched identity, exposed ingress or any missing prerequisite. Keep both affected fixtures and evidence quarantined and alert the incident owner. Preserve a redacted failure record and repeat validation from the last known good checkpoint. A failed or incomplete run leaves the provider restore gate blocked. [Operational checks](OPERATIONAL_PRIVACY_READINESS.md)
