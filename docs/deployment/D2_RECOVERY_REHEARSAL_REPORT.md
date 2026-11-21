# D2 recovery rehearsal report

Run the isolated fixture from an installed repository.

```sh
npm run test:e2e -- --recovery-rehearsal
```

The runner creates a unique disposable Supabase project on local ports, starts at L6.2A, applies O2–O7 and starts the recovery fixture with only generated local credentials. The fixture checks the generated project name and exact loopback API URL. No production connection is accepted. It restores into a randomly named, fresh database in the same local PostgreSQL cluster. It deletes only that named restore database and the runner removes the disposable stack.

| Test | Result |
| --- | --- |
| Backup structure and integrity | PASS. Created a PostgreSQL custom-format archive and a synthetic Storage object copy, encrypted both in process memory with AES-256-GCM, verified SHA-256 and rejected altered ciphertext before restore. No disk backup artifact, key or CI secret was emitted. |
| Logical restoration | PASS. `pg_restore` applied the archive to the fresh database in a single transaction. All 67 migration versions through O7 reconciled. Roles already existed at cluster scope. |
| Owners, permissions and audit | PASS. Organization ownership, institutional history, project image bytes and a private poll ballot survived. Anonymous and authenticated direct ballot reads were denied, and the service execution grant and RLS flag remained intact. |
| Recovery point and policy | PASS. A post-snapshot synthetic audit write was present on the source and absent from the restore. The existing hold, its event and an unreleased quarantine marker survived. Legal availability remained closed. Newer holds or deletions need independent reconciliation before exposure. |
| Session recovery | PASS at the database boundary. An Auth session row was copied. The test explicitly removed the synthetic session from the restored database and verified it no longer existed. Provider token behavior across a new project and live session rotation were outside this fixture. |
| Storage recovery | PASS for a synthetic member avatar. After deletion, metadata remained in the restored database while the live disposable Storage object was missing. Re-upload through the local Storage API restored the exact WebP bytes. Direct guest and authenticated reads remained denied. The object test used the disposable Storage service, separate from the restored database connection. |
| Provider-level restoration | NOT TESTED. Provider physical backup, separate hosted restore, importing real Storage, cross-cluster global role recreation and full cutover were outside scope. |

The on-disk Node test scripts contain only synthetic fixtures and test instructions. The PostgreSQL dump is held in memory during this small test, so this path does not demonstrate production-size streaming, external key custody, backup retention or RPO/RTO. [Recovery strategy](D2_RECOVERY_STRATEGY.md)
